from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId

# ============================================
# PHASE 3: OPERATIONS + DPR ENGINE MODELS
# ============================================

# ============================================
# PROGRESS TRACKING
# ============================================
class ProgressEntry(BaseModel):
    progress_id: Optional[str] = Field(default=None, alias="_id")
    project_id: str
    code_id: str
    supervisor_id: str
    progress_date: datetime  # UTC server date
    previous_percentage: float
    new_percentage: float  # 0-100, non-decreasing
    delta_percentage: float
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class ProgressEntryCreate(BaseModel):
    project_id: str
    code_id: str
    new_percentage: float  # 0-100

# ============================================
# ATTENDANCE
# ============================================
class Attendance(BaseModel):
    attendance_id: Optional[str] = Field(default=None, alias="_id")
    project_id: str
    supervisor_id: str
    attendance_date: datetime  # UTC date (YYYY-MM-DD)
    check_in_timestamp: datetime  # Full UTC timestamp
    selfie_image_id: str
    gps_lat: Optional[float] = None
    gps_long: Optional[float] = None
    verified_by_admin: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class AttendanceCreate(BaseModel):
    project_id: str
    selfie_image_base64: str  # Will be stored separately
    gps_lat: Optional[float] = None
    gps_long: Optional[float] = None

# ============================================
# IMAGE + MEDIA
# ============================================
class Image(BaseModel):
    image_id: Optional[str] = Field(default=None, alias="_id")
    project_id: str
    code_id: str
    supervisor_id: str
    image_base64: str  # Stored in document
    upload_timestamp: datetime  # UTC server timestamp
    aspect_ratio_validated: bool = False
    compressed_flag: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class ImageCreate(BaseModel):
    project_id: str
    code_id: str
    image_base64: str

# ============================================
# DPR (DAILY PROGRESS REPORT)
# ============================================
class DPR(BaseModel):
    dpr_id: Optional[str] = Field(default=None, alias="_id")
    project_id: str
    supervisor_id: Optional[str] = None  # Nullable for combined DPR
    dpr_date: datetime  # UTC date
    file_name: str  # Unique per date
    file_size_kb: float
    drive_file_id: Optional[str] = None
    drive_link: Optional[str] = None
    version_number: int = 1
    locked_flag: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class DPRGenerate(BaseModel):
    project_id: str
    supervisor_id: Optional[str] = None  # If None, generate combined

# ============================================
# PETTY CASH
# ============================================
class PettyCash(BaseModel):
    pettycash_id: Optional[str] = Field(default=None, alias="_id")
    project_id: str
    code_id: str
    supervisor_id: str
    amount: float  # Must be > 0
    bill_image_id: str
    description: str
    status: str  # Pending, Approved, Rejected
    approved_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class PettyCashCreate(BaseModel):
    project_id: str
    code_id: str
    amount: float
    bill_image_base64: str
    description: str

class PettyCashApprove(BaseModel):
    pass  # No additional fields

class PettyCashReject(BaseModel):
    reason: Optional[str] = None

# ============================================
# ISSUE LOG
# ============================================
class Issue(BaseModel):
    issue_id: Optional[str] = Field(default=None, alias="_id")
    project_id: str
    code_id: str
    raised_by: str  # supervisor_id
    title: str
    description: str
    status: str  # Open, In Progress, Resolved, Closed
    assigned_to: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class IssueCreate(BaseModel):
    project_id: str
    code_id: str
    title: str
    description: str
    assigned_to: Optional[str] = None

class IssueUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    description: Optional[str] = None

# ============================================
# VOICE LOG
# ============================================
class VoiceLog(BaseModel):
    voice_log_id: Optional[str] = Field(default=None, alias="_id")
    project_id: str
    code_id: str
    supervisor_id: str
    audio_file_id: str  # Reference to stored audio
    audio_base64: str  # Stored in document
    transcribed_text: Optional[str] = None
    transcription_failed: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class VoiceLogCreate(BaseModel):
    project_id: str
    code_id: str
    audio_base64: str

# ============================================
# PROJECT OVERALL PROGRESS (Computed)
# ============================================
class ProjectOverallProgress(BaseModel):
    project_id: str
    code_id: str
    latest_percentage: float
    weighted_progress: Optional[float] = None  # If weightage used
    last_updated: datetime
