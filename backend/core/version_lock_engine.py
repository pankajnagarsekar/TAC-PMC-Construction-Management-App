"""
PHASE 2: CORE ENGINE HARDENING - VERSION & LOCK ENGINE

Provides:
1. Version tables for WO and PC
2. Full JSON snapshot before modification
3. Version number increment
4. Locked_Flag enforcement
5. Unlock audit logging
6. No hard delete protection
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from typing import Optional, Dict, Any
from bson import ObjectId
import copy
import json
import logging

logger = logging.getLogger(__name__)


class DocumentLockedError(Exception):
    """Raised when trying to modify a locked document"""
    def __init__(self, entity_type: str, entity_id: str):
        self.entity_type = entity_type
        self.entity_id = entity_id
        super().__init__(f"{entity_type} {entity_id} is locked and cannot be modified")


class HardDeleteBlockedError(Exception):
    """Raised when trying to hard delete a financial entity"""
    def __init__(self, entity_type: str, entity_id: str):
        self.entity_type = entity_type
        self.entity_id = entity_id
        super().__init__(
            f"Hard delete of {entity_type} {entity_id} is blocked. "
            f"Use status-based soft disable instead."
        )


class VersionLockEngine:
    """
    Version control and lock enforcement for financial documents.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def check_lock(
        self,
        entity_type: str,
        entity_id: str,
        session=None
    ) -> bool:
        """
        Check if a document is locked.
        
        Args:
            entity_type: 'WORK_ORDER' or 'PAYMENT_CERTIFICATE'
            entity_id: Document ID
            
        Raises:
            DocumentLockedError if locked
            
        Returns:
            True if not locked
        """
        collection = self._get_collection(entity_type)
        
        doc = await collection.find_one(
            {"_id": ObjectId(entity_id)},
            {"locked_flag": 1},
            session=session
        )
        
        if doc and doc.get("locked_flag", False):
            raise DocumentLockedError(entity_type, entity_id)
        
        return True
    
    async def lock_document(
        self,
        entity_type: str,
        entity_id: str,
        user_id: str,
        reason: str,
        session=None
    ):
        """
        Lock a document to prevent further modifications.
        """
        collection = self._get_collection(entity_type)
        
        await collection.update_one(
            {"_id": ObjectId(entity_id)},
            {
                "$set": {
                    "locked_flag": True,
                    "locked_by": user_id,
                    "locked_at": datetime.utcnow(),
                    "lock_reason": reason,
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        logger.info(f"Locked {entity_type} {entity_id} by user {user_id}: {reason}")
    
    async def unlock_document(
        self,
        entity_type: str,
        entity_id: str,
        user_id: str,
        reason: str,
        audit_service,
        organisation_id: str,
        session=None
    ):
        """
        Unlock a document (requires reason and audit logging).
        """
        collection = self._get_collection(entity_type)
        
        # Get current state for audit
        doc = await collection.find_one({"_id": ObjectId(entity_id)}, session=session)
        
        if not doc:
            raise ValueError(f"{entity_type} {entity_id} not found")
        
        await collection.update_one(
            {"_id": ObjectId(entity_id)},
            {
                "$set": {
                    "locked_flag": False,
                    "unlocked_by": user_id,
                    "unlocked_at": datetime.utcnow(),
                    "unlock_reason": reason,
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        # Audit log the unlock event
        await audit_service.log_action(
            organisation_id=organisation_id,
            module_name=entity_type,
            entity_type=entity_type,
            entity_id=entity_id,
            action_type="UNLOCK",
            user_id=user_id,
            old_value={"locked_flag": True},
            new_value={"locked_flag": False, "unlock_reason": reason}
        )
        
        logger.info(f"Unlocked {entity_type} {entity_id} by user {user_id}: {reason}")
    
    async def create_version_snapshot(
        self,
        entity_type: str,
        entity_id: str,
        version_number: int,
        snapshot_data: Dict[str, Any],
        action: str,
        user_id: str,
        session=None
    ):
        """
        Create a version snapshot before modification.
        
        Stores full JSON snapshot in version table.
        """
        version_collection = self._get_version_collection(entity_type)
        
        # Deep copy and clean snapshot
        clean_snapshot = self._clean_snapshot(snapshot_data)
        
        version_doc = {
            "entity_id": entity_id,
            "version_number": version_number,
            "snapshot_data": clean_snapshot,
            "snapshot_json": json.dumps(clean_snapshot, default=str),  # JSON string for immutability
            "action": action,
            "created_by": user_id,
            "created_at": datetime.utcnow()
        }
        
        await version_collection.insert_one(version_doc, session=session)
        logger.info(f"Created version snapshot v{version_number} for {entity_type} {entity_id}")
    
    async def get_version_history(
        self,
        entity_type: str,
        entity_id: str,
        session=None
    ):
        """
        Get all version snapshots for a document.
        """
        version_collection = self._get_version_collection(entity_type)
        
        versions = await version_collection.find(
            {"entity_id": entity_id},
            session=session
        ).sort("version_number", 1).to_list(length=None)
        
        for v in versions:
            v["version_id"] = str(v.pop("_id"))
        
        return versions
    
    def block_hard_delete(self, entity_type: str, entity_id: str):
        """
        Block hard delete - always raises HardDeleteBlockedError.
        Financial entities must use soft disable.
        """
        raise HardDeleteBlockedError(entity_type, entity_id)
    
    def _get_collection(self, entity_type: str):
        """Get the main collection for entity type"""
        mapping = {
            "WORK_ORDER": self.db.work_orders,
            "PAYMENT_CERTIFICATE": self.db.payment_certificates
        }
        return mapping.get(entity_type)
    
    def _get_version_collection(self, entity_type: str):
        """Get the version collection for entity type"""
        mapping = {
            "WORK_ORDER": self.db.work_order_versions,
            "PAYMENT_CERTIFICATE": self.db.payment_certificate_versions
        }
        return mapping.get(entity_type)
    
    def _clean_snapshot(self, data: Dict) -> Dict:
        """Clean snapshot data for storage"""
        clean = copy.deepcopy(data)
        # Remove MongoDB ObjectId
        if "_id" in clean:
            clean["_id"] = str(clean["_id"])
        # Convert datetime objects
        for key, value in clean.items():
            if isinstance(value, datetime):
                clean[key] = value.isoformat()
            elif isinstance(value, ObjectId):
                clean[key] = str(value)
        return clean
