"""
PHASE 2: CORE ENGINE HARDENING - ATTENDANCE & DPR ENFORCEMENT

Provides:
1. Block progress entry if attendance not marked
2. One attendance per supervisor per project per day
3. Minimum 4 images per supervisor per project per day for DPR
4. Image metadata validation (portrait orientation)
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime, date
from typing import Optional
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)


class AttendanceNotMarkedError(Exception):
    """Raised when trying to submit progress without attendance"""
    def __init__(self, supervisor_id: str, project_id: str, date: str):
        self.supervisor_id = supervisor_id
        self.project_id = project_id
        self.date = date
        super().__init__(
            f"Attendance not marked for supervisor {supervisor_id} "
            f"on project {project_id} for date {date}. "
            f"Mark attendance before submitting progress."
        )


class DuplicateAttendanceError(Exception):
    """Raised when trying to mark attendance twice in a day"""
    def __init__(self, supervisor_id: str, project_id: str, date: str):
        self.supervisor_id = supervisor_id
        self.project_id = project_id
        self.date = date
        super().__init__(
            f"Attendance already marked for supervisor {supervisor_id} "
            f"on project {project_id} for date {date}"
        )


class DPRImageRequirementError(Exception):
    """Raised when DPR generation requirements are not met"""
    def __init__(self, required: int, actual: int, supervisor_id: str, project_id: str, date: str):
        self.required = required
        self.actual = actual
        self.supervisor_id = supervisor_id
        self.project_id = project_id
        self.date = date
        super().__init__(
            f"DPR requires minimum {required} images, only {actual} uploaded "
            f"for supervisor {supervisor_id} on project {project_id} for date {date}"
        )


class ImageValidationError(Exception):
    """Raised when image validation fails"""
    pass


class AttendanceDPREnforcement:
    """
    Backend enforcement for attendance and DPR rules.
    """
    
    MIN_IMAGES_FOR_DPR = 4
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def check_attendance_marked(
        self,
        supervisor_id: str,
        project_id: str,
        check_date: Optional[date] = None,
        session=None
    ) -> bool:
        """
        Check if attendance is marked for the given supervisor/project/date.
        
        Args:
            supervisor_id: Supervisor user ID
            project_id: Project ID
            check_date: Date to check (defaults to today UTC)
            
        Returns:
            True if attendance is marked
            
        Raises:
            AttendanceNotMarkedError if not marked
        """
        if check_date is None:
            check_date = datetime.utcnow().date()
        
        # Query attendance for the specific date
        attendance = await self.db.attendance.find_one(
            {
                "supervisor_id": supervisor_id,
                "project_id": project_id,
                "attendance_date": check_date.isoformat()
            },
            session=session
        )
        
        if not attendance:
            raise AttendanceNotMarkedError(
                supervisor_id=supervisor_id,
                project_id=project_id,
                date=check_date.isoformat()
            )
        
        return True
    
    async def validate_attendance_unique(
        self,
        supervisor_id: str,
        project_id: str,
        check_date: Optional[date] = None,
        session=None
    ):
        """
        Validate that attendance hasn't already been marked for the day.
        
        Raises:
            DuplicateAttendanceError if already marked
        """
        if check_date is None:
            check_date = datetime.utcnow().date()
        
        existing = await self.db.attendance.find_one(
            {
                "supervisor_id": supervisor_id,
                "project_id": project_id,
                "attendance_date": check_date.isoformat()
            },
            session=session
        )
        
        if existing:
            raise DuplicateAttendanceError(
                supervisor_id=supervisor_id,
                project_id=project_id,
                date=check_date.isoformat()
            )
    
    async def validate_dpr_requirements(
        self,
        supervisor_id: str,
        project_id: str,
        check_date: Optional[date] = None,
        session=None
    ):
        """
        Validate DPR generation requirements.
        
        Requirements:
        1. Attendance must be marked
        2. Minimum 4 images uploaded
        
        Raises:
            AttendanceNotMarkedError or DPRImageRequirementError
        """
        if check_date is None:
            check_date = datetime.utcnow().date()
        
        # Check attendance first
        await self.check_attendance_marked(supervisor_id, project_id, check_date, session)
        
        # Count images for the day
        start_of_day = datetime.combine(check_date, datetime.min.time())
        end_of_day = datetime.combine(check_date, datetime.max.time())
        
        image_count = await self.db.images.count_documents(
            {
                "supervisor_id": supervisor_id,
                "project_id": project_id,
                "upload_timestamp": {
                    "$gte": start_of_day,
                    "$lte": end_of_day
                }
            },
            session=session
        )
        
        if image_count < self.MIN_IMAGES_FOR_DPR:
            raise DPRImageRequirementError(
                required=self.MIN_IMAGES_FOR_DPR,
                actual=image_count,
                supervisor_id=supervisor_id,
                project_id=project_id,
                date=check_date.isoformat()
            )
    
    def validate_image_orientation(self, width: int, height: int) -> bool:
        """
        Validate image is in portrait orientation.
        
        Portrait: height > width
        
        Raises:
            ImageValidationError if not portrait
        """
        if width >= height:
            raise ImageValidationError(
                f"Image must be in portrait orientation (height > width). "
                f"Got width={width}, height={height}"
            )
        return True
    
    async def create_attendance_constraint(self):
        """
        Create unique constraint for one attendance per supervisor per project per day.
        """
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
            logger.info("Created unique attendance constraint")
        except Exception as e:
            logger.warning(f"Attendance index creation result: {str(e)}")
