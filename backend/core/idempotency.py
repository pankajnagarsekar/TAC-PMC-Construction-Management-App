"""
PHASE 5C: IDEMPOTENCY HELPER

Centralizes operation_id handling for all financial write endpoints.

Features:
- Auto-generates operation_id if not provided
- Checks for duplicate operations
- Returns previous success response for duplicates
- No logic duplication across endpoints

Usage:
    from core.idempotency import ensure_idempotent, IdempotencyResult
    
    result = await ensure_idempotent(
        db=db,
        operation_id=request.operation_id,
        entity_type="WORK_ORDER",
        entity_id=wo_id
    )
    
    if result.is_duplicate:
        return result.previous_response
    
    # Proceed with mutation using result.operation_id
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from typing import Optional, Dict, Any
from dataclasses import dataclass
import uuid
import logging

logger = logging.getLogger(__name__)


@dataclass
class IdempotencyResult:
    """Result of idempotency check"""
    operation_id: str
    is_duplicate: bool
    previous_response: Optional[Dict[str, Any]] = None


async def ensure_idempotent(
    db: AsyncIOMotorDatabase,
    operation_id: Optional[str],
    entity_type: str,
    entity_id: str,
    session=None
) -> IdempotencyResult:
    """
    Ensure idempotent operation handling.
    
    Phase 5C: Centralizes operation_id logic for all financial writes.
    
    Args:
        db: MongoDB database instance
        operation_id: Optional operation ID from request (auto-generated if None)
        entity_type: Type of entity (WORK_ORDER, PAYMENT_CERTIFICATE, etc.)
        entity_id: ID of the entity being mutated
        session: Optional MongoDB session for transaction
    
    Returns:
        IdempotencyResult with:
        - operation_id: The operation ID (provided or generated)
        - is_duplicate: True if this operation was already applied
        - previous_response: The stored response if duplicate
    """
    # Auto-generate operation_id if not provided
    op_id = operation_id or str(uuid.uuid4())
    
    # Check if operation already exists
    existing = await db.mutation_operation_logs.find_one(
        {"operation_id": op_id},
        session=session
    )
    
    if existing and existing.get("applied_flag", False):
        logger.info(
            f"[IDEMPOTENT] Duplicate operation detected: {op_id} "
            f"for {entity_type}/{entity_id}"
        )
        
        # Build previous success response
        previous_response = {
            "status": "skipped",
            "reason": "idempotent_duplicate",
            "operation_id": op_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "original_timestamp": existing.get("created_at", "").isoformat() 
                if existing.get("created_at") else None,
            "message": "Operation already applied. Returning cached result."
        }
        
        return IdempotencyResult(
            operation_id=op_id,
            is_duplicate=True,
            previous_response=previous_response
        )
    
    logger.debug(f"[IDEMPOTENT] New operation: {op_id} for {entity_type}/{entity_id}")
    
    return IdempotencyResult(
        operation_id=op_id,
        is_duplicate=False,
        previous_response=None
    )


def get_or_generate_operation_id(operation_id: Optional[str]) -> str:
    """
    Simple helper to get or generate operation_id.
    
    Use this when you just need the ID without the full check.
    
    Args:
        operation_id: Optional operation ID from request
        
    Returns:
        The operation ID (provided or newly generated UUID)
    """
    return operation_id or str(uuid.uuid4())


class IdempotentOperation:
    """
    Context manager for idempotent operations.
    
    Usage:
        async with IdempotentOperation(db, operation_id, "BUDGET", budget_id) as op:
            if op.is_duplicate:
                return op.previous_response
            
            # Perform mutation
            result = await do_mutation()
            
            # Record success
            await op.record_success(result)
    """
    
    def __init__(
        self,
        db: AsyncIOMotorDatabase,
        operation_id: Optional[str],
        entity_type: str,
        entity_id: str
    ):
        self.db = db
        self.operation_id = operation_id or str(uuid.uuid4())
        self.entity_type = entity_type
        self.entity_id = entity_id
        self.is_duplicate = False
        self.previous_response = None
    
    async def __aenter__(self):
        """Check for duplicate on entry"""
        result = await ensure_idempotent(
            db=self.db,
            operation_id=self.operation_id,
            entity_type=self.entity_type,
            entity_id=self.entity_id
        )
        
        self.operation_id = result.operation_id
        self.is_duplicate = result.is_duplicate
        self.previous_response = result.previous_response
        
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """No cleanup needed"""
        pass
    
    async def record_success(self, response: Dict[str, Any] = None):
        """
        Record successful operation completion.
        
        Called after mutation succeeds to mark operation as applied.
        """
        if self.is_duplicate:
            return  # Already recorded
        
        await self.db.mutation_operation_logs.update_one(
            {"operation_id": self.operation_id},
            {
                "$set": {
                    "operation_id": self.operation_id,
                    "entity_type": self.entity_type,
                    "entity_id": self.entity_id,
                    "applied_flag": True,
                    "response_summary": response.get("status") if response else "success",
                    "created_at": datetime.utcnow()
                }
            },
            upsert=True
        )
        
        logger.info(
            f"[IDEMPOTENT] Recorded operation: {self.operation_id} "
            f"for {self.entity_type}/{self.entity_id}"
        )
