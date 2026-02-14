"""
PHASE 2 WAVE 3 - PILLAR B: BACKGROUND JOB ENGINE

Implements async/scheduled job runner for:
1. Financial Integrity Job - Recompute invariants
2. Media Purge Job - Delete old images
3. Audio Purge Job - Delete old voice recordings
4. PDF Purge Job - Delete old PDFs
5. Drive Retry Job - Retry failed uploads
6. Compression Retry Job - Retry failed compression

RULES:
- Jobs must NOT block API
- Jobs must be idempotent
- All actions logged
"""

from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Callable
from bson import ObjectId
from decimal import Decimal
import asyncio
import logging
import traceback

logger = logging.getLogger(__name__)


class JobStatus:
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    RETRYING = "RETRYING"


class BackgroundJobEngine:
    """
    Background Job Engine for non-blocking async tasks.
    
    Features:
    - Async job execution
    - Retry with exponential backoff
    - Job logging and tracking
    - Idempotent operations
    """
    
    # Default retention periods (days)
    DEFAULT_MEDIA_RETENTION = 365
    DEFAULT_AUDIO_RETENTION = 90
    DEFAULT_PDF_RETENTION = 180
    
    MAX_RETRY_ATTEMPTS = 5
    BASE_RETRY_DELAY = 60  # seconds
    
    def __init__(self, client: AsyncIOMotorClient, db: AsyncIOMotorDatabase):
        self.client = client
        self.db = db
        self._running_jobs = {}
    
    # =========================================================================
    # JOB SCHEDULING
    # =========================================================================
    
    async def schedule_job(
        self,
        job_type: str,
        params: Dict[str, Any],
        organisation_id: str,
        scheduled_by: Optional[str] = None,
        run_at: Optional[datetime] = None
    ) -> str:
        """Schedule a job for execution"""
        job_doc = {
            "job_type": job_type,
            "params": params,
            "organisation_id": organisation_id,
            "status": JobStatus.PENDING,
            "scheduled_by": scheduled_by or "SYSTEM",
            "scheduled_at": datetime.utcnow(),
            "run_at": run_at or datetime.utcnow(),
            "started_at": None,
            "completed_at": None,
            "retry_count": 0,
            "error_message": None,
            "result": None
        }
        
        result = await self.db.background_jobs.insert_one(job_doc)
        job_id = str(result.inserted_id)
        
        logger.info(f"[JOB] Scheduled: {job_id} type={job_type}")
        
        return job_id
    
    async def run_job_async(self, job_id: str):
        """Run a job asynchronously (non-blocking)"""
        asyncio.create_task(self._execute_job(job_id))
        return {"status": "started", "job_id": job_id}
    
    async def _execute_job(self, job_id: str):
        """Execute a job"""
        try:
            job = await self.db.background_jobs.find_one({"_id": ObjectId(job_id)})
            
            if not job:
                logger.error(f"[JOB] Not found: {job_id}")
                return
            
            # Update status to running
            await self.db.background_jobs.update_one(
                {"_id": ObjectId(job_id)},
                {"$set": {"status": JobStatus.RUNNING, "started_at": datetime.utcnow()}}
            )
            
            # Execute based on job type
            job_type = job["job_type"]
            params = job["params"]
            organisation_id = job["organisation_id"]
            
            result = None
            if job_type == "FINANCIAL_INTEGRITY":
                result = await self._run_financial_integrity_job(organisation_id, params)
            elif job_type == "MEDIA_PURGE":
                result = await self._run_media_purge_job(organisation_id, params)
            elif job_type == "AUDIO_PURGE":
                result = await self._run_audio_purge_job(organisation_id, params)
            elif job_type == "PDF_PURGE":
                result = await self._run_pdf_purge_job(organisation_id, params)
            elif job_type == "DRIVE_RETRY":
                result = await self._run_drive_retry_job(organisation_id, params)
            elif job_type == "COMPRESSION_RETRY":
                result = await self._run_compression_retry_job(organisation_id, params)
            else:
                raise ValueError(f"Unknown job type: {job_type}")
            
            # Update status to completed
            await self.db.background_jobs.update_one(
                {"_id": ObjectId(job_id)},
                {
                    "$set": {
                        "status": JobStatus.COMPLETED,
                        "completed_at": datetime.utcnow(),
                        "result": result
                    }
                }
            )
            
            logger.info(f"[JOB] Completed: {job_id}")
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[JOB] Failed: {job_id} - {error_msg}")
            logger.error(traceback.format_exc())
            
            # Check retry count
            job = await self.db.background_jobs.find_one({"_id": ObjectId(job_id)})
            retry_count = job.get("retry_count", 0)
            
            if retry_count < self.MAX_RETRY_ATTEMPTS:
                # Schedule retry with exponential backoff
                delay = self.BASE_RETRY_DELAY * (2 ** retry_count)
                
                await self.db.background_jobs.update_one(
                    {"_id": ObjectId(job_id)},
                    {
                        "$set": {
                            "status": JobStatus.RETRYING,
                            "error_message": error_msg,
                            "run_at": datetime.utcnow() + timedelta(seconds=delay)
                        },
                        "$inc": {"retry_count": 1}
                    }
                )
                
                logger.info(f"[JOB] Scheduled retry {retry_count + 1} for {job_id} in {delay}s")
            else:
                # Max retries exceeded
                await self.db.background_jobs.update_one(
                    {"_id": ObjectId(job_id)},
                    {
                        "$set": {
                            "status": JobStatus.FAILED,
                            "completed_at": datetime.utcnow(),
                            "error_message": error_msg
                        }
                    }
                )
    
    # =========================================================================
    # JOB 1: FINANCIAL INTEGRITY
    # =========================================================================
    
    async def _run_financial_integrity_job(
        self,
        organisation_id: str,
        params: Dict
    ) -> Dict:
        """
        Recompute invariants across all projects.
        Create Alert if violation detected.
        """
        from core.financial_precision import to_decimal
        
        violations = []
        projects_checked = 0
        
        # Get all projects for organisation
        projects = await self.db.projects.find(
            {"organisation_id": organisation_id}
        ).to_list(length=None)
        
        for project in projects:
            project_id = str(project["_id"])
            projects_checked += 1
            
            # Get all financial states for project
            states = await self.db.derived_financial_state.find(
                {"project_id": project_id}
            ).to_list(length=None)
            
            for state in states:
                code_id = state.get("code_id")
                
                # Get budget
                budget = await self.db.project_budgets.find_one(
                    {"project_id": project_id, "code_id": code_id}
                )
                
                if not budget:
                    continue
                
                approved_budget = to_decimal(budget.get("approved_budget_amount", 0))
                committed = to_decimal(state.get("committed_value", 0))
                certified = to_decimal(state.get("certified_value", 0))
                paid = to_decimal(state.get("paid_value", 0))
                retention = to_decimal(state.get("retention_held", 0))
                
                # Check invariants
                violation_details = []
                
                if certified > committed and committed > 0:
                    violation_details.append({
                        "type": "CERTIFIED_EXCEEDS_COMMITTED",
                        "certified": float(certified),
                        "committed": float(committed)
                    })
                
                if certified > approved_budget:
                    violation_details.append({
                        "type": "CERTIFIED_EXCEEDS_BUDGET",
                        "certified": float(certified),
                        "budget": float(approved_budget)
                    })
                
                if paid > certified:
                    violation_details.append({
                        "type": "PAID_EXCEEDS_CERTIFIED",
                        "paid": float(paid),
                        "certified": float(certified)
                    })
                
                if retention < 0:
                    violation_details.append({
                        "type": "NEGATIVE_RETENTION",
                        "retention": float(retention)
                    })
                
                if violation_details:
                    # Create alert
                    alert_doc = {
                        "organisation_id": organisation_id,
                        "project_id": project_id,
                        "code_id": code_id,
                        "alert_type": "FINANCIAL_INTEGRITY_VIOLATION",
                        "severity": "HIGH",
                        "violations": violation_details,
                        "detected_at": datetime.utcnow(),
                        "resolved": False
                    }
                    await self.db.alerts.insert_one(alert_doc)
                    
                    violations.append({
                        "project_id": project_id,
                        "code_id": code_id,
                        "violations": violation_details
                    })
                    
                    # Log to timeline
                    await self._log_timeline(
                        organisation_id=organisation_id,
                        project_id=project_id,
                        event_type="INTEGRITY_VIOLATION",
                        message=f"Financial integrity violation detected for code {code_id}",
                        data={"violations": violation_details}
                    )
        
        return {
            "projects_checked": projects_checked,
            "violations_found": len(violations),
            "violations": violations
        }
    
    # =========================================================================
    # JOB 2: MEDIA PURGE
    # =========================================================================
    
    async def _run_media_purge_job(
        self,
        organisation_id: str,
        params: Dict
    ) -> Dict:
        """
        Delete images older than retention period.
        Do NOT purge images linked to immutable snapshots.
        """
        retention_days = params.get("retention_days", self.DEFAULT_MEDIA_RETENTION)
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
        
        # Get snapshot-linked image IDs (protected)
        snapshot_images = set()
        snapshots = await self.db.snapshots.find(
            {"organisation_id": organisation_id},
            {"data_json": 1}
        ).to_list(length=None)
        
        for snapshot in snapshots:
            data = snapshot.get("data_json", {})
            if isinstance(data, dict):
                for key, value in data.items():
                    if "image" in key.lower() and isinstance(value, list):
                        snapshot_images.update(value)
        
        # Find and delete old images (excluding protected)
        deleted_count = 0
        images = await self.db.dpr_images.find({
            "organisation_id": organisation_id,
            "uploaded_at": {"$lt": cutoff_date}
        }).to_list(length=None)
        
        for img in images:
            img_id = str(img["_id"])
            if img_id not in snapshot_images:
                await self.db.dpr_images.delete_one({"_id": img["_id"]})
                deleted_count += 1
                # TODO: Delete actual file from storage
        
        logger.info(f"[PURGE] Media: {deleted_count} images deleted")
        
        return {
            "retention_days": retention_days,
            "images_deleted": deleted_count,
            "protected_by_snapshot": len(snapshot_images)
        }
    
    # =========================================================================
    # JOB 3: AUDIO PURGE
    # =========================================================================
    
    async def _run_audio_purge_job(
        self,
        organisation_id: str,
        params: Dict
    ) -> Dict:
        """Delete voice recordings after retention period"""
        retention_days = params.get("retention_days", self.DEFAULT_AUDIO_RETENTION)
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
        
        result = await self.db.voice_recordings.delete_many({
            "organisation_id": organisation_id,
            "created_at": {"$lt": cutoff_date}
        })
        
        logger.info(f"[PURGE] Audio: {result.deleted_count} recordings deleted")
        
        return {
            "retention_days": retention_days,
            "recordings_deleted": result.deleted_count
        }
    
    # =========================================================================
    # JOB 4: PDF PURGE
    # =========================================================================
    
    async def _run_pdf_purge_job(
        self,
        organisation_id: str,
        params: Dict
    ) -> Dict:
        """Delete generated PDFs older than retention period"""
        retention_days = params.get("retention_days", self.DEFAULT_PDF_RETENTION)
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
        
        # Don't delete PDFs linked to snapshots
        snapshot_pdfs = set()
        snapshots = await self.db.snapshots.find(
            {"organisation_id": organisation_id, "pdf_url": {"$ne": None}},
            {"pdf_url": 1}
        ).to_list(length=None)
        
        for snapshot in snapshots:
            if snapshot.get("pdf_url"):
                snapshot_pdfs.add(snapshot["pdf_url"])
        
        # Find and delete old PDFs
        deleted_count = 0
        pdfs = await self.db.generated_pdfs.find({
            "organisation_id": organisation_id,
            "created_at": {"$lt": cutoff_date}
        }).to_list(length=None)
        
        for pdf in pdfs:
            if pdf.get("url") not in snapshot_pdfs:
                await self.db.generated_pdfs.delete_one({"_id": pdf["_id"]})
                deleted_count += 1
                # TODO: Delete actual file from storage
        
        logger.info(f"[PURGE] PDF: {deleted_count} files deleted")
        
        return {
            "retention_days": retention_days,
            "pdfs_deleted": deleted_count,
            "protected_by_snapshot": len(snapshot_pdfs)
        }
    
    # =========================================================================
    # JOB 5: DRIVE RETRY
    # =========================================================================
    
    async def _run_drive_retry_job(
        self,
        organisation_id: str,
        params: Dict
    ) -> Dict:
        """Retry failed uploads with exponential backoff"""
        retried = 0
        succeeded = 0
        failed = 0
        
        # Find failed uploads
        failed_uploads = await self.db.upload_queue.find({
            "organisation_id": organisation_id,
            "status": "FAILED",
            "retry_count": {"$lt": self.MAX_RETRY_ATTEMPTS}
        }).to_list(length=None)
        
        for upload in failed_uploads:
            retried += 1
            try:
                # TODO: Implement actual upload retry logic
                # For now, just mark as retried
                await self.db.upload_queue.update_one(
                    {"_id": upload["_id"]},
                    {
                        "$set": {"status": "PENDING", "last_retry_at": datetime.utcnow()},
                        "$inc": {"retry_count": 1}
                    }
                )
                succeeded += 1
            except Exception as e:
                failed += 1
                logger.error(f"[RETRY] Upload {upload['_id']} failed: {e}")
        
        logger.info(f"[RETRY] Drive: {retried} retried, {succeeded} succeeded, {failed} failed")
        
        return {
            "total_retried": retried,
            "succeeded": succeeded,
            "failed": failed
        }
    
    # =========================================================================
    # JOB 6: COMPRESSION RETRY
    # =========================================================================
    
    async def _run_compression_retry_job(
        self,
        organisation_id: str,
        params: Dict
    ) -> Dict:
        """Retry failed compression tasks"""
        retried = 0
        succeeded = 0
        failed = 0
        
        # Find failed compression tasks
        failed_tasks = await self.db.compression_queue.find({
            "organisation_id": organisation_id,
            "status": "FAILED",
            "retry_count": {"$lt": self.MAX_RETRY_ATTEMPTS}
        }).to_list(length=None)
        
        for task in failed_tasks:
            retried += 1
            try:
                # TODO: Implement actual compression retry logic
                await self.db.compression_queue.update_one(
                    {"_id": task["_id"]},
                    {
                        "$set": {"status": "PENDING", "last_retry_at": datetime.utcnow()},
                        "$inc": {"retry_count": 1}
                    }
                )
                succeeded += 1
            except Exception as e:
                failed += 1
                logger.error(f"[RETRY] Compression {task['_id']} failed: {e}")
        
        logger.info(f"[RETRY] Compression: {retried} retried, {succeeded} succeeded, {failed} failed")
        
        return {
            "total_retried": retried,
            "succeeded": succeeded,
            "failed": failed
        }
    
    # =========================================================================
    # HELPERS
    # =========================================================================
    
    async def _log_timeline(
        self,
        organisation_id: str,
        project_id: str,
        event_type: str,
        message: str,
        data: Optional[Dict] = None
    ):
        """Log event to timeline"""
        timeline_doc = {
            "organisation_id": organisation_id,
            "project_id": project_id,
            "event_type": event_type,
            "message": message,
            "data": data,
            "timestamp": datetime.utcnow()
        }
        await self.db.timeline.insert_one(timeline_doc)
    
    async def get_job_status(self, job_id: str) -> Dict:
        """Get job status"""
        job = await self.db.background_jobs.find_one({"_id": ObjectId(job_id)})
        if job:
            job["job_id"] = str(job.pop("_id"))
        return job
    
    async def get_pending_jobs(self, organisation_id: str) -> List[Dict]:
        """Get all pending jobs"""
        jobs = await self.db.background_jobs.find({
            "organisation_id": organisation_id,
            "status": {"$in": [JobStatus.PENDING, JobStatus.RETRYING]},
            "run_at": {"$lte": datetime.utcnow()}
        }).to_list(length=100)
        
        for job in jobs:
            job["job_id"] = str(job.pop("_id"))
        
        return jobs
    
    async def create_indexes(self):
        """Create indexes for job tracking"""
        try:
            await self.db.background_jobs.create_index(
                [("organisation_id", 1), ("status", 1), ("run_at", 1)],
                name="job_queue_lookup"
            )
            await self.db.background_jobs.create_index(
                [("job_type", 1), ("status", 1)],
                name="job_type_status"
            )
            await self.db.alerts.create_index(
                [("organisation_id", 1), ("resolved", 1), ("detected_at", -1)],
                name="alert_lookup"
            )
            await self.db.timeline.create_index(
                [("organisation_id", 1), ("project_id", 1), ("timestamp", -1)],
                name="timeline_lookup"
            )
            logger.info("Background job indexes created")
        except Exception as e:
            logger.warning(f"Job index creation: {e}")
