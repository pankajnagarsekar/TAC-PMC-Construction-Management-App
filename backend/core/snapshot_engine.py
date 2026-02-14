"""
PHASE 2 WAVE 3 - PILLAR A: SNAPSHOT & REPORT ENGINE

Implements:
- Immutable snapshot collection
- Report rendering from snapshots only
- Checksum verification
- PDF binding to snapshot

RULES:
- Snapshots are IMMUTABLE (no update/delete)
- Reports render ONLY from data_json
- Historical reports never change
"""

from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from datetime import datetime
from typing import Optional, Dict, Any, List
from bson import ObjectId
import hashlib
import json
import logging

logger = logging.getLogger(__name__)


class SnapshotImmutableError(Exception):
    """Raised when trying to modify an immutable snapshot"""
    def __init__(self, snapshot_id: str, action: str):
        super().__init__(f"Snapshot {snapshot_id} is immutable. {action} is blocked.")


class SnapshotNotFoundError(Exception):
    """Raised when snapshot not found"""
    pass


class SnapshotEngine:
    """
    Immutable Snapshot Engine for historical reporting.
    
    Features:
    - Immutable snapshots (no update/delete)
    - Checksum verification
    - Report rendering from data_json only
    - PDF binding to snapshot_id
    """
    
    REPORT_TYPES = [
        "FINANCIAL_SUMMARY",
        "WORK_ORDER_REGISTER",
        "PAYMENT_CERTIFICATE_REGISTER",
        "RETENTION_SUMMARY",
        "BUDGET_UTILIZATION",
        "DPR_DAILY",
        "PROGRESS_REPORT",
        "AUDIT_TRAIL"
    ]
    
    def __init__(self, client: AsyncIOMotorClient, db: AsyncIOMotorDatabase):
        self.client = client
        self.db = db
    
    def _compute_checksum(self, data: Dict) -> str:
        """Compute SHA-256 checksum of data"""
        json_str = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(json_str.encode()).hexdigest()
    
    def _serialize_data(self, data: Any) -> Any:
        """Serialize data for JSON storage"""
        if isinstance(data, ObjectId):
            return str(data)
        elif isinstance(data, datetime):
            return data.isoformat()
        elif isinstance(data, dict):
            return {k: self._serialize_data(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._serialize_data(item) for item in data]
        else:
            return data
    
    # =========================================================================
    # CREATE SNAPSHOT
    # =========================================================================
    
    async def create_snapshot(
        self,
        report_type: str,
        project_id: str,
        organisation_id: str,
        generated_by: str,
        data: Dict[str, Any],
        filters: Optional[Dict] = None,
        session=None
    ) -> str:
        """
        Create an immutable snapshot.
        
        RULES:
        - Snapshot is immediately immutable
        - Checksum computed and stored
        - Audit logged
        """
        if report_type not in self.REPORT_TYPES:
            raise ValueError(f"Invalid report_type: {report_type}. Must be one of {self.REPORT_TYPES}")
        
        # Serialize data
        serialized_data = self._serialize_data(data)
        serialized_filters = self._serialize_data(filters or {})
        
        # Compute checksum
        checksum = self._compute_checksum(serialized_data)
        
        snapshot_doc = {
            "report_type": report_type,
            "project_id": project_id,
            "organisation_id": organisation_id,
            "filters_json": serialized_filters,
            "data_json": serialized_data,
            "generated_by": generated_by,
            "generated_at": datetime.utcnow(),
            "checksum_hash": checksum,
            "immutable_flag": True,
            "pdf_generated": False,
            "pdf_url": None
        }
        
        result = await self.db.snapshots.insert_one(snapshot_doc, session=session)
        snapshot_id = str(result.inserted_id)
        
        # Audit log
        await self._log_audit(
            organisation_id=organisation_id,
            project_id=project_id,
            entity_type="SNAPSHOT",
            entity_id=snapshot_id,
            action="CREATE",
            user_id=generated_by,
            new_value={"report_type": report_type, "checksum": checksum},
            session=session
        )
        
        logger.info(f"[SNAPSHOT] Created: {snapshot_id} type={report_type} checksum={checksum[:16]}...")
        
        return snapshot_id
    
    # =========================================================================
    # GET SNAPSHOT
    # =========================================================================
    
    async def get_snapshot(
        self,
        snapshot_id: str,
        verify_checksum: bool = True,
        session=None
    ) -> Dict[str, Any]:
        """
        Get snapshot by ID.
        
        Optionally verifies checksum integrity.
        """
        snapshot = await self.db.snapshots.find_one(
            {"_id": ObjectId(snapshot_id)},
            session=session
        )
        
        if not snapshot:
            raise SnapshotNotFoundError(f"Snapshot {snapshot_id} not found")
        
        # Verify checksum if requested
        if verify_checksum:
            computed_checksum = self._compute_checksum(snapshot["data_json"])
            if computed_checksum != snapshot["checksum_hash"]:
                logger.error(f"[SNAPSHOT] Checksum mismatch for {snapshot_id}!")
                raise ValueError(f"Snapshot {snapshot_id} checksum verification failed - data may be corrupted")
        
        snapshot["snapshot_id"] = str(snapshot.pop("_id"))
        return snapshot
    
    # =========================================================================
    # RENDER REPORT FROM SNAPSHOT
    # =========================================================================
    
    async def render_report_from_snapshot(
        self,
        snapshot_id: str,
        output_format: str = "json",
        session=None
    ) -> Dict[str, Any]:
        """
        Render report from snapshot data.
        
        RULES:
        - Report renders ONLY from data_json
        - No live data queries
        - Historical data preserved
        """
        snapshot = await self.get_snapshot(snapshot_id, verify_checksum=True, session=session)
        
        report = {
            "snapshot_id": snapshot["snapshot_id"],
            "report_type": snapshot["report_type"],
            "project_id": snapshot["project_id"],
            "generated_at": snapshot["generated_at"],
            "checksum": snapshot["checksum_hash"],
            "filters": snapshot["filters_json"],
            "data": snapshot["data_json"],
            "rendered_at": datetime.utcnow().isoformat(),
            "output_format": output_format
        }
        
        logger.info(f"[SNAPSHOT] Rendered report from {snapshot_id}")
        
        return report
    
    # =========================================================================
    # BIND PDF TO SNAPSHOT
    # =========================================================================
    
    async def bind_pdf_to_snapshot(
        self,
        snapshot_id: str,
        pdf_url: str,
        user_id: str,
        session=None
    ):
        """
        Bind generated PDF URL to snapshot.
        
        This is the ONLY allowed "update" - setting pdf_url once.
        """
        snapshot = await self.db.snapshots.find_one(
            {"_id": ObjectId(snapshot_id)},
            session=session
        )
        
        if not snapshot:
            raise SnapshotNotFoundError(f"Snapshot {snapshot_id} not found")
        
        # Only allow binding PDF once
        if snapshot.get("pdf_generated"):
            raise SnapshotImmutableError(snapshot_id, "PDF already bound")
        
        await self.db.snapshots.update_one(
            {"_id": ObjectId(snapshot_id)},
            {
                "$set": {
                    "pdf_generated": True,
                    "pdf_url": pdf_url,
                    "pdf_bound_at": datetime.utcnow(),
                    "pdf_bound_by": user_id
                }
            },
            session=session
        )
        
        logger.info(f"[SNAPSHOT] PDF bound to {snapshot_id}")
    
    # =========================================================================
    # BLOCK UPDATE/DELETE
    # =========================================================================
    
    async def block_update(self, snapshot_id: str):
        """Block any update attempt on snapshot"""
        raise SnapshotImmutableError(snapshot_id, "UPDATE")
    
    async def block_delete(self, snapshot_id: str):
        """Block any delete attempt on snapshot"""
        raise SnapshotImmutableError(snapshot_id, "DELETE")
    
    # =========================================================================
    # LIST SNAPSHOTS
    # =========================================================================
    
    async def list_snapshots(
        self,
        organisation_id: str,
        project_id: Optional[str] = None,
        report_type: Optional[str] = None,
        limit: int = 100,
        session=None
    ) -> List[Dict]:
        """List snapshots with filters"""
        query = {"organisation_id": organisation_id}
        
        if project_id:
            query["project_id"] = project_id
        if report_type:
            query["report_type"] = report_type
        
        cursor = self.db.snapshots.find(
            query,
            {"data_json": 0}  # Exclude large data field
        ).sort("generated_at", -1).limit(limit)
        
        snapshots = await cursor.to_list(length=limit)
        
        for s in snapshots:
            s["snapshot_id"] = str(s.pop("_id"))
        
        return snapshots
    
    # =========================================================================
    # GENERATE REPORT DATA (then create snapshot)
    # =========================================================================
    
    async def generate_financial_summary_data(
        self,
        project_id: str,
        organisation_id: str,
        session=None
    ) -> Dict:
        """Generate financial summary data for snapshot"""
        
        # Get all financial states for project
        states = await self.db.derived_financial_state.find(
            {"project_id": project_id}
        ).to_list(length=None)
        
        # Get budgets
        budgets = await self.db.project_budgets.find(
            {"project_id": project_id}
        ).to_list(length=None)
        
        # Get work orders summary
        wo_pipeline = [
            {"$match": {"project_id": project_id, "status": {"$in": ["Issued", "Revised"]}}},
            {"$group": {
                "_id": None,
                "total_count": {"$sum": 1},
                "total_base_amount": {"$sum": "$base_amount"}
            }}
        ]
        wo_summary = await self.db.work_orders.aggregate(wo_pipeline).to_list(length=1)
        
        # Get payment certificates summary
        pc_pipeline = [
            {"$match": {"project_id": project_id, "status": {"$in": ["Certified", "Partially Paid", "Fully Paid"]}}},
            {"$group": {
                "_id": None,
                "total_count": {"$sum": 1},
                "total_certified": {"$sum": "$current_bill_amount"}
            }}
        ]
        pc_summary = await self.db.payment_certificates.aggregate(pc_pipeline).to_list(length=1)
        
        data = {
            "project_id": project_id,
            "snapshot_timestamp": datetime.utcnow().isoformat(),
            "financial_states": self._serialize_data(states),
            "budgets": self._serialize_data(budgets),
            "work_order_summary": wo_summary[0] if wo_summary else {},
            "payment_certificate_summary": pc_summary[0] if pc_summary else {},
        }
        
        return data
    
    # =========================================================================
    # HELPER
    # =========================================================================
    
    async def _log_audit(
        self,
        organisation_id: str,
        project_id: str,
        entity_type: str,
        entity_id: str,
        action: str,
        user_id: str,
        old_value: Optional[Dict] = None,
        new_value: Optional[Dict] = None,
        session=None
    ):
        """Log audit entry"""
        audit_doc = {
            "organisation_id": organisation_id,
            "project_id": project_id,
            "module_name": "SNAPSHOT",
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action_type": action,
            "old_value_json": old_value,
            "new_value_json": new_value,
            "user_id": user_id,
            "timestamp": datetime.utcnow()
        }
        await self.db.audit_logs.insert_one(audit_doc, session=session)
    
    # =========================================================================
    # INDEX CREATION
    # =========================================================================
    
    async def create_indexes(self):
        """Create indexes for snapshot collection"""
        try:
            await self.db.snapshots.create_index(
                [("organisation_id", 1), ("project_id", 1), ("report_type", 1)],
                name="snapshot_lookup"
            )
            await self.db.snapshots.create_index(
                [("generated_at", -1)],
                name="snapshot_date"
            )
            await self.db.snapshots.create_index(
                [("checksum_hash", 1)],
                name="snapshot_checksum",
                unique=True
            )
            logger.info("Snapshot indexes created")
        except Exception as e:
            logger.warning(f"Snapshot index creation: {e}")
