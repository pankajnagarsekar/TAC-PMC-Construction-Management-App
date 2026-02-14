"""
PHASE 2 WAVE 2: LIFECYCLE & STRUCTURAL INTEGRITY API ROUTES

Implements:
- Section 1: Version Tables API
- Section 2: Lock Engine API (unlock with reason)
- Section 3: No Hard Delete (soft disable instead)
- Section 4: Attendance Backend Gate API
- Section 5: DPR Image Enforcement API
- Section 6: Weightage Validation API
- Section 7: Audit Completeness

DOES NOT modify existing API contracts.
EXTENDS functionality only.
"""

from fastapi import APIRouter, HTTPException, status, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime, date
from typing import Optional, Dict, List
from pydantic import BaseModel, Field
import logging
import os

from dotenv import load_dotenv
load_dotenv()

from auth import get_current_user
from permissions import PermissionChecker
from core.lifecycle_integrity_engine import (
    LifecycleIntegrityEngine,
    DocumentLockedError,
    UnlockReasonRequiredError,
    HardDeleteBlockedError,
    AttendanceNotMarkedError,
    DuplicateAttendanceError,
    DPRImageRequirementError,
    ImageOrientationError,
    WeightageValidationError
)

logger = logging.getLogger(__name__)

# Router
wave2_router = APIRouter(prefix="/api/v2", tags=["Phase 2 Wave 2 - Lifecycle & Integrity"])

# MongoDB
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/?replicaSet=rs0')
db_name = os.environ.get('DB_NAME', 'construction_management')

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Services
permission_checker = PermissionChecker(db)
lifecycle_engine = LifecycleIntegrityEngine(client, db)


# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class UnlockRequest(BaseModel):
    reason: str = Field(..., min_length=5, description="Mandatory reason for unlock")


class SoftDisableRequest(BaseModel):
    reason: str = Field(..., min_length=5, description="Reason for disabling")


class AttendanceCreate(BaseModel):
    project_id: str
    attendance_date: Optional[str] = None  # ISO format, defaults to today
    location: Optional[Dict] = None


class DPRImageUpload(BaseModel):
    project_id: str
    image_url: str
    width: int
    height: int
    metadata: Optional[Dict] = None
    upload_date: Optional[str] = None


class DPRGenerateRequest(BaseModel):
    project_id: str
    dpr_date: Optional[str] = None


class WeightageUpdate(BaseModel):
    project_id: str
    weightages: Dict[str, float]  # code_id -> weightage percentage


# =============================================================================
# SECTION 1: VERSION HISTORY ENDPOINTS
# =============================================================================

@wave2_router.get("/lifecycle/work-orders/{wo_id}/versions")
async def get_wo_version_history(
    wo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get complete version history for a Work Order.
    Version snapshots are immutable.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    
    await permission_checker.check_project_access(user, wo["project_id"], require_write=False)
    
    versions = await lifecycle_engine.get_version_history("WORK_ORDER", wo_id)
    return {"wo_id": wo_id, "versions": versions}


@wave2_router.get("/lifecycle/payment-certificates/{pc_id}/versions")
async def get_pc_version_history(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get complete version history for a Payment Certificate.
    Version snapshots are immutable.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    pc = await db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
    if not pc:
        raise HTTPException(status_code=404, detail="Payment Certificate not found")
    
    await permission_checker.check_project_access(user, pc["project_id"], require_write=False)
    
    versions = await lifecycle_engine.get_version_history("PAYMENT_CERTIFICATE", pc_id)
    return {"pc_id": pc_id, "versions": versions}


# =============================================================================
# SECTION 2: LOCK ENGINE ENDPOINTS
# =============================================================================

@wave2_router.post("/lifecycle/work-orders/{wo_id}/unlock")
async def unlock_work_order(
    wo_id: str,
    unlock_request: UnlockRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Unlock a Work Order.
    
    RULES:
    - Reason is MANDATORY
    - Creates audit log entry
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    
    await permission_checker.check_project_access(user, wo["project_id"], require_write=True)
    
    try:
        await lifecycle_engine.unlock_document(
            entity_type="WORK_ORDER",
            entity_id=wo_id,
            user_id=user["user_id"],
            reason=unlock_request.reason,
            organisation_id=user["organisation_id"]
        )
        return {"status": "success", "wo_id": wo_id, "message": "Work Order unlocked"}
    except UnlockReasonRequiredError as e:
        raise HTTPException(status_code=400, detail=str(e))


@wave2_router.post("/lifecycle/payment-certificates/{pc_id}/unlock")
async def unlock_payment_certificate(
    pc_id: str,
    unlock_request: UnlockRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Unlock a Payment Certificate.
    
    RULES:
    - Reason is MANDATORY
    - Creates audit log entry
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    pc = await db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
    if not pc:
        raise HTTPException(status_code=404, detail="Payment Certificate not found")
    
    await permission_checker.check_project_access(user, pc["project_id"], require_write=True)
    
    try:
        await lifecycle_engine.unlock_document(
            entity_type="PAYMENT_CERTIFICATE",
            entity_id=pc_id,
            user_id=user["user_id"],
            reason=unlock_request.reason,
            organisation_id=user["organisation_id"]
        )
        return {"status": "success", "pc_id": pc_id, "message": "Payment Certificate unlocked"}
    except UnlockReasonRequiredError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# SECTION 3: SOFT DELETE ENDPOINTS (NO HARD DELETE)
# =============================================================================

@wave2_router.post("/lifecycle/work-orders/{wo_id}/disable")
async def disable_work_order(
    wo_id: str,
    disable_request: SoftDisableRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Soft disable a Work Order (sets status to Cancelled).
    
    Hard delete is BLOCKED for financial entities.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    
    await permission_checker.check_project_access(user, wo["project_id"], require_write=True)
    
    await lifecycle_engine.soft_disable(
        entity_type="WORK_ORDER",
        entity_id=wo_id,
        user_id=user["user_id"],
        reason=disable_request.reason,
        organisation_id=user["organisation_id"]
    )
    
    return {"status": "success", "wo_id": wo_id, "message": "Work Order disabled (soft delete)"}


@wave2_router.post("/lifecycle/payment-certificates/{pc_id}/disable")
async def disable_payment_certificate(
    pc_id: str,
    disable_request: SoftDisableRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Soft disable a Payment Certificate (sets status to Cancelled).
    
    Hard delete is BLOCKED for financial entities.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    pc = await db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
    if not pc:
        raise HTTPException(status_code=404, detail="Payment Certificate not found")
    
    await permission_checker.check_project_access(user, pc["project_id"], require_write=True)
    
    await lifecycle_engine.soft_disable(
        entity_type="PAYMENT_CERTIFICATE",
        entity_id=pc_id,
        user_id=user["user_id"],
        reason=disable_request.reason,
        organisation_id=user["organisation_id"]
    )
    
    return {"status": "success", "pc_id": pc_id, "message": "Payment Certificate disabled (soft delete)"}


@wave2_router.delete("/lifecycle/work-orders/{wo_id}")
async def delete_work_order_blocked(
    wo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Hard delete is BLOCKED.
    Returns error directing to soft disable endpoint.
    """
    raise HTTPException(
        status_code=405,
        detail="Hard delete is blocked for Work Orders. Use POST /lifecycle/work-orders/{wo_id}/disable instead."
    )


@wave2_router.delete("/lifecycle/payment-certificates/{pc_id}")
async def delete_pc_blocked(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Hard delete is BLOCKED.
    Returns error directing to soft disable endpoint.
    """
    raise HTTPException(
        status_code=405,
        detail="Hard delete is blocked for Payment Certificates. Use POST /lifecycle/payment-certificates/{pc_id}/disable instead."
    )


# =============================================================================
# SECTION 4: ATTENDANCE BACKEND GATE
# =============================================================================

@wave2_router.post("/attendance", status_code=201)
async def create_attendance(
    attendance_data: AttendanceCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Mark attendance for the current user (Supervisor).
    
    RULES:
    - Only one attendance per supervisor per project per day
    - Required before: progress update, image upload, issue creation, voice log
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    # Parse date
    attendance_date = None
    if attendance_data.attendance_date:
        attendance_date = date.fromisoformat(attendance_data.attendance_date)
    
    try:
        attendance_id = await lifecycle_engine.create_attendance(
            supervisor_id=user["user_id"],
            project_id=attendance_data.project_id,
            organisation_id=user["organisation_id"],
            attendance_date=attendance_date,
            location=attendance_data.location
        )
        
        return {
            "attendance_id": attendance_id,
            "supervisor_id": user["user_id"],
            "project_id": attendance_data.project_id,
            "date": attendance_date.isoformat() if attendance_date else datetime.utcnow().date().isoformat()
        }
    except DuplicateAttendanceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@wave2_router.get("/attendance/check")
async def check_attendance(
    project_id: str,
    check_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Check if attendance is marked for today.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    parsed_date = date.fromisoformat(check_date) if check_date else None
    
    try:
        await lifecycle_engine.verify_attendance_for_action(
            supervisor_id=user["user_id"],
            project_id=project_id,
            action_date=parsed_date
        )
        return {"attendance_marked": True}
    except AttendanceNotMarkedError:
        return {"attendance_marked": False}


# =============================================================================
# SECTION 5: DPR IMAGE ENFORCEMENT
# =============================================================================

@wave2_router.post("/dpr/images", status_code=201)
async def upload_dpr_image(
    image_data: DPRImageUpload,
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a DPR image.
    
    RULES:
    - Attendance must be marked first
    - Image must be portrait orientation (height > width)
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    upload_date = date.fromisoformat(image_data.upload_date) if image_data.upload_date else None
    
    try:
        image_id = await lifecycle_engine.upload_dpr_image(
            supervisor_id=user["user_id"],
            project_id=image_data.project_id,
            organisation_id=user["organisation_id"],
            image_url=image_data.image_url,
            width=image_data.width,
            height=image_data.height,
            metadata=image_data.metadata,
            upload_date=upload_date
        )
        
        return {
            "image_id": image_id,
            "status": "uploaded",
            "is_portrait": True
        }
    except AttendanceNotMarkedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ImageOrientationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@wave2_router.post("/dpr/generate", status_code=201)
async def generate_dpr(
    dpr_request: DPRGenerateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Generate DPR for a project.
    
    RULES:
    - Attendance must be marked
    - Minimum 4 valid portrait images required
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    dpr_date = date.fromisoformat(dpr_request.dpr_date) if dpr_request.dpr_date else None
    
    try:
        dpr_id = await lifecycle_engine.generate_dpr(
            supervisor_id=user["user_id"],
            project_id=dpr_request.project_id,
            organisation_id=user["organisation_id"],
            dpr_date=dpr_date
        )
        
        return {
            "dpr_id": dpr_id,
            "status": "generated",
            "project_id": dpr_request.project_id
        }
    except AttendanceNotMarkedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except DPRImageRequirementError as e:
        raise HTTPException(status_code=400, detail=str(e))


@wave2_router.get("/dpr/requirements-check")
async def check_dpr_requirements(
    project_id: str,
    check_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Check if DPR requirements are met.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    
    parsed_date = date.fromisoformat(check_date) if check_date else None
    
    try:
        await lifecycle_engine.verify_dpr_requirements(
            supervisor_id=user["user_id"],
            project_id=project_id,
            dpr_date=parsed_date
        )
        return {"requirements_met": True, "min_images": 4}
    except AttendanceNotMarkedError as e:
        return {"requirements_met": False, "reason": "attendance_not_marked", "detail": str(e)}
    except DPRImageRequirementError as e:
        return {"requirements_met": False, "reason": "insufficient_images", "actual": e.actual_count, "required": 4}


# =============================================================================
# SECTION 6: WEIGHTAGE VALIDATION
# =============================================================================

@wave2_router.post("/weightages")
async def save_weightages(
    weightage_data: WeightageUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Save project code weightages.
    
    RULES:
    - Weightages must sum to exactly 100
    - Blocked if invalid
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    await permission_checker.check_project_access(user, weightage_data.project_id, require_write=True)
    
    try:
        await lifecycle_engine.save_project_weightages(
            project_id=weightage_data.project_id,
            organisation_id=user["organisation_id"],
            user_id=user["user_id"],
            weightages=weightage_data.weightages
        )
        
        return {
            "status": "success",
            "project_id": weightage_data.project_id,
            "total_weightage": 100.0
        }
    except WeightageValidationError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Weightage validation failed: {str(e)}"
        )


@wave2_router.get("/weightages/{project_id}")
async def get_weightages(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get project code weightages.
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_project_access(user, project_id, require_write=False)
    
    weightages = await db.project_weightages.find_one({"project_id": project_id})
    
    if not weightages:
        return {"project_id": project_id, "weightages": {}}
    
    weightages["weightage_id"] = str(weightages.pop("_id"))
    return weightages


# =============================================================================
# SYSTEM INITIALIZATION
# =============================================================================

@wave2_router.post("/lifecycle/init-indexes")
async def initialize_wave2_indexes(
    current_user: dict = Depends(get_current_user)
):
    """
    Initialize Wave 2 database indexes.
    
    Creates:
    - unique_daily_attendance (supervisor_id, project_id, attendance_date)
    - wo_version_lookup
    - pc_version_lookup
    - dpr_image_lookup
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    await lifecycle_engine.create_indexes()
    
    return {"status": "success", "message": "Wave 2 indexes created"}


# =============================================================================
# HEALTH CHECK
# =============================================================================

@wave2_router.get("/lifecycle/health")
async def wave2_health():
    """Wave 2 health check"""
    return {
        "status": "healthy",
        "wave": "2",
        "features": {
            "version_tables": True,
            "lock_enforcement": True,
            "no_hard_delete": True,
            "attendance_gate": True,
            "dpr_image_enforcement": True,
            "weightage_validation": True,
            "audit_completeness": True
        }
    }
