from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

class AuditService:
    """Service for immutable audit logging"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.audit_logs
    
    async def log_action(
        self,
        organisation_id: str,
        module_name: str,
        entity_type: str,
        entity_id: str,
        action_type: str,
        user_id: str,
        project_id: Optional[str] = None,
        old_value: Optional[Dict[str, Any]] = None,
        new_value: Optional[Dict[str, Any]] = None
    ):
        """Log an action to audit trail (INSERT ONLY)"""
        try:
            audit_entry = {
                "organisation_id": organisation_id,
                "project_id": project_id,
                "module_name": module_name,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "action_type": action_type,
                "old_value_json": old_value,
                "new_value_json": new_value,
                "user_id": user_id,
                "timestamp": datetime.utcnow()
            }
            
            await self.collection.insert_one(audit_entry)
            logger.info(f"Audit log created: {action_type} on {entity_type}:{entity_id} by user:{user_id}")
        except Exception as e:
            # Don't fail the main operation if audit logging fails
            logger.error(f"Failed to create audit log: {str(e)}")
    
    async def get_audit_logs(
        self,
        organisation_id: str,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        project_id: Optional[str] = None,
        limit: int = 100
    ):
        """Retrieve audit logs (READ ONLY)"""
        query = {"organisation_id": organisation_id}
        
        if entity_type:
            query["entity_type"] = entity_type
        if entity_id:
            query["entity_id"] = entity_id
        if project_id:
            query["project_id"] = project_id
        
        cursor = self.collection.find(query).sort("timestamp", -1).limit(limit)
        logs = await cursor.to_list(length=limit)
        
        # Convert ObjectId to string
        for log in logs:
            log["audit_id"] = str(log.pop("_id"))
        
        return logs
