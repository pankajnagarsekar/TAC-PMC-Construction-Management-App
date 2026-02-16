"""
PHASE 1: FINANCIAL DETERMINISM FOUNDATION

Implements:
1. FinancialAggregate - Canonical source of truth for financial state
2. MutationOperationLog - Idempotency tracking for all financial mutations
3. Deterministic locking with SELECT FOR UPDATE semantics
4. Invariant validation inside lock
5. Domain event emission after commit only

This module provides the enforcement layer WITHOUT modifying existing formulas.
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from decimal import Decimal
from datetime import datetime
from bson import ObjectId, Decimal128
from fastapi import HTTPException, status
from typing import Optional, Dict, Any, Callable, Awaitable
from enum import Enum
import logging
import uuid

logger = logging.getLogger(__name__)


# =============================================================================
# DECIMAL UTILITIES
# =============================================================================

def to_decimal(value) -> Decimal:
    """Convert any numeric value to Decimal"""
    if isinstance(value, Decimal):
        return value
    if isinstance(value, Decimal128):
        return value.to_decimal()
    if value is None:
        return Decimal('0')
    return Decimal(str(value))


def to_decimal128(value) -> Decimal128:
    """Convert to Decimal128 for MongoDB storage"""
    decimal_value = to_decimal(value).quantize(Decimal('0.01'))
    return Decimal128(decimal_value)


def round_financial(value: Decimal) -> Decimal:
    """Round to 2 decimal places for financial precision"""
    return value.quantize(Decimal('0.01'))


# =============================================================================
# ENUMS
# =============================================================================

class EntityType(str, Enum):
    WORK_ORDER = "WORK_ORDER"
    PAYMENT_CERTIFICATE = "PAYMENT_CERTIFICATE"
    PAYMENT = "PAYMENT"
    RETENTION_RELEASE = "RETENTION_RELEASE"
    BUDGET = "BUDGET"


class OperationType(str, Enum):
    WO_ISSUE = "WO_ISSUE"
    WO_REVISE = "WO_REVISE"
    PC_CERTIFY = "PC_CERTIFY"
    PC_REVISE = "PC_REVISE"
    PAYMENT_CREATE = "PAYMENT_CREATE"
    RETENTION_RELEASE = "RETENTION_RELEASE"
    BUDGET_UPDATE = "BUDGET_UPDATE"


# =============================================================================
# EXCEPTIONS
# =============================================================================

class IdempotentSkipError(Exception):
    """Operation already applied - skip idempotently"""
    def __init__(self, operation_id: str):
        self.operation_id = operation_id
        super().__init__(f"Operation {operation_id} already applied")


class FinancialValidationError(Exception):
    """Financial invariant validation failed"""
    def __init__(self, message: str, details: Dict[str, Any] = None):
        self.message = message
        self.details = details or {}
        super().__init__(message)


class LockAcquisitionError(Exception):
    """Failed to acquire lock on FinancialAggregate"""
    def __init__(self, project_id: str, code_id: str):
        self.project_id = project_id
        self.code_id = code_id
        super().__init__(f"Failed to lock aggregate for project:{project_id}, code:{code_id}")


class PeriodLockedError(Exception):
    """Mutation blocked due to locked accounting period"""
    def __init__(self, mutation_date: datetime, period_start: datetime, period_end: datetime):
        self.mutation_date = mutation_date
        self.period_start = period_start
        self.period_end = period_end
        super().__init__(
            f"Mutation date {mutation_date.strftime('%Y-%m-%d')} falls within locked accounting period "
            f"({period_start.strftime('%Y-%m-%d')} to {period_end.strftime('%Y-%m-%d')})"
        )


# =============================================================================
# DOMAIN EVENTS
# =============================================================================

class DomainEventEmitter:
    """Emit domain events AFTER successful commit only"""
    
    def __init__(self):
        self._pending_events: list = []
        self._handlers: Dict[str, list] = {}
    
    def register_handler(self, event_type: str, handler: Callable):
        """Register a handler for an event type"""
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(handler)
    
    def queue_event(self, event_type: str, payload: Dict[str, Any]):
        """Queue an event to be emitted after commit"""
        self._pending_events.append({
            "event_id": str(uuid.uuid4()),
            "event_type": event_type,
            "payload": payload,
            "timestamp": datetime.utcnow().isoformat()
        })
    
    async def emit_pending(self):
        """Emit all pending events (call AFTER commit)"""
        events_to_emit = self._pending_events.copy()
        self._pending_events.clear()
        
        for event in events_to_emit:
            event_type = event["event_type"]
            handlers = self._handlers.get(event_type, [])
            
            for handler in handlers:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        await handler(event)
                    else:
                        handler(event)
                except Exception as e:
                    logger.error(f"Event handler error: {event_type} - {str(e)}")
            
            logger.info(f"[DOMAIN_EVENT] Emitted: {event_type} - {event['event_id']}")
    
    def clear_pending(self):
        """Clear pending events (call on rollback)"""
        self._pending_events.clear()


import asyncio

# Global event emitter instance
domain_events = DomainEventEmitter()


# =============================================================================
# FINANCIAL AGGREGATE MANAGER
# =============================================================================

class FinancialAggregateManager:
    """
    Manages FinancialAggregate collection with:
    - Row-level locking (optimistic with version check)
    - Idempotency via MutationOperationLog
    - Invariant validation inside lock
    - Domain event emission after commit
    """
    
    COLLECTION_AGGREGATE = "financial_aggregates"
    COLLECTION_MUTATION_LOG = "mutation_operation_logs"
    
    def __init__(self, client: AsyncIOMotorClient, db: AsyncIOMotorDatabase):
        self.client = client
        self.db = db
    
    # =========================================================================
    # INDEX CREATION
    # =========================================================================
    
    async def create_indexes(self):
        """Create required indexes for financial determinism"""
        # FinancialAggregate unique constraint
        await self.db[self.COLLECTION_AGGREGATE].create_index(
            [("project_id", 1), ("code_id", 1)],
            unique=True,
            name="idx_aggregate_project_code_unique"
        )
        
        # MutationOperationLog unique constraint on Operation_ID
        await self.db[self.COLLECTION_MUTATION_LOG].create_index(
            [("operation_id", 1)],
            unique=True,
            name="idx_mutation_operation_id_unique"
        )
        
        # Index for querying mutations by entity
        await self.db[self.COLLECTION_MUTATION_LOG].create_index(
            [("entity_type", 1), ("entity_id", 1)],
            name="idx_mutation_entity"
        )
        
        logger.info("[DETERMINISM] Created financial determinism indexes")
    
    # =========================================================================
    # IDEMPOTENCY CHECK
    # =========================================================================
    
    async def check_idempotency(
        self,
        operation_id: str,
        session=None
    ) -> bool:
        """
        Check if operation was already applied.
        Returns True if operation exists and is applied (should skip).
        """
        existing = await self.db[self.COLLECTION_MUTATION_LOG].find_one(
            {"operation_id": operation_id},
            session=session
        )
        
        if existing and existing.get("applied_flag", False):
            logger.info(f"[IDEMPOTENT] Skipping already applied operation: {operation_id}")
            return True
        
        return False
    
    async def record_mutation(
        self,
        operation_id: str,
        entity_type: EntityType,
        entity_id: str,
        operation_type: OperationType,
        session=None
    ):
        """Record mutation operation as applied"""
        await self.db[self.COLLECTION_MUTATION_LOG].update_one(
            {"operation_id": operation_id},
            {
                "$set": {
                    "operation_id": operation_id,
                    "entity_type": entity_type.value,
                    "entity_id": entity_id,
                    "operation_type": operation_type.value,
                    "applied_flag": True,
                    "created_at": datetime.utcnow()
                }
            },
            upsert=True,
            session=session
        )
    
    # =========================================================================
    # AGGREGATE LOCKING & RETRIEVAL
    # =========================================================================
    
    async def get_or_create_aggregate(
        self,
        project_id: str,
        code_id: str,
        session=None
    ) -> Dict[str, Any]:
        """
        Get or create FinancialAggregate with default values.
        Uses upsert to atomically create if not exists.
        """
        default_aggregate = {
            "project_id": project_id,
            "code_id": code_id,
            "approved_budget": to_decimal128(Decimal('0')),
            "committed_value": to_decimal128(Decimal('0')),
            "certified_value": to_decimal128(Decimal('0')),
            "paid_value": to_decimal128(Decimal('0')),
            "retention_cumulative": to_decimal128(Decimal('0')),
            "retention_held": to_decimal128(Decimal('0')),
            "version": 1,
            "last_reconciled_at": datetime.utcnow(),
            "created_at": datetime.utcnow()
        }
        
        # Upsert with $setOnInsert for initial values
        result = await self.db[self.COLLECTION_AGGREGATE].find_one_and_update(
            {"project_id": project_id, "code_id": code_id},
            {
                "$setOnInsert": default_aggregate
            },
            upsert=True,
            return_document=True,
            session=session
        )
        
        return result
    
    async def lock_aggregate_for_update(
        self,
        project_id: str,
        code_id: str,
        expected_version: Optional[int] = None,
        session=None
    ) -> Dict[str, Any]:
        """
        Lock FinancialAggregate row for update using optimistic locking.
        
        MongoDB doesn't have SELECT FOR UPDATE, so we use:
        1. findOneAndUpdate with version check
        2. Increment a lock_sequence to detect concurrent modifications
        
        Returns the locked document or raises LockAcquisitionError.
        """
        query = {"project_id": project_id, "code_id": code_id}
        
        if expected_version is not None:
            query["version"] = expected_version
        
        # Atomically increment lock_sequence to "claim" the lock
        result = await self.db[self.COLLECTION_AGGREGATE].find_one_and_update(
            query,
            {
                "$inc": {"lock_sequence": 1},
                "$set": {"locked_at": datetime.utcnow()}
            },
            return_document=True,
            session=session
        )
        
        if result is None:
            # Either doesn't exist or version mismatch
            existing = await self.db[self.COLLECTION_AGGREGATE].find_one(
                {"project_id": project_id, "code_id": code_id},
                session=session
            )
            
            if existing is None:
                # Create new aggregate
                result = await self.get_or_create_aggregate(project_id, code_id, session)
                # Try locking again
                result = await self.db[self.COLLECTION_AGGREGATE].find_one_and_update(
                    {"project_id": project_id, "code_id": code_id},
                    {
                        "$inc": {"lock_sequence": 1},
                        "$set": {"locked_at": datetime.utcnow()}
                    },
                    return_document=True,
                    session=session
                )
            else:
                # Version mismatch - concurrent modification
                raise LockAcquisitionError(project_id, code_id)
        
        return result
    
    # =========================================================================
    # INVARIANT VALIDATION
    # =========================================================================
    
    def validate_financial_invariants(
        self,
        aggregate: Dict[str, Any],
        delta: Dict[str, Decimal] = None
    ):
        """
        Validate financial invariants on aggregate (with optional delta applied).
        
        Invariants:
        - Certified_Value ≤ Committed_Value
        - Certified_Value ≤ Approved_Budget
        - Paid_Value ≤ Certified_Value
        - Retention_Held ≥ 0
        """
        # Get current values
        approved_budget = to_decimal(aggregate.get("approved_budget", 0))
        committed_value = to_decimal(aggregate.get("committed_value", 0))
        certified_value = to_decimal(aggregate.get("certified_value", 0))
        paid_value = to_decimal(aggregate.get("paid_value", 0))
        retention_held = to_decimal(aggregate.get("retention_held", 0))
        
        # Apply delta if provided
        if delta:
            approved_budget += delta.get("approved_budget", Decimal('0'))
            committed_value += delta.get("committed_value", Decimal('0'))
            certified_value += delta.get("certified_value", Decimal('0'))
            paid_value += delta.get("paid_value", Decimal('0'))
            retention_held += delta.get("retention_held", Decimal('0'))
        
        violations = []
        
        # Invariant 1: Certified_Value ≤ Committed_Value
        if certified_value > committed_value:
            violations.append({
                "rule": "CERTIFIED_LE_COMMITTED",
                "message": f"Certified value ({certified_value}) cannot exceed committed value ({committed_value})",
                "certified_value": float(certified_value),
                "committed_value": float(committed_value)
            })
        
        # Invariant 2: Certified_Value ≤ Approved_Budget
        if certified_value > approved_budget:
            violations.append({
                "rule": "CERTIFIED_LE_BUDGET",
                "message": f"Certified value ({certified_value}) cannot exceed approved budget ({approved_budget})",
                "certified_value": float(certified_value),
                "approved_budget": float(approved_budget)
            })
        
        # Invariant 3: Paid_Value ≤ Certified_Value
        if paid_value > certified_value:
            violations.append({
                "rule": "PAID_LE_CERTIFIED",
                "message": f"Paid value ({paid_value}) cannot exceed certified value ({certified_value})",
                "paid_value": float(paid_value),
                "certified_value": float(certified_value)
            })
        
        # Invariant 4: Retention_Held ≥ 0
        if retention_held < Decimal('0'):
            violations.append({
                "rule": "RETENTION_NON_NEGATIVE",
                "message": f"Retention held ({retention_held}) cannot be negative",
                "retention_held": float(retention_held)
            })
        
        if violations:
            raise FinancialValidationError(
                message="Financial invariant violations detected",
                details={"violations": violations}
            )
    
    # =========================================================================
    # AGGREGATE UPDATE
    # =========================================================================
    
    async def update_aggregate(
        self,
        project_id: str,
        code_id: str,
        updates: Dict[str, Decimal],
        current_version: int,
        session=None
    ) -> Dict[str, Any]:
        """
        Update aggregate values and increment version.
        Uses version check for optimistic locking.
        """
        set_updates = {}
        
        for key, value in updates.items():
            if isinstance(value, Decimal):
                set_updates[key] = to_decimal128(value)
            else:
                set_updates[key] = value
        
        set_updates["last_reconciled_at"] = datetime.utcnow()
        
        result = await self.db[self.COLLECTION_AGGREGATE].find_one_and_update(
            {
                "project_id": project_id,
                "code_id": code_id,
                "version": current_version
            },
            {
                "$set": set_updates,
                "$inc": {"version": 1}
            },
            return_document=True,
            session=session
        )
        
        if result is None:
            raise LockAcquisitionError(project_id, code_id)
        
        return result
    
    # =========================================================================
    # ACCOUNTING PERIOD ENFORCEMENT (Phase 4B)
    # =========================================================================
    
    async def check_accounting_period_lock(
        self,
        mutation_date: datetime,
        session=None
    ):
        """
        Check if mutation_date falls inside a locked accounting period.
        Raises PeriodLockedError if locked.
        
        Args:
            mutation_date: The date of the financial mutation
            session: MongoDB session for transaction
        
        Raises:
            PeriodLockedError: If mutation_date is in a locked period
        """
        # Normalize to date only (remove time component)
        if isinstance(mutation_date, datetime):
            check_date = mutation_date.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            check_date = datetime.combine(mutation_date, datetime.min.time())
        
        # Find any locked period that contains this date
        locked_period = await self.db.accounting_periods.find_one(
            {
                "start_date": {"$lte": check_date},
                "end_date": {"$gte": check_date},
                "locked_flag": True
            },
            session=session
        )
        
        if locked_period:
            logger.warning(
                f"[PERIOD_LOCK] Mutation blocked: date={check_date.strftime('%Y-%m-%d')} "
                f"falls in locked period {locked_period['start_date']} to {locked_period['end_date']}"
            )
            raise PeriodLockedError(
                mutation_date=check_date,
                period_start=locked_period["start_date"],
                period_end=locked_period["end_date"]
            )
    
    # =========================================================================
    # TRANSACTIONAL MUTATION WRAPPER
    # =========================================================================
    
    async def execute_financial_mutation(
        self,
        operation_id: str,
        project_id: str,
        code_id: str,
        entity_type: EntityType,
        entity_id: str,
        operation_type: OperationType,
        mutation_fn: Callable[[Dict[str, Any], Any], Awaitable[Dict[str, Decimal]]],
        mutation_date: Optional[datetime] = None,
        event_type: str = None,
        event_payload_fn: Callable[[Dict[str, Any]], Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Execute a financial mutation with full determinism guarantees.
        
        Steps:
        A) Check idempotency - skip if already applied
        A.1) Check accounting period lock (Phase 4B)
        B) Start transaction
        C) Lock aggregate row
        D) Execute mutation function (returns delta)
        E) Validate invariants with delta
        F) Update aggregate
        G) Record mutation
        H) Commit
        I) Emit domain event AFTER commit
        
        Args:
            operation_id: UUID for idempotency
            project_id: Project identifier
            code_id: Activity code identifier  
            entity_type: Type of entity being mutated
            entity_id: ID of entity being mutated
            operation_type: Type of operation
            mutation_fn: Async function that performs the mutation and returns delta
            mutation_date: Date of the mutation for period lock check (defaults to now)
            event_type: Optional domain event type to emit after commit
            event_payload_fn: Optional function to build event payload from result
        
        Returns:
            Result dict with mutation outcome
        """
        async with await self.client.start_session() as session:
            try:
                # A) Check idempotency BEFORE transaction
                if await self.check_idempotency(operation_id, session):
                    return {
                        "status": "skipped",
                        "reason": "idempotent_duplicate",
                        "operation_id": operation_id
                    }
                
                # A.1) Phase 4B: Check accounting period lock
                check_date = mutation_date or datetime.utcnow()
                await self.check_accounting_period_lock(check_date, session)
                
                async with session.start_transaction():
                    # C) Lock aggregate row
                    aggregate = await self.lock_aggregate_for_update(
                        project_id, code_id, session=session
                    )
                    
                    current_version = aggregate.get("version", 1)
                    
                    # D) Execute mutation function
                    delta = await mutation_fn(aggregate, session)
                    
                    # E) Validate invariants with delta
                    self.validate_financial_invariants(aggregate, delta)
                    
                    # F) Update aggregate with new values
                    new_values = {}
                    for key in ["approved_budget", "committed_value", "certified_value", 
                               "paid_value", "retention_cumulative", "retention_held"]:
                        current = to_decimal(aggregate.get(key, 0))
                        change = delta.get(key, Decimal('0'))
                        new_values[key] = current + change
                    
                    updated_aggregate = await self.update_aggregate(
                        project_id, code_id, new_values, current_version, session
                    )
                    
                    # G) Record mutation
                    await self.record_mutation(
                        operation_id, entity_type, entity_id, operation_type, session
                    )
                    
                    # Queue domain event (will emit after commit)
                    if event_type:
                        payload = {
                            "operation_id": operation_id,
                            "project_id": project_id,
                            "code_id": code_id,
                            "entity_type": entity_type.value,
                            "entity_id": entity_id,
                            "operation_type": operation_type.value,
                            "new_version": updated_aggregate.get("version"),
                        }
                        if event_payload_fn:
                            payload.update(event_payload_fn(updated_aggregate))
                        domain_events.queue_event(event_type, payload)
                    
                    logger.info(
                        f"[DETERMINISM] Mutation committed: {operation_type.value} "
                        f"project={project_id}, code={code_id}, version={updated_aggregate.get('version')}"
                    )
                    
                    # Transaction commits here
                
                # I) Emit domain events AFTER commit
                await domain_events.emit_pending()
                
                return {
                    "status": "success",
                    "operation_id": operation_id,
                    "entity_id": entity_id,
                    "new_version": updated_aggregate.get("version"),
                    "aggregate": {
                        "committed_value": float(to_decimal(updated_aggregate.get("committed_value", 0))),
                        "certified_value": float(to_decimal(updated_aggregate.get("certified_value", 0))),
                        "paid_value": float(to_decimal(updated_aggregate.get("paid_value", 0))),
                        "retention_held": float(to_decimal(updated_aggregate.get("retention_held", 0))),
                    }
                }
                
            except IdempotentSkipError as e:
                return {
                    "status": "skipped",
                    "reason": "idempotent_duplicate",
                    "operation_id": e.operation_id
                }
            except FinancialValidationError as e:
                domain_events.clear_pending()
                logger.error(f"[DETERMINISM] Validation failed: {e.message}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": e.message, "details": e.details}
                )
            except LockAcquisitionError as e:
                domain_events.clear_pending()
                logger.error(f"[DETERMINISM] Lock failed: project={e.project_id}, code={e.code_id}")
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Concurrent modification detected. Please retry."
                )
            except Exception as e:
                domain_events.clear_pending()
                logger.error(f"[DETERMINISM] Mutation error: {str(e)}")
                raise


# =============================================================================
# MIGRATION SCRIPT
# =============================================================================

async def run_migration(db: AsyncIOMotorDatabase):
    """
    Migration script to create FinancialAggregate and MutationOperationLog collections.
    Safe to run multiple times (idempotent).
    """
    logger.info("[MIGRATION] Starting financial determinism migration...")
    
    # Create collections if they don't exist
    existing_collections = await db.list_collection_names()
    
    if "financial_aggregates" not in existing_collections:
        await db.create_collection("financial_aggregates")
        logger.info("[MIGRATION] Created financial_aggregates collection")
    
    if "mutation_operation_logs" not in existing_collections:
        await db.create_collection("mutation_operation_logs")
        logger.info("[MIGRATION] Created mutation_operation_logs collection")
    
    # Create indexes
    # FinancialAggregate unique constraint
    await db.financial_aggregates.create_index(
        [("project_id", 1), ("code_id", 1)],
        unique=True,
        name="idx_aggregate_project_code_unique"
    )
    
    # MutationOperationLog unique constraint
    await db.mutation_operation_logs.create_index(
        [("operation_id", 1)],
        unique=True,
        name="idx_mutation_operation_id_unique"
    )
    
    # Additional indexes
    await db.mutation_operation_logs.create_index(
        [("entity_type", 1), ("entity_id", 1)],
        name="idx_mutation_entity"
    )
    
    await db.mutation_operation_logs.create_index(
        [("created_at", -1)],
        name="idx_mutation_created_at"
    )
    
    await db.financial_aggregates.create_index(
        [("last_reconciled_at", -1)],
        name="idx_aggregate_reconciled_at"
    )
    
    logger.info("[MIGRATION] Financial determinism migration complete")
    
    return {
        "status": "success",
        "collections_created": ["financial_aggregates", "mutation_operation_logs"],
        "indexes_created": [
            "idx_aggregate_project_code_unique",
            "idx_mutation_operation_id_unique",
            "idx_mutation_entity",
            "idx_mutation_created_at",
            "idx_aggregate_reconciled_at"
        ]
    }
