"""
DETERMINISTIC FINANCIAL SERVICE

This service wraps the existing HardenedFinancialEngine to add:
- Idempotency via Operation_ID
- Row-level locking on FinancialAggregate
- Invariant validation inside lock
- Domain event emission after commit

NO changes to existing calculation formulas.
NO changes to business logic.
ONLY adds enforcement layer.
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from decimal import Decimal
from datetime import datetime
from bson import ObjectId, Decimal128
from fastapi import HTTPException, status
from typing import Optional, Dict, Any
import logging
import uuid

from core.financial_determinism import (
    FinancialAggregateManager,
    EntityType,
    OperationType,
    to_decimal,
    to_decimal128,
    domain_events
)
from core.hardened_financial_engine import HardenedFinancialEngine
from core.financial_precision import calculate_wo_values, calculate_pc_values, to_float, round_financial

logger = logging.getLogger(__name__)


class DeterministicFinancialService:
    """
    Deterministic wrapper around HardenedFinancialEngine.
    
    Adds:
    - Idempotency checking
    - FinancialAggregate locking
    - Invariant validation inside transaction
    - Domain event emission after commit
    """
    
    def __init__(self, client: AsyncIOMotorClient, db: AsyncIOMotorDatabase):
        self.client = client
        self.db = db
        self.aggregate_manager = FinancialAggregateManager(client, db)
        self.hardened_engine = HardenedFinancialEngine(client, db)
    
    async def initialize(self):
        """Initialize determinism layer (create indexes)"""
        await self.aggregate_manager.create_indexes()
        logger.info("[DETERMINISM] Service initialized")
    
    # =========================================================================
    # WORK ORDER ISSUE (with deterministic wrapper)
    # =========================================================================
    
    async def issue_work_order(
        self,
        wo_id: str,
        organisation_id: str,
        user_id: str,
        operation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Issue Work Order with deterministic guarantees.
        
        Steps:
        A) Generate/validate operation_id
        B) Check idempotency
        C) Lock FinancialAggregate
        D) Execute issue via hardened engine (inside transaction)
        E) Update aggregate
        F) Record mutation
        G) Emit domain event after commit
        """
        # A) Generate operation_id if not provided
        op_id = operation_id or str(uuid.uuid4())
        
        # B) Check idempotency
        if await self.aggregate_manager.check_idempotency(op_id):
            return {
                "status": "skipped",
                "reason": "idempotent_duplicate",
                "operation_id": op_id
            }
        
        # Get WO details for locking
        wo = await self.db.work_orders.find_one({"_id": ObjectId(wo_id)})
        if not wo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Work Order not found"
            )
        
        project_id = wo["project_id"]
        code_id = wo["code_id"]
        base_amount = to_decimal(wo.get("base_amount", 0))
        
        # Define mutation function
        async def mutation_fn(aggregate, session):
            # Call existing hardened engine issue
            await self.hardened_engine.issue_work_order(
                wo_id=wo_id,
                organisation_id=organisation_id,
                user_id=user_id
            )
            
            # Return delta for aggregate update
            return {
                "committed_value": base_amount  # Add WO amount to committed
            }
        
        # Execute with deterministic wrapper
        result = await self.aggregate_manager.execute_financial_mutation(
            operation_id=op_id,
            project_id=project_id,
            code_id=code_id,
            entity_type=EntityType.WORK_ORDER,
            entity_id=wo_id,
            operation_type=OperationType.WO_ISSUE,
            mutation_fn=mutation_fn,
            event_type="WORK_ORDER_ISSUED",
            event_payload_fn=lambda agg: {"wo_id": wo_id, "document_number": result.get("document_number")}
        )
        
        return result
    
    # =========================================================================
    # WORK ORDER REVISE (with deterministic wrapper)
    # =========================================================================
    
    async def revise_work_order(
        self,
        wo_id: str,
        organisation_id: str,
        user_id: str,
        rate: Optional[float] = None,
        quantity: Optional[float] = None,
        retention_percentage: Optional[float] = None,
        operation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Revise Work Order with deterministic guarantees."""
        op_id = operation_id or str(uuid.uuid4())
        
        if await self.aggregate_manager.check_idempotency(op_id):
            return {
                "status": "skipped",
                "reason": "idempotent_duplicate",
                "operation_id": op_id
            }
        
        # Get current WO
        wo = await self.db.work_orders.find_one({"_id": ObjectId(wo_id)})
        if not wo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Work Order not found"
            )
        
        project_id = wo["project_id"]
        code_id = wo["code_id"]
        old_base_amount = to_decimal(wo.get("base_amount", 0))
        
        # Calculate new amount
        new_rate = rate if rate is not None else wo["rate"]
        new_quantity = quantity if quantity is not None else wo["quantity"]
        new_retention = retention_percentage if retention_percentage is not None else wo["retention_percentage"]
        wo_values = calculate_wo_values(new_rate, new_quantity, new_retention)
        new_base_amount = to_decimal(wo_values.get("base_amount", 0))
        
        delta_committed = new_base_amount - old_base_amount
        
        async def mutation_fn(aggregate, session):
            await self.hardened_engine.revise_work_order(
                wo_id=wo_id,
                organisation_id=organisation_id,
                user_id=user_id,
                rate=rate,
                quantity=quantity,
                retention_percentage=retention_percentage
            )
            return {"committed_value": delta_committed}
        
        result = await self.aggregate_manager.execute_financial_mutation(
            operation_id=op_id,
            project_id=project_id,
            code_id=code_id,
            entity_type=EntityType.WORK_ORDER,
            entity_id=wo_id,
            operation_type=OperationType.WO_REVISE,
            mutation_fn=mutation_fn,
            event_type="WORK_ORDER_REVISED"
        )
        
        return result
    
    # =========================================================================
    # PC CERTIFICATION (with deterministic wrapper)
    # =========================================================================
    
    async def certify_payment_certificate(
        self,
        pc_id: str,
        organisation_id: str,
        user_id: str,
        operation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Certify Payment Certificate with deterministic guarantees."""
        op_id = operation_id or str(uuid.uuid4())
        
        if await self.aggregate_manager.check_idempotency(op_id):
            return {
                "status": "skipped",
                "reason": "idempotent_duplicate",
                "operation_id": op_id
            }
        
        pc = await self.db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
        if not pc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment Certificate not found"
            )
        
        project_id = pc["project_id"]
        code_id = pc["code_id"]
        bill_amount = to_decimal(pc.get("current_bill_amount", 0))
        retention_current = to_decimal(pc.get("retention_current", 0))
        
        async def mutation_fn(aggregate, session):
            await self.hardened_engine.certify_payment_certificate(
                pc_id=pc_id,
                organisation_id=organisation_id,
                user_id=user_id
            )
            return {
                "certified_value": bill_amount,
                "retention_cumulative": retention_current,
                "retention_held": retention_current
            }
        
        result = await self.aggregate_manager.execute_financial_mutation(
            operation_id=op_id,
            project_id=project_id,
            code_id=code_id,
            entity_type=EntityType.PAYMENT_CERTIFICATE,
            entity_id=pc_id,
            operation_type=OperationType.PC_CERTIFY,
            mutation_fn=mutation_fn,
            event_type="PC_CERTIFIED"
        )
        
        return result
    
    # =========================================================================
    # PC REVISION (with deterministic wrapper)
    # =========================================================================
    
    async def revise_payment_certificate(
        self,
        pc_id: str,
        organisation_id: str,
        user_id: str,
        current_bill_amount: Optional[float] = None,
        retention_percentage: Optional[float] = None,
        operation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Revise Payment Certificate with deterministic guarantees."""
        op_id = operation_id or str(uuid.uuid4())
        
        if await self.aggregate_manager.check_idempotency(op_id):
            return {
                "status": "skipped",
                "reason": "idempotent_duplicate",
                "operation_id": op_id
            }
        
        pc = await self.db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
        if not pc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment Certificate not found"
            )
        
        project_id = pc["project_id"]
        code_id = pc["code_id"]
        old_bill = to_decimal(pc.get("current_bill_amount", 0))
        old_retention = to_decimal(pc.get("retention_current", 0))
        
        new_bill = to_decimal(current_bill_amount) if current_bill_amount else old_bill
        new_retention_pct = retention_percentage if retention_percentage is not None else pc.get("retention_percentage", 0)
        
        # Calculate new retention
        pc_values = calculate_pc_values(
            float(new_bill),
            float(pc.get("cumulative_previous_certified", 0)),
            new_retention_pct,
            pc.get("cgst_percentage", 0),
            pc.get("sgst_percentage", 0)
        )
        new_retention = to_decimal(pc_values.get("retention_current", 0))
        
        delta_certified = new_bill - old_bill
        delta_retention = new_retention - old_retention
        
        async def mutation_fn(aggregate, session):
            await self.hardened_engine.revise_payment_certificate(
                pc_id=pc_id,
                organisation_id=organisation_id,
                user_id=user_id,
                current_bill_amount=current_bill_amount,
                retention_percentage=retention_percentage
            )
            return {
                "certified_value": delta_certified,
                "retention_cumulative": delta_retention,
                "retention_held": delta_retention
            }
        
        result = await self.aggregate_manager.execute_financial_mutation(
            operation_id=op_id,
            project_id=project_id,
            code_id=code_id,
            entity_type=EntityType.PAYMENT_CERTIFICATE,
            entity_id=pc_id,
            operation_type=OperationType.PC_REVISE,
            mutation_fn=mutation_fn,
            event_type="PC_REVISED"
        )
        
        return result
    
    # =========================================================================
    # PAYMENT ENTRY (with deterministic wrapper)
    # =========================================================================
    
    async def create_payment(
        self,
        pc_id: str,
        payment_amount: float,
        payment_date: datetime,
        payment_reference: str,
        organisation_id: str,
        user_id: str,
        operation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create Payment with deterministic guarantees."""
        op_id = operation_id or str(uuid.uuid4())
        
        if await self.aggregate_manager.check_idempotency(op_id):
            return {
                "status": "skipped",
                "reason": "idempotent_duplicate",
                "operation_id": op_id
            }
        
        pc = await self.db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
        if not pc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment Certificate not found"
            )
        
        project_id = pc["project_id"]
        code_id = pc["code_id"]
        amount = to_decimal(payment_amount)
        
        async def mutation_fn(aggregate, session):
            await self.hardened_engine.create_payment(
                pc_id=pc_id,
                payment_amount=payment_amount,
                payment_date=payment_date,
                payment_reference=payment_reference,
                organisation_id=organisation_id,
                user_id=user_id
            )
            return {"paid_value": amount}
        
        result = await self.aggregate_manager.execute_financial_mutation(
            operation_id=op_id,
            project_id=project_id,
            code_id=code_id,
            entity_type=EntityType.PAYMENT,
            entity_id=pc_id,  # Reference PC as the parent entity
            operation_type=OperationType.PAYMENT_CREATE,
            mutation_fn=mutation_fn,
            event_type="PAYMENT_CREATED"
        )
        
        return result
    
    # =========================================================================
    # RETENTION RELEASE (with deterministic wrapper)
    # =========================================================================
    
    async def create_retention_release(
        self,
        project_id: str,
        code_id: str,
        vendor_id: str,
        release_amount: float,
        release_date: datetime,
        organisation_id: str,
        user_id: str,
        operation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create Retention Release with deterministic guarantees."""
        op_id = operation_id or str(uuid.uuid4())
        
        if await self.aggregate_manager.check_idempotency(op_id):
            return {
                "status": "skipped",
                "reason": "idempotent_duplicate",
                "operation_id": op_id
            }
        
        amount = to_decimal(release_amount)
        
        async def mutation_fn(aggregate, session):
            await self.hardened_engine.create_retention_release(
                project_id=project_id,
                code_id=code_id,
                vendor_id=vendor_id,
                release_amount=release_amount,
                release_date=release_date,
                organisation_id=organisation_id,
                user_id=user_id
            )
            return {"retention_held": -amount}  # Decrease retention held
        
        # Create entity ID for tracking
        entity_id = f"{project_id}_{code_id}_{vendor_id}"
        
        result = await self.aggregate_manager.execute_financial_mutation(
            operation_id=op_id,
            project_id=project_id,
            code_id=code_id,
            entity_type=EntityType.RETENTION_RELEASE,
            entity_id=entity_id,
            operation_type=OperationType.RETENTION_RELEASE,
            mutation_fn=mutation_fn,
            event_type="RETENTION_RELEASED"
        )
        
        return result
    
    # =========================================================================
    # BUDGET UPDATE (with deterministic wrapper)
    # =========================================================================
    
    async def update_budget(
        self,
        project_id: str,
        code_id: str,
        approved_budget_amount: float,
        organisation_id: str,
        user_id: str,
        operation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update Budget with deterministic guarantees."""
        op_id = operation_id or str(uuid.uuid4())
        
        if await self.aggregate_manager.check_idempotency(op_id):
            return {
                "status": "skipped",
                "reason": "idempotent_duplicate",
                "operation_id": op_id
            }
        
        # Get current budget
        budget = await self.db.project_budgets.find_one({
            "project_id": project_id,
            "code_id": code_id
        })
        
        old_amount = to_decimal(budget.get("approved_budget_amount", 0)) if budget else Decimal('0')
        new_amount = to_decimal(approved_budget_amount)
        delta = new_amount - old_amount
        
        async def mutation_fn(aggregate, session):
            # Update budget in database
            await self.db.project_budgets.update_one(
                {"project_id": project_id, "code_id": code_id},
                {
                    "$set": {
                        "approved_budget_amount": to_decimal128(new_amount),
                        "updated_at": datetime.utcnow(),
                        "updated_by": user_id
                    }
                },
                upsert=True,
                session=session
            )
            
            # Also update the aggregate's approved_budget directly
            await self.db.financial_aggregates.update_one(
                {"project_id": project_id, "code_id": code_id},
                {"$set": {"approved_budget": to_decimal128(new_amount)}},
                session=session
            )
            
            return {"approved_budget": delta}
        
        entity_id = f"{project_id}_{code_id}"
        
        result = await self.aggregate_manager.execute_financial_mutation(
            operation_id=op_id,
            project_id=project_id,
            code_id=code_id,
            entity_type=EntityType.BUDGET,
            entity_id=entity_id,
            operation_type=OperationType.BUDGET_UPDATE,
            mutation_fn=mutation_fn,
            event_type="BUDGET_UPDATED"
        )
        
        return result
    
    # =========================================================================
    # AGGREGATE QUERY (read-only)
    # =========================================================================
    
    async def get_financial_aggregate(
        self,
        project_id: str,
        code_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get current financial aggregate state."""
        aggregate = await self.db.financial_aggregates.find_one({
            "project_id": project_id,
            "code_id": code_id
        })
        
        if aggregate:
            # Convert Decimal128 to float for API response
            return {
                "project_id": aggregate["project_id"],
                "code_id": aggregate["code_id"],
                "approved_budget": float(to_decimal(aggregate.get("approved_budget", 0))),
                "committed_value": float(to_decimal(aggregate.get("committed_value", 0))),
                "certified_value": float(to_decimal(aggregate.get("certified_value", 0))),
                "paid_value": float(to_decimal(aggregate.get("paid_value", 0))),
                "retention_cumulative": float(to_decimal(aggregate.get("retention_cumulative", 0))),
                "retention_held": float(to_decimal(aggregate.get("retention_held", 0))),
                "version": aggregate.get("version", 1),
                "last_reconciled_at": aggregate.get("last_reconciled_at")
            }
        
        return None
