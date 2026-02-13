from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime, date
from bson import ObjectId
from fastapi import HTTPException, status
import logging
import base64
from io import BytesIO
from PIL import Image as PILImage

logger = logging.getLogger(__name__)

class Phase3OperationsService:
    """
    Phase 3 Operations Service.
    
    Handles:
    - Attendance enforcement
    - Progress tracking
    - Image validation
    - DPR generation rules
    - Petty cash approval workflow
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def check_attendance_today(
        self,
        supervisor_id: str,
        project_id: str
    ) -> bool:
        """
        Check if supervisor has marked attendance today.
        Required for: progress entry, image upload, issue creation.
        """
        today = datetime.utcnow().date()
        
        attendance = await self.db.attendance.find_one({
            "supervisor_id": supervisor_id,
            "project_id": project_id,
            "attendance_date": {
                "$gte": datetime(today.year, today.month, today.day),
                "$lt": datetime(today.year, today.month, today.day, 23, 59, 59)
            }
        })
        
        return attendance is not None
    
    async def get_today_image_count(
        self,
        supervisor_id: str,
        project_id: str
    ) -> int:
        """
        Get count of images uploaded today by supervisor.
        Required for DPR generation (min 4).
        """
        today = datetime.utcnow().date()
        
        count = await self.db.images.count_documents({
            "supervisor_id": supervisor_id,
            "project_id": project_id,
            "upload_timestamp": {
                "$gte": datetime(today.year, today.month, today.day),
                "$lt": datetime(today.year, today.month, today.day, 23, 59, 59)
            },
            "aspect_ratio_validated": True
        })
        
        return count
    
    async def enforce_dpr_requirements(
        self,
        supervisor_id: str,
        project_id: str
    ):
        """
        Enforce DPR generation requirements.
        
        RULES:
        - Minimum 4 valid images uploaded today
        - Images must be aspect ratio validated
        """
        image_count = await self.get_today_image_count(supervisor_id, project_id)
        
        if image_count < 4:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"DPR requires minimum 4 images. Current count: {image_count}"
            )
        
        return True
    
    async def validate_image_aspect_ratio(
        self,
        image_base64: str
    ) -> bool:
        """
        Validate image aspect ratio (portrait ~9:16).
        
        Acceptable range: 0.5 to 0.6 (width/height)
        """
        try:
            # Decode base64
            image_data = base64.b64decode(image_base64)
            image = PILImage.open(BytesIO(image_data))
            
            width, height = image.size
            aspect_ratio = width / height
            
            # Portrait should be ~0.56 (9/16)
            # Allow range 0.5 to 0.6
            if 0.5 <= aspect_ratio <= 0.6:
                return True
            else:
                logger.warning(f"Invalid aspect ratio: {aspect_ratio}")
                return False
                
        except Exception as e:
            logger.error(f"Image validation failed: {str(e)}")
            return False
    
    async def get_latest_progress(
        self,
        project_id: str,
        code_id: str
    ) -> float:
        """Get latest progress percentage for project+code"""
        latest_entry = await self.db.progress_entries.find_one(
            {"project_id": project_id, "code_id": code_id},
            sort=[("progress_date", -1)]
        )
        
        return latest_entry["new_percentage"] if latest_entry else 0.0
    
    async def calculate_project_overall_progress(
        self,
        project_id: str
    ) -> dict:
        """
        Calculate overall project progress.
        
        Simple average across all codes (no weightage for now).
        Can be extended with budget-based weightage.
        """
        # Get all progress entries grouped by code
        pipeline = [
            {
                "$match": {"project_id": project_id}
            },
            {
                "$sort": {"code_id": 1, "progress_date": -1}
            },
            {
                "$group": {
                    "_id": "$code_id",
                    "latest_percentage": {"$first": "$new_percentage"},
                    "last_updated": {"$first": "$progress_date"}
                }
            }
        ]
        
        results = await self.db.progress_entries.aggregate(pipeline).to_list(length=None)
        
        if not results:
            return {"overall_percentage": 0.0, "code_progress": []}
        
        # Simple average
        total_percentage = sum(r["latest_percentage"] for r in results)
        overall_percentage = total_percentage / len(results)
        
        return {
            "overall_percentage": round(overall_percentage, 2),
            "code_progress": results
        }
    
    async def enforce_attendance_for_operation(
        self,
        supervisor_id: str,
        project_id: str,
        operation: str
    ):
        """
        Enforce attendance requirement for operations.
        
        Operations requiring attendance:
        - Progress entry
        - Image upload
        - Issue creation
        """
        has_attendance = await self.check_attendance_today(supervisor_id, project_id)
        
        if not has_attendance:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Attendance required before {operation}. Please mark attendance first."
            )
        
        return True
    
    async def enforce_dpr_enforcement_policy(
        self,
        project_id: str,
        supervisor_id: str
    ):
        """
        Enforce DPR enforcement policy for logout.
        
        RULE: If project has DPR enforcement enabled and supervisor has <4 images,
        block logout/end of day actions.
        """
        project = await self.db.projects.find_one({"_id": ObjectId(project_id)})
        
        if not project:
            return True
        
        if not project.get("dpr_enforcement_enabled", False):
            return True  # No enforcement
        
        image_count = await self.get_today_image_count(supervisor_id, project_id)
        
        if image_count < 4:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"DPR enforcement active: Minimum 4 images required. Current: {image_count}"
            )
        
        return True


class DPRGenerationService:
    """
    DPR Generation Service.
    
    Handles:
    - PDF generation from daily data
    - Compression to <3MB
    - Drive upload (placeholder for retry logic)
    - Version management
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def generate_dpr_pdf(
        self,
        project_id: str,
        supervisor_id: Optional[str],
        dpr_date: date
    ) -> dict:
        """
        Generate DPR PDF.
        
        PLACEHOLDER: Actual PDF generation would use reportlab or similar.
        Returns file metadata.
        """
        # Collect data
        data = await self.collect_dpr_data(project_id, supervisor_id, dpr_date)
        
        # Generate filename
        date_str = dpr_date.strftime("%Y%m%d")
        supervisor_str = supervisor_id if supervisor_id else "COMBINED"
        file_name = f"DPR_{project_id}_{supervisor_str}_{date_str}.pdf"
        
        # PLACEHOLDER: Generate PDF
        # In real implementation, use reportlab to create PDF with:
        # - Attendance data
        # - Progress entries
        # - Images
        # - Issues
        # - Voice logs
        
        # Simulate file size
        file_size_kb = 1500  # Placeholder
        
        # PLACEHOLDER: Compress if > 3MB
        if file_size_kb > 3072:
            logger.warning(f"DPR size {file_size_kb}KB exceeds 3MB. Compressing...")
            # Compression logic here
            file_size_kb = 2800
        
        return {
            "file_name": file_name,
            "file_size_kb": file_size_kb,
            "data": data
        }
    
    async def collect_dpr_data(
        self,
        project_id: str,
        supervisor_id: Optional[str],
        dpr_date: date
    ) -> dict:
        """Collect all data for DPR"""
        
        query_date_start = datetime(dpr_date.year, dpr_date.month, dpr_date.day)
        query_date_end = datetime(dpr_date.year, dpr_date.month, dpr_date.day, 23, 59, 59)
        
        base_query = {
            "project_id": project_id
        }
        
        if supervisor_id:
            base_query["supervisor_id"] = supervisor_id
        
        # Attendance
        attendance_query = {**base_query, "attendance_date": {"$gte": query_date_start, "$lte": query_date_end}}
        attendance = await self.db.attendance.find(attendance_query).to_list(length=None)
        
        # Progress
        progress_query = {**base_query, "progress_date": {"$gte": query_date_start, "$lte": query_date_end}}
        progress = await self.db.progress_entries.find(progress_query).to_list(length=None)
        
        # Images
        image_query = {**base_query, "upload_timestamp": {"$gte": query_date_start, "$lte": query_date_end}}
        images = await self.db.images.find(image_query).to_list(length=None)
        
        # Issues
        issue_query = {**base_query, "created_at": {"$gte": query_date_start, "$lte": query_date_end}}
        issues = await self.db.issues.find(issue_query).to_list(length=None)
        
        # Voice logs
        voice_query = {**base_query, "created_at": {"$gte": query_date_start, "$lte": query_date_end}}
        voice_logs = await self.db.voice_logs.find(voice_query).to_list(length=None)
        
        return {
            "attendance": attendance,
            "progress": progress,
            "images": images,
            "issues": issues,
            "voice_logs": voice_logs
        }
    
    async def upload_to_drive(
        self,
        file_name: str,
        file_data: bytes
    ) -> dict:
        """
        Upload DPR to Google Drive.
        
        PLACEHOLDER: Implement Google Drive API upload with retry logic.
        """
        # PLACEHOLDER: Actual Drive API implementation
        # Use google-api-python-client
        
        drive_file_id = f"PLACEHOLDER_{file_name}"
        drive_link = f"https://drive.google.com/file/d/{drive_file_id}/view"
        
        logger.info(f"DPR uploaded to Drive: {drive_link}")
        
        return {
            "drive_file_id": drive_file_id,
            "drive_link": drive_link
        }
