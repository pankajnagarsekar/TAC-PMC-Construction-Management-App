"""
PHASE 2: CORE ENGINE HARDENING - SNAPSHOT REPORT ENGINE

Provides:
1. Immutable snapshot storage
2. Report rendering from snapshot data only
3. Historical report integrity
4. PDF binding to snapshot
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from typing import Optional, Dict, Any, List
from bson import ObjectId
import json
import logging

logger = logging.getLogger(__name__)


class SnapshotImmutabilityError(Exception):
    """Raised when trying to modify an immutable snapshot"""
    pass


class SnapshotReportEngine:
    """
    Immutable snapshot storage and report engine.
    
    Snapshots are IMMUTABLE - once created, they cannot be modified.
    Reports render from snapshot data only to ensure historical accuracy.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def create_snapshot(
        self,
        report_type: str,
        project_id: str,
        filters: Dict[str, Any],
        data: Dict[str, Any],
        generated_by: str,
        session=None
    ) -> str:
        """
        Create an immutable snapshot.
        
        Args:
            report_type: Type of report (FINANCIAL, PROGRESS, DPR, etc.)
            project_id: Associated project
            filters: Filters used to generate the report
            data: Report data (deep copied for immutability)
            generated_by: User who generated the snapshot
            
        Returns:
            Snapshot ID
        """
        # Deep copy data to ensure immutability
        import copy
        immutable_data = copy.deepcopy(data)
        
        # Convert any ObjectIds to strings
        immutable_data = self._serialize_for_storage(immutable_data)
        
        snapshot_doc = {
            "report_type": report_type,
            "project_id": project_id,
            "filters_json": json.dumps(filters, default=str),
            "data_json": json.dumps(immutable_data, default=str),
            "filters": filters,
            "data": immutable_data,
            "generated_by": generated_by,
            "generated_at": datetime.utcnow(),
            "is_immutable": True,
            "pdf_file_id": None,  # Will be set when PDF is generated
            "pdf_generated_at": None
        }
        
        result = await self.db.report_snapshots.insert_one(snapshot_doc, session=session)
        snapshot_id = str(result.inserted_id)
        
        logger.info(f"Created {report_type} snapshot: {snapshot_id}")
        return snapshot_id
    
    async def get_snapshot(
        self,
        snapshot_id: str,
        session=None
    ) -> Optional[Dict]:
        """
        Get a snapshot by ID.
        
        Returns the immutable snapshot data.
        """
        snapshot = await self.db.report_snapshots.find_one(
            {"_id": ObjectId(snapshot_id)},
            session=session
        )
        
        if snapshot:
            snapshot["snapshot_id"] = str(snapshot.pop("_id"))
        
        return snapshot
    
    async def get_snapshots_by_project(
        self,
        project_id: str,
        report_type: Optional[str] = None,
        limit: int = 50,
        session=None
    ) -> List[Dict]:
        """
        Get snapshots for a project.
        """
        query = {"project_id": project_id}
        if report_type:
            query["report_type"] = report_type
        
        snapshots = await self.db.report_snapshots.find(
            query,
            session=session
        ).sort("generated_at", -1).limit(limit).to_list(length=None)
        
        for s in snapshots:
            s["snapshot_id"] = str(s.pop("_id"))
        
        return snapshots
    
    async def bind_pdf_to_snapshot(
        self,
        snapshot_id: str,
        pdf_file_id: str,
        session=None
    ):
        """
        Bind a generated PDF to a snapshot.
        
        This is the ONLY modification allowed on a snapshot.
        """
        await self.db.report_snapshots.update_one(
            {"_id": ObjectId(snapshot_id)},
            {
                "$set": {
                    "pdf_file_id": pdf_file_id,
                    "pdf_generated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        logger.info(f"Bound PDF {pdf_file_id} to snapshot {snapshot_id}")
    
    async def render_report_from_snapshot(
        self,
        snapshot_id: str,
        session=None
    ) -> Dict:
        """
        Render report data from snapshot.
        
        Returns the data_json parsed back to dict.
        This ensures reports always render from stored immutable data.
        """
        snapshot = await self.get_snapshot(snapshot_id, session)
        
        if not snapshot:
            raise ValueError(f"Snapshot {snapshot_id} not found")
        
        # Parse from JSON string for true immutability
        return {
            "snapshot_id": snapshot["snapshot_id"],
            "report_type": snapshot["report_type"],
            "project_id": snapshot["project_id"],
            "filters": json.loads(snapshot["filters_json"]),
            "data": json.loads(snapshot["data_json"]),
            "generated_by": snapshot["generated_by"],
            "generated_at": snapshot["generated_at"],
            "pdf_file_id": snapshot.get("pdf_file_id")
        }
    
    def _serialize_for_storage(self, data: Any) -> Any:
        """Recursively serialize data for storage"""
        if isinstance(data, dict):
            return {k: self._serialize_for_storage(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._serialize_for_storage(item) for item in data]
        elif isinstance(data, ObjectId):
            return str(data)
        elif isinstance(data, datetime):
            return data.isoformat()
        else:
            return data
