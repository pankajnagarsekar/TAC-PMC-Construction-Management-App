"""
PHASE 2 WAVE 3: API ROUTES

Routes for:
- PILLAR A: Snapshot & Report Engine
- PILLAR B: Background Job Engine
- PILLAR C: AI Integration Layer
- PILLAR D: Security Hardening

All routes require authentication.
"""

from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Query, Request
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId, Decimal128
from datetime import datetime
from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field
import logging
import os
import json

from dotenv import load_dotenv
load_dotenv()

from auth import get_current_user
from permissions import PermissionChecker
from core.snapshot_engine import SnapshotEngine, SnapshotImmutableError, SnapshotNotFoundError
from core.background_job_engine import BackgroundJobEngine, JobStatus
from core.ai_service import AIService, AIServiceError
from core.security_hardening import (
    SecurityHardening, 
    OrganisationAccessError, 
    SignedURLExpiredError, 
    SignedURLInvalidError
)

logger = logging.getLogger(__name__)


def serialize_mongo_doc(obj: Any) -> Any:
    """Recursively serialize MongoDB objects for JSON response"""
    if isinstance(obj, ObjectId):
        return str(obj)
    elif isinstance(obj, Decimal128):
        return float(obj.to_decimal())
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, dict):
        return {k: serialize_mongo_doc(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [serialize_mongo_doc(item) for item in obj]
    else:
        return obj


# Router
wave3_router = APIRouter(prefix="/api/v2", tags=["Phase 2 Wave 3"])

# MongoDB
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/?replicaSet=rs0')
db_name = os.environ.get('DB_NAME', 'construction_management')
ai_api_key = os.environ.get('EMERGENT_LLM_KEY')

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Services
permission_checker = PermissionChecker(db)
snapshot_engine = SnapshotEngine(client, db)
job_engine = BackgroundJobEngine(client, db)
ai_service = AIService(client, db, ai_api_key)
security = SecurityHardening(client, db)


# =============================================================================
# MODELS
# =============================================================================

class SnapshotCreate(BaseModel):
    report_type: str
    project_id: str
    filters: Optional[Dict] = None


class JobSchedule(BaseModel):
    job_type: str = Field(..., description="FINANCIAL_INTEGRITY, MEDIA_PURGE, AUDIO_PURGE, PDF_PURGE, DRIVE_RETRY, COMPRESSION_RETRY")
    params: Optional[Dict] = {}


class OCRVerify(BaseModel):
    ocr_id: str
    verified_data: Dict


class VisionOverride(BaseModel):
    tag_id: str
    override_code: str


class SettingsUpdate(BaseModel):
    media_retention_days: Optional[int] = None
    audio_retention_days: Optional[int] = None
    pdf_retention_days: Optional[int] = None
    signed_url_expiration_hours: Optional[int] = None


# =============================================================================
# PILLAR A: SNAPSHOT & REPORT ENDPOINTS
# =============================================================================

@wave3_router.post("/snapshots", status_code=201)
async def create_snapshot(
    snapshot_data: SnapshotCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create immutable snapshot for reporting.
    
    Snapshot cannot be edited or deleted after creation.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_project_access(user, snapshot_data.project_id, require_write=False)
    
    # Generate report data based on type
    if snapshot_data.report_type == "FINANCIAL_SUMMARY":
        data = await snapshot_engine.generate_financial_summary_data(
            snapshot_data.project_id,
            user["organisation_id"]
        )
    else:
        # For other report types, data should be provided in filters
        data = snapshot_data.filters or {}
    
    snapshot_id = await snapshot_engine.create_snapshot(
        report_type=snapshot_data.report_type,
        project_id=snapshot_data.project_id,
        organisation_id=user["organisation_id"],
        generated_by=user["user_id"],
        data=data,
        filters=snapshot_data.filters
    )
    
    return {"snapshot_id": snapshot_id, "report_type": snapshot_data.report_type}


@wave3_router.get("/snapshots/{snapshot_id}")
async def get_snapshot(
    snapshot_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get snapshot by ID with checksum verification"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    try:
        snapshot = await snapshot_engine.get_snapshot(snapshot_id, verify_checksum=True)
        
        # Verify organisation access
        if snapshot.get("organisation_id") != user["organisation_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return snapshot
    except SnapshotNotFoundError:
        raise HTTPException(status_code=404, detail="Snapshot not found")


@wave3_router.get("/snapshots/{snapshot_id}/render")
async def render_report_from_snapshot(
    snapshot_id: str,
    output_format: str = "json",
    current_user: dict = Depends(get_current_user)
):
    """
    Render report from snapshot.
    
    Reports render ONLY from snapshot data_json.
    Historical data preserved even if live data changes.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    try:
        snapshot = await snapshot_engine.get_snapshot(snapshot_id)
        
        if snapshot.get("organisation_id") != user["organisation_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        report = await snapshot_engine.render_report_from_snapshot(snapshot_id, output_format)
        return report
    except SnapshotNotFoundError:
        raise HTTPException(status_code=404, detail="Snapshot not found")


@wave3_router.get("/snapshots")
async def list_snapshots(
    project_id: Optional[str] = None,
    report_type: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """List snapshots for organisation"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    snapshots = await snapshot_engine.list_snapshots(
        organisation_id=user["organisation_id"],
        project_id=project_id,
        report_type=report_type,
        limit=limit
    )
    
    return {"snapshots": snapshots}


@wave3_router.put("/snapshots/{snapshot_id}")
async def update_snapshot_blocked(snapshot_id: str):
    """UPDATE is blocked - snapshots are immutable"""
    raise HTTPException(
        status_code=405,
        detail="Snapshots are immutable and cannot be updated"
    )


@wave3_router.delete("/snapshots/{snapshot_id}")
async def delete_snapshot_blocked(snapshot_id: str):
    """DELETE is blocked - snapshots are immutable"""
    raise HTTPException(
        status_code=405,
        detail="Snapshots are immutable and cannot be deleted"
    )


# =============================================================================
# PILLAR B: BACKGROUND JOB ENDPOINTS
# =============================================================================

@wave3_router.post("/jobs", status_code=201)
async def schedule_job(
    job_data: JobSchedule,
    current_user: dict = Depends(get_current_user)
):
    """
    Schedule a background job.
    
    Jobs run asynchronously without blocking API.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    valid_types = ["FINANCIAL_INTEGRITY", "MEDIA_PURGE", "AUDIO_PURGE", "PDF_PURGE", "DRIVE_RETRY", "COMPRESSION_RETRY"]
    if job_data.job_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid job_type. Must be one of: {valid_types}"
        )
    
    job_id = await job_engine.schedule_job(
        job_type=job_data.job_type,
        params=job_data.params or {},
        organisation_id=user["organisation_id"],
        scheduled_by=user["user_id"]
    )
    
    # Start job execution asynchronously
    await job_engine.run_job_async(job_id)
    
    return {"job_id": job_id, "status": "scheduled"}


@wave3_router.get("/jobs/{job_id}")
async def get_job_status(
    job_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get job status"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    job = await job_engine.get_job_status(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.get("organisation_id") != user["organisation_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return job


@wave3_router.get("/jobs")
async def list_jobs(
    status_filter: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """List jobs for organisation"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    query = {"organisation_id": user["organisation_id"]}
    if status_filter:
        query["status"] = status_filter
    
    jobs = await db.background_jobs.find(query).sort("scheduled_at", -1).limit(limit).to_list(length=limit)
    
    for job in jobs:
        job["job_id"] = str(job.pop("_id"))
    
    return {"jobs": jobs}


@wave3_router.get("/alerts")
async def get_alerts(
    resolved: bool = False,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get financial integrity alerts"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    alerts = await db.alerts.find({
        "organisation_id": user["organisation_id"],
        "resolved": resolved
    }).sort("detected_at", -1).limit(limit).to_list(length=limit)
    
    for alert in alerts:
        alert["alert_id"] = str(alert.pop("_id"))
    
    return {"alerts": alerts}


# =============================================================================
# PILLAR C: AI ENDPOINTS
# =============================================================================

@wave3_router.post("/ai/ocr")
async def run_ocr(
    file: UploadFile = File(...),
    project_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Run OCR on uploaded document.
    
    Extracts vendor, invoice number, date, amount.
    Does NOT auto-create PC.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    # Read file
    content = await file.read()
    file_type = file.filename.split(".")[-1].lower() if file.filename else "unknown"
    
    try:
        result = await ai_service.run_ocr(
            file_content=content,
            file_type=file_type,
            organisation_id=user["organisation_id"],
            user_id=user["user_id"],
            project_id=project_id
        )
        return result
    except AIServiceError as e:
        raise HTTPException(status_code=500, detail=str(e))


@wave3_router.post("/ai/ocr/verify")
async def verify_ocr_result(
    verify_data: OCRVerify,
    current_user: dict = Depends(get_current_user)
):
    """Manually verify/correct OCR result"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    try:
        await ai_service.verify_ocr_result(
            ocr_id=verify_data.ocr_id,
            verified_data=verify_data.verified_data,
            user_id=user["user_id"],
            organisation_id=user["organisation_id"]
        )
        return {"status": "verified", "ocr_id": verify_data.ocr_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@wave3_router.post("/ai/stt")
async def run_stt(
    file: UploadFile = File(...),
    project_id: str = Query(...),
    code_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Run speech-to-text on audio file.
    
    Auto-creates Issue if keywords detected.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    content = await file.read()
    audio_format = file.filename.split(".")[-1].lower() if file.filename else "unknown"
    
    try:
        result = await ai_service.run_stt(
            audio_content=content,
            audio_format=audio_format,
            organisation_id=user["organisation_id"],
            user_id=user["user_id"],
            project_id=project_id,
            code_id=code_id
        )
        return result
    except AIServiceError as e:
        raise HTTPException(status_code=500, detail=str(e))


@wave3_router.post("/ai/vision-tag")
async def run_vision_tag(
    file: UploadFile = File(...),
    project_id: str = Query(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Run vision tagging on image.
    
    Suggests CODE based on image content.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    content = await file.read()
    
    try:
        result = await ai_service.run_vision_tag(
            image_content=content,
            organisation_id=user["organisation_id"],
            user_id=user["user_id"],
            project_id=project_id
        )
        return result
    except AIServiceError as e:
        raise HTTPException(status_code=500, detail=str(e))


@wave3_router.post("/ai/vision-tag/override")
async def override_vision_tag(
    override_data: VisionOverride,
    current_user: dict = Depends(get_current_user)
):
    """Manually override vision tag suggestion"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    try:
        await ai_service.override_vision_tag(
            tag_id=override_data.tag_id,
            override_code=override_data.override_code,
            user_id=user["user_id"],
            organisation_id=user["organisation_id"]
        )
        return {"status": "overridden", "tag_id": override_data.tag_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# =============================================================================
# PILLAR D: SECURITY ENDPOINTS
# =============================================================================

@wave3_router.get("/media/{encoded_path}")
async def get_signed_media(
    encoded_path: str,
    sig: str,
    exp: int,
    org: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Access media via signed URL.
    
    Validates signature, expiration, and organisation.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    try:
        resource_path = security.verify_signed_url(
            encoded_path=encoded_path,
            signature=sig,
            expiration=exp,
            organisation_id=org,
            user_organisation_id=user["organisation_id"]
        )
        
        # In production, return actual file
        # For now, return path info
        return {
            "resource_path": resource_path,
            "access_granted": True,
            "note": "Actual file serving requires storage integration"
        }
    except SignedURLExpiredError:
        raise HTTPException(status_code=401, detail="Signed URL has expired")
    except SignedURLInvalidError:
        raise HTTPException(status_code=401, detail="Invalid signed URL")
    except OrganisationAccessError:
        raise HTTPException(status_code=403, detail="Access denied")


@wave3_router.post("/media/sign")
async def generate_signed_url(
    resource_path: str,
    expiration_hours: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Generate signed URL for resource access"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    if not security.validate_file_path(resource_path):
        raise HTTPException(status_code=400, detail="Invalid resource path")
    
    signed_url = security.generate_signed_url(
        resource_path=resource_path,
        organisation_id=user["organisation_id"],
        expiration_hours=expiration_hours
    )
    
    return {"signed_url": signed_url}


@wave3_router.get("/settings")
async def get_settings(current_user: dict = Depends(get_current_user)):
    """Get organisation settings including retention periods"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    settings = await security.get_organisation_settings(user["organisation_id"])
    return settings


@wave3_router.put("/settings")
async def update_settings(
    settings_data: SettingsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update organisation settings (Admin only)"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    await security.update_organisation_settings(
        organisation_id=user["organisation_id"],
        user_id=user["user_id"],
        settings=settings_data.dict(exclude_none=True)
    )
    
    return {"status": "updated"}


# =============================================================================
# SYSTEM
# =============================================================================

@wave3_router.post("/system/init-wave3-indexes")
async def initialize_wave3_indexes(current_user: dict = Depends(get_current_user)):
    """Initialize all Wave 3 database indexes"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    await snapshot_engine.create_indexes()
    await job_engine.create_indexes()
    await ai_service.create_indexes()
    await security.create_indexes()
    
    return {"status": "success", "message": "Wave 3 indexes created"}


@wave3_router.get("/wave3/health")
async def wave3_health():
    """Wave 3 health check"""
    return {
        "status": "healthy",
        "wave": "3",
        "timestamp": datetime.utcnow().isoformat(),
        "features": {
            "snapshot_engine": True,
            "background_jobs": True,
            "ai_ocr": True,
            "ai_stt": True,
            "ai_vision": True,
            "signed_urls": True,
            "org_isolation": True,
            "configurable_retention": True
        },
        "ai_provider": "EMERGENT" if ai_api_key else "MOCK"
    }
