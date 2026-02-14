"""
PHASE 2 WAVE 2: LIFECYCLE & STRUCTURAL INTEGRITY LOCK

Implements:
- Section 1: Version Tables (WorkOrder_Version, PaymentCertificate_Version)
- Section 2: Lock Engine Enforcement
- Section 3: No Hard Delete Policy
- Section 4: Attendance Backend Hard Gate
- Section 5: DPR Image Enforcement
- Section 6: Weightage Validation
- Section 7: Audit Completeness
"""

from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from datetime import datetime, date
from typing import Optional, Dict, Any, List
from bson import ObjectId, Decimal128
from fastapi import HTTPException, status
import copy
import json
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# SECTION 1: VERSION TABLE MODELS
# =============================================================================

class VersionSnapshot:
    """Immutable version snapshot for financial documents"""
    
    @staticmethod
    def create_snapshot(
        parent_id: str,
        version_number: int,
        snapshot_data: Dict[str, Any],
        modified_by: str,
        change_reason: str
    ) -> Dict[str, Any]:
        """Create a version snapshot document"""
        # Deep copy and serialize
        clean_data = VersionSnapshot._serialize_for_snapshot(snapshot_data)
        
        return {
            "parent_id": parent_id,
            "version_number": version_number,
            "snapshot_json": json.dumps(clean_data, default=str),
            "snapshot_data": clean_data,
            "modified_by": modified_by,
            "modified_at": datetime.utcnow(),
            "change_reason": change_reason
        }
    
    @staticmethod
    def _serialize_for_snapshot(data: Dict) -> Dict:
        """Serialize data for immutable snapshot storage"""
        result = {}
        for key, value in data.items():
            if isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
            elif isinstance(value, Decimal128):
                result[key] = str(value.to_decimal())
            elif isinstance(value, dict):
                result[key] = VersionSnapshot._serialize_for_snapshot(value)
            elif isinstance(value, list):
                result[key] = [
                    VersionSnapshot._serialize_for_snapshot(item) if isinstance(item, dict)
                    else str(item) if isinstance(item, (ObjectId, datetime, Decimal128))
                    else item
                    for item in value
                ]
            else:
                result[key] = value
        return result


# =============================================================================
# SECTION 2: LOCK ENGINE EXCEPTIONS
# =============================================================================

class DocumentLockedError(Exception):
    """Raised when trying to modify a locked document"""
    def __init__(self, entity_type: str, entity_id: str):
        self.entity_type = entity_type
        self.entity_id = entity_id
        super().__init__(f"{entity_type} {entity_id} is locked and cannot be modified")


class UnlockReasonRequiredError(Exception):
    """Raised when trying to unlock without providing a reason"""
    def __init__(self, entity_type: str, entity_id: str):
        self.entity_type = entity_type
        self.entity_id = entity_id
        super().__init__(f"Unlock reason is required for {entity_type} {entity_id}")


# =============================================================================
# SECTION 3: NO HARD DELETE EXCEPTIONS
# =============================================================================

class HardDeleteBlockedError(Exception):
    """Raised when trying to hard delete a financial entity"""
    def __init__(self, entity_type: str, entity_id: str):
        self.entity_type = entity_type
        self.entity_id = entity_id
        super().__init__(
            f"Hard delete of {entity_type} {entity_id} is blocked. "
            f"Use soft disable (status change) instead."
        )


# =============================================================================
# SECTION 4 & 5: ATTENDANCE & DPR EXCEPTIONS
# =============================================================================

class AttendanceNotMarkedError(Exception):
    """Raised when trying to perform action without attendance"""
    def __init__(self, supervisor_id: str, project_id: str, action_date: str):
        self.supervisor_id = supervisor_id
        self.project_id = project_id
        self.action_date = action_date
        super().__init__(
            f"Attendance not marked for supervisor {supervisor_id} "
            f"on project {project_id} for date {action_date}. "
            f"Mark attendance first."
        )


class DuplicateAttendanceError(Exception):
    """Raised when attendance already exists for the day"""
    def __init__(self, supervisor_id: str, project_id: str, action_date: str):
        super().__init__(
            f"Attendance already marked for supervisor {supervisor_id} "
            f"on project {project_id} for date {action_date}"
        )


class DPRImageRequirementError(Exception):
    """Raised when DPR image requirements not met"""
    MIN_IMAGES = 4
    
    def __init__(self, actual_count: int, supervisor_id: str, project_id: str, action_date: str):
        self.actual_count = actual_count
        super().__init__(
            f"DPR requires minimum {self.MIN_IMAGES} portrait images. "
            f"Only {actual_count} valid images found for supervisor {supervisor_id} "
            f"on project {project_id} for date {action_date}"
        )


class ImageOrientationError(Exception):
    """Raised when image is not in portrait orientation"""
    def __init__(self, width: int, height: int):
        super().__init__(
            f"Image must be portrait orientation (height > width). "
            f"Got width={width}, height={height}"
        )


# =============================================================================
# SECTION 6: WEIGHTAGE EXCEPTION
# =============================================================================

class WeightageValidationError(Exception):
    """Raised when weightage sum is not 100"""
    def __init__(self, actual_sum: float, project_id: str):
        self.actual_sum = actual_sum
        self.project_id = project_id
        super().__init__(
            f"Code weightages must sum to 100. "
            f"Current sum: {actual_sum} for project {project_id}"
        )


# =============================================================================
# MAIN ENGINE CLASS
# =============================================================================

class LifecycleIntegrityEngine:
    """
    Wave 2: Lifecycle & Structural Integrity Lock Engine
    
    Provides:
    - Version snapshot creation before modifications
    - Lock enforcement with mandatory unlock reasons
    - Hard delete blocking with soft disable fallback
    - Attendance gate for progress/image/issue/voice actions
    - DPR image requirement enforcement
    - Weightage sum validation
    - Complete audit logging
    """
    
    MIN_DPR_IMAGES = 4
    FINANCIAL_ENTITIES = ['WORK_ORDER', 'PAYMENT_CERTIFICATE', 'PAYMENT', 'RETENTION_RELEASE', 'BUDGET']
    
    def __init__(self, client: AsyncIOMotorClient, db: AsyncIOMotorDatabase):
        self.client = client
        self.db = db
    
    # =========================================================================
    # SECTION 1: VERSION TABLES
    # =========================================================================
    
    async def create_version_snapshot(
        self,
        entity_type: str,
        entity_id: str,
        current_data: Dict[str, Any],
        modified_by: str,
        change_reason: str,
        session=None
    ) -> str:
        """
        Create immutable version snapshot before modification.
        
        Rules:
        - Save full document snapshot
        - Increment version number
        - Version history is immutable (no update/delete)
        """
        # Determine version number
        version_collection = self._get_version_collection(entity_type)
        
        # Get latest version number
        latest = await version_collection.find_one(
            {"parent_id": entity_id},
            sort=[("version_number", -1)],
            session=session
        )
        
        new_version = (latest["version_number"] + 1) if latest else 1
        
        # Create snapshot
        snapshot_doc = VersionSnapshot.create_snapshot(
            parent_id=entity_id,
            version_number=new_version,
            snapshot_data=current_data,
            modified_by=modified_by,
            change_reason=change_reason
        )
        
        result = await version_collection.insert_one(snapshot_doc, session=session)
        version_id = str(result.inserted_id)
        
        logger.info(f"[VERSION] Created v{new_version} snapshot for {entity_type} {entity_id}")
        
        return version_id
    
    async def get_version_history(
        self,
        entity_type: str,
        entity_id: str,
        session=None
    ) -> List[Dict]:
        """Get complete version history for an entity"""
        version_collection = self._get_version_collection(entity_type)
        
        versions = await version_collection.find(
            {"parent_id": entity_id},
            session=session
        ).sort("version_number", 1).to_list(length=None)
        
        for v in versions:
            v["version_id"] = str(v.pop("_id"))
        
        return versions
    
    # =========================================================================
    # SECTION 2: LOCK ENGINE ENFORCEMENT
    # =========================================================================
    
    async def check_and_enforce_lock(
        self,
        entity_type: str,
        entity_id: str,
        session=None
    ):
        """
        Check if document is locked and block modification if so.
        
        Raises DocumentLockedError if locked.
        """
        collection = self._get_main_collection(entity_type)
        
        doc = await collection.find_one(
            {"_id": ObjectId(entity_id)},
            {"locked_flag": 1, "status": 1},
            session=session
        )
        
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{entity_type} {entity_id} not found"
            )
        
        if doc.get("locked_flag", False):
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
        """Lock a document to prevent modifications"""
        collection = self._get_main_collection(entity_type)
        
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
        
        logger.info(f"[LOCK] Locked {entity_type} {entity_id} by {user_id}: {reason}")
    
    async def unlock_document(
        self,
        entity_type: str,
        entity_id: str,
        user_id: str,
        reason: str,
        organisation_id: str,
        session=None
    ):
        """
        Unlock a document.
        
        RULES:
        - Reason is MANDATORY
        - Must log to audit
        """
        if not reason or len(reason.strip()) == 0:
            raise UnlockReasonRequiredError(entity_type, entity_id)
        
        collection = self._get_main_collection(entity_type)
        
        # Get current state for audit
        doc = await collection.find_one({"_id": ObjectId(entity_id)}, session=session)
        
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{entity_type} {entity_id} not found"
            )
        
        if not doc.get("locked_flag", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{entity_type} {entity_id} is not locked"
            )
        
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
        
        # Audit log
        await self._log_audit(
            organisation_id=organisation_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action="UNLOCK",
            user_id=user_id,
            old_value={"locked_flag": True, "locked_by": doc.get("locked_by")},
            new_value={"locked_flag": False, "unlock_reason": reason},
            session=session
        )
        
        logger.info(f"[UNLOCK] Unlocked {entity_type} {entity_id} by {user_id}: {reason}")
    
    # =========================================================================
    # SECTION 3: NO HARD DELETE POLICY
    # =========================================================================
    
    def block_hard_delete(self, entity_type: str, entity_id: str):
        """
        Block hard delete for financial entities.
        Always raises HardDeleteBlockedError.
        """
        if entity_type.upper() in self.FINANCIAL_ENTITIES:
            raise HardDeleteBlockedError(entity_type, entity_id)
    
    async def soft_disable(
        self,
        entity_type: str,
        entity_id: str,
        user_id: str,
        reason: str,
        organisation_id: str,
        session=None
    ):
        """
        Soft disable an entity (set status to Disabled/Cancelled).
        
        This is the ONLY way to "delete" financial entities.
        """
        collection = self._get_main_collection(entity_type)
        
        doc = await collection.find_one({"_id": ObjectId(entity_id)}, session=session)
        
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{entity_type} {entity_id} not found"
            )
        
        old_status = doc.get("status")
        
        await collection.update_one(
            {"_id": ObjectId(entity_id)},
            {
                "$set": {
                    "status": "Cancelled",
                    "disabled_flag": True,
                    "disabled_by": user_id,
                    "disabled_at": datetime.utcnow(),
                    "disable_reason": reason,
                    "updated_at": datetime.utcnow()
                }
            },
            session=session
        )
        
        # Audit log
        await self._log_audit(
            organisation_id=organisation_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action="SOFT_DELETE",
            user_id=user_id,
            old_value={"status": old_status},
            new_value={"status": "Cancelled", "disable_reason": reason},
            session=session
        )
        
        logger.info(f"[SOFT_DELETE] Disabled {entity_type} {entity_id} by {user_id}: {reason}")
    
    # =========================================================================
    # SECTION 4: ATTENDANCE BACKEND HARD GATE
    # =========================================================================
    
    async def verify_attendance_for_action(
        self,
        supervisor_id: str,
        project_id: str,
        action_date: Optional[date] = None,
        session=None
    ):
        """
        Verify attendance exists before allowing:
        - Progress update
        - Image upload
        - Issue creation
        - Voice log submission
        
        Raises AttendanceNotMarkedError if not marked.
        """
        if action_date is None:
            action_date = datetime.utcnow().date()
        
        date_str = action_date.isoformat()
        
        attendance = await self.db.attendance.find_one(
            {
                "supervisor_id": supervisor_id,
                "project_id": project_id,
                "attendance_date": date_str
            },
            session=session
        )
        
        if not attendance:
            raise AttendanceNotMarkedError(supervisor_id, project_id, date_str)
        
        logger.debug(f"[ATTENDANCE] Verified for {supervisor_id} on {project_id} for {date_str}")
        return True
    
    async def create_attendance(
        self,
        supervisor_id: str,
        project_id: str,
        organisation_id: str,
        attendance_date: Optional[date] = None,
        check_in_time: Optional[datetime] = None,
        location: Optional[Dict] = None,
        session=None
    ) -> str:
        """
        Create attendance record.
        
        RULES:
        - Only one attendance per supervisor per project per day
        - DB unique constraint enforces this
        """
        if attendance_date is None:
            attendance_date = datetime.utcnow().date()
        
        date_str = attendance_date.isoformat()
        
        # Check for duplicate
        existing = await self.db.attendance.find_one(
            {
                "supervisor_id": supervisor_id,
                "project_id": project_id,
                "attendance_date": date_str
            },
            session=session
        )
        
        if existing:
            raise DuplicateAttendanceError(supervisor_id, project_id, date_str)
        
        attendance_doc = {
            "supervisor_id": supervisor_id,
            "project_id": project_id,
            "organisation_id": organisation_id,
            "attendance_date": date_str,
            "check_in_time": check_in_time or datetime.utcnow(),
            "location": location,
            "created_at": datetime.utcnow()
        }
        
        result = await self.db.attendance.insert_one(attendance_doc, session=session)
        attendance_id = str(result.inserted_id)
        
        # Audit log
        await self._log_audit(
            organisation_id=organisation_id,
            entity_type="ATTENDANCE",
            entity_id=attendance_id,
            action="CREATE",
            user_id=supervisor_id,
            new_value={"attendance_date": date_str, "project_id": project_id},
            session=session
        )
        
        logger.info(f"[ATTENDANCE] Created for {supervisor_id} on {project_id} for {date_str}")
        
        return attendance_id
    
    # =========================================================================
    # SECTION 5: DPR IMAGE ENFORCEMENT
    # =========================================================================
    
    async def verify_dpr_requirements(
        self,
        supervisor_id: str,
        project_id: str,
        dpr_date: Optional[date] = None,
        session=None
    ):
        """
        Verify DPR generation requirements:
        - Attendance marked
        - Minimum 4 valid portrait images
        
        Raises appropriate error if requirements not met.
        """
        if dpr_date is None:
            dpr_date = datetime.utcnow().date()
        
        date_str = dpr_date.isoformat()
        
        # Check attendance first
        await self.verify_attendance_for_action(supervisor_id, project_id, dpr_date, session)
        
        # Count valid portrait images
        start_of_day = datetime.combine(dpr_date, datetime.min.time())
        end_of_day = datetime.combine(dpr_date, datetime.max.time())
        
        # Query for portrait images (height > width)
        valid_images = await self.db.dpr_images.count_documents(
            {
                "supervisor_id": supervisor_id,
                "project_id": project_id,
                "upload_date": date_str,
                "is_portrait": True,
                "is_valid": True
            },
            session=session
        )
        
        if valid_images < self.MIN_DPR_IMAGES:
            raise DPRImageRequirementError(valid_images, supervisor_id, project_id, date_str)
        
        logger.info(f"[DPR] Requirements verified: {valid_images} images for {supervisor_id}")
        return True
    
    async def upload_dpr_image(
        self,
        supervisor_id: str,
        project_id: str,
        organisation_id: str,
        image_url: str,
        width: int,
        height: int,
        metadata: Optional[Dict] = None,
        upload_date: Optional[date] = None,
        session=None
    ) -> str:
        """
        Upload DPR image with validation.
        
        RULES:
        - Attendance must be marked first
        - Image must be portrait orientation (height > width)
        """
        if upload_date is None:
            upload_date = datetime.utcnow().date()
        
        date_str = upload_date.isoformat()
        
        # Verify attendance
        await self.verify_attendance_for_action(supervisor_id, project_id, upload_date, session)
        
        # Validate portrait orientation
        is_portrait = height > width
        if not is_portrait:
            raise ImageOrientationError(width, height)
        
        image_doc = {
            "supervisor_id": supervisor_id,
            "project_id": project_id,
            "organisation_id": organisation_id,
            "upload_date": date_str,
            "image_url": image_url,
            "width": width,
            "height": height,
            "is_portrait": is_portrait,
            "is_valid": True,
            "metadata": metadata or {},
            "uploaded_at": datetime.utcnow()
        }
        
        result = await self.db.dpr_images.insert_one(image_doc, session=session)
        image_id = str(result.inserted_id)
        
        logger.info(f"[DPR_IMAGE] Uploaded for {supervisor_id} on {project_id}: {image_id}")
        
        return image_id
    
    async def generate_dpr(
        self,
        supervisor_id: str,
        project_id: str,
        organisation_id: str,
        dpr_date: Optional[date] = None,
        session=None
    ) -> str:
        """
        Generate DPR after verifying requirements.
        
        RULES:
        - Verify all requirements first
        - Log DPR generation to audit
        """
        if dpr_date is None:
            dpr_date = datetime.utcnow().date()
        
        date_str = dpr_date.isoformat()
        
        # Verify all requirements
        await self.verify_dpr_requirements(supervisor_id, project_id, dpr_date, session)
        
        # Create DPR record
        dpr_doc = {
            "supervisor_id": supervisor_id,
            "project_id": project_id,
            "organisation_id": organisation_id,
            "dpr_date": date_str,
            "status": "Generated",
            "generated_at": datetime.utcnow()
        }
        
        result = await self.db.dpr.insert_one(dpr_doc, session=session)
        dpr_id = str(result.inserted_id)
        
        # Audit log
        await self._log_audit(
            organisation_id=organisation_id,
            entity_type="DPR",
            entity_id=dpr_id,
            action="GENERATE",
            user_id=supervisor_id,
            new_value={"dpr_date": date_str, "project_id": project_id},
            session=session
        )
        
        logger.info(f"[DPR] Generated for {supervisor_id} on {project_id} for {date_str}: {dpr_id}")
        
        return dpr_id
    
    # =========================================================================
    # SECTION 6: WEIGHTAGE VALIDATION
    # =========================================================================
    
    async def validate_weightages(
        self,
        project_id: str,
        weightages: Dict[str, float],
        session=None
    ):
        """
        Validate that code weightages sum to 100.
        
        Args:
            project_id: Project ID
            weightages: Dict of {code_id: weightage_percentage}
            
        Raises:
            WeightageValidationError if sum != 100
        """
        total = sum(weightages.values())
        
        # Allow small floating point tolerance
        if abs(total - 100.0) > 0.01:
            raise WeightageValidationError(total, project_id)
        
        logger.info(f"[WEIGHTAGE] Validated for project {project_id}: sum={total}")
        return True
    
    async def save_project_weightages(
        self,
        project_id: str,
        organisation_id: str,
        user_id: str,
        weightages: Dict[str, float],
        session=None
    ):
        """
        Save project code weightages after validation.
        
        RULES:
        - Must sum to 100
        - Block save if invalid
        """
        # Validate first
        await self.validate_weightages(project_id, weightages, session)
        
        # Get existing for audit
        existing = await self.db.project_weightages.find_one(
            {"project_id": project_id},
            session=session
        )
        
        old_value = existing.get("weightages") if existing else None
        
        # Upsert weightages
        await self.db.project_weightages.update_one(
            {"project_id": project_id},
            {
                "$set": {
                    "project_id": project_id,
                    "organisation_id": organisation_id,
                    "weightages": weightages,
                    "updated_by": user_id,
                    "updated_at": datetime.utcnow()
                },
                "$setOnInsert": {"created_at": datetime.utcnow()}
            },
            upsert=True,
            session=session
        )
        
        # Audit log
        await self._log_audit(
            organisation_id=organisation_id,
            entity_type="PROJECT_WEIGHTAGE",
            entity_id=project_id,
            action="UPDATE" if existing else "CREATE",
            user_id=user_id,
            old_value={"weightages": old_value} if old_value else None,
            new_value={"weightages": weightages},
            session=session
        )
        
        logger.info(f"[WEIGHTAGE] Saved for project {project_id}")
    
    # =========================================================================
    # SECTION 7: AUDIT COMPLETENESS
    # =========================================================================
    
    async def _log_audit(
        self,
        organisation_id: str,
        entity_type: str,
        entity_id: str,
        action: str,
        user_id: str,
        old_value: Optional[Dict] = None,
        new_value: Optional[Dict] = None,
        project_id: Optional[str] = None,
        session=None
    ):
        """
        Log audit entry for any action.
        
        Required for:
        - Version creation
        - Unlock events
        - Attendance creation
        - DPR generation
        - Soft delete events
        """
        audit_doc = {
            "organisation_id": organisation_id,
            "project_id": project_id,
            "module_name": entity_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action_type": action,
            "old_value_json": old_value,
            "new_value_json": new_value,
            "user_id": user_id,
            "timestamp": datetime.utcnow()
        }
        
        await self.db.audit_logs.insert_one(audit_doc, session=session)
        logger.debug(f"[AUDIT] {action} on {entity_type} {entity_id} by {user_id}")
    
    # =========================================================================
    # HELPER METHODS
    # =========================================================================
    
    def _get_main_collection(self, entity_type: str):
        """Get main collection for entity type"""
        mapping = {
            "WORK_ORDER": self.db.work_orders,
            "PAYMENT_CERTIFICATE": self.db.payment_certificates,
            "PAYMENT": self.db.payments,
            "RETENTION_RELEASE": self.db.retention_releases,
            "BUDGET": self.db.project_budgets,
        }
        return mapping.get(entity_type.upper())
    
    def _get_version_collection(self, entity_type: str):
        """Get version collection for entity type"""
        mapping = {
            "WORK_ORDER": self.db.work_order_versions,
            "PAYMENT_CERTIFICATE": self.db.payment_certificate_versions,
        }
        return mapping.get(entity_type.upper())
    
    # =========================================================================
    # INDEX CREATION
    # =========================================================================
    
    async def create_indexes(self):
        """Create all required indexes for Wave 2"""
        
        # Attendance unique constraint: (supervisor_id, project_id, date)
        try:
            await self.db.attendance.create_index(
                [
                    ("supervisor_id", 1),
                    ("project_id", 1),
                    ("attendance_date", 1)
                ],
                unique=True,
                name="unique_daily_attendance"
            )
            logger.info("Created: unique_daily_attendance index")
        except Exception as e:
            logger.warning(f"Attendance index: {e}")
        
        # Version table indexes
        try:
            await self.db.workorder_versions.create_index(
                [("parent_id", 1), ("version_number", -1)],
                name="wo_version_lookup"
            )
            logger.info("Created: wo_version_lookup index")
        except Exception as e:
            logger.warning(f"WO version index: {e}")
        
        try:
            await self.db.paymentcertificate_versions.create_index(
                [("parent_id", 1), ("version_number", -1)],
                name="pc_version_lookup"
            )
            logger.info("Created: pc_version_lookup index")
        except Exception as e:
            logger.warning(f"PC version index: {e}")
        
        # DPR image lookup
        try:
            await self.db.dpr_images.create_index(
                [
                    ("supervisor_id", 1),
                    ("project_id", 1),
                    ("upload_date", 1)
                ],
                name="dpr_image_lookup"
            )
            logger.info("Created: dpr_image_lookup index")
        except Exception as e:
            logger.warning(f"DPR image index: {e}")
        
        logger.info("Wave 2 indexes created")
