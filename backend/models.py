from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId

# Custom ObjectId handling for MongoDB
class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(cls, core_schema, handler):
        return {"type": "string"}

# ============================================
# ORGANISATION MODEL
# ============================================
class Organisation(BaseModel):
    organisation_id: Optional[str] = Field(default=None, alias="_id")
    organisation_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class OrganisationCreate(BaseModel):
    organisation_name: str

# ============================================
# USER MODEL
# ============================================
class User(BaseModel):
    user_id: Optional[str] = Field(default=None, alias="_id")
    organisation_id: str
    name: str
    email: EmailStr
    hashed_password: str
    role: str  # Admin, Supervisor, Other
    active_status: bool = True
    dpr_generation_permission: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "Other"  # Admin, Supervisor, Other
    dpr_generation_permission: bool = False

class UserResponse(BaseModel):
    user_id: str
    organisation_id: str
    name: str
    email: str
    role: str
    active_status: bool
    dpr_generation_permission: bool
    created_at: datetime
    updated_at: datetime

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    active_status: Optional[bool] = None
    dpr_generation_permission: Optional[bool] = None

# ============================================
# USER PROJECT MAP MODEL
# ============================================
class UserProjectMap(BaseModel):
    map_id: Optional[str] = Field(default=None, alias="_id")
    user_id: str
    project_id: str
    role_override: Optional[str] = None
    read_access: bool = True
    write_access: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class UserProjectMapCreate(BaseModel):
    user_id: str
    project_id: str
    role_override: Optional[str] = None
    read_access: bool = True
    write_access: bool = False

# ============================================
# PROJECT MODEL
# ============================================
class Project(BaseModel):
    project_id: Optional[str] = Field(default=None, alias="_id")
    organisation_id: str
    project_name: str
    client_name: str
    start_date: datetime
    end_date: Optional[datetime] = None
    dpr_enforcement_enabled: bool = True
    project_retention_percentage: Optional[float] = None
    project_cgst_percentage: Optional[float] = None
    project_sgst_percentage: Optional[float] = None
    currency_code: str = "INR"
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class ProjectCreate(BaseModel):
    project_name: str
    client_name: str
    start_date: datetime
    end_date: Optional[datetime] = None
    dpr_enforcement_enabled: bool = True
    project_retention_percentage: Optional[float] = None
    project_cgst_percentage: Optional[float] = None
    project_sgst_percentage: Optional[float] = None
    currency_code: str = "INR"

class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    end_date: Optional[datetime] = None
    dpr_enforcement_enabled: Optional[bool] = None
    project_retention_percentage: Optional[float] = None
    project_cgst_percentage: Optional[float] = None
    project_sgst_percentage: Optional[float] = None

# ============================================
# CODE MASTER MODEL
# ============================================
class CodeMaster(BaseModel):
    code_id: Optional[str] = Field(default=None, alias="_id")
    code_short: str
    code_name: str
    active_status: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class CodeMasterCreate(BaseModel):
    code_short: str
    code_name: str

class CodeMasterUpdate(BaseModel):
    code_name: Optional[str] = None
    active_status: Optional[bool] = None

# ============================================
# PROJECT BUDGET MODEL
# ============================================
class ProjectBudget(BaseModel):
    budget_id: Optional[str] = Field(default=None, alias="_id")
    project_id: str
    code_id: str
    approved_budget_amount: float
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class ProjectBudgetCreate(BaseModel):
    project_id: str
    code_id: str
    approved_budget_amount: float

class ProjectBudgetUpdate(BaseModel):
    approved_budget_amount: float

# ============================================
# DERIVED FINANCIAL STATE MODEL
# ============================================
class DerivedFinancialState(BaseModel):
    state_id: Optional[str] = Field(default=None, alias="_id")
    project_id: str
    code_id: str
    committed_value: float = 0.0
    certified_value: float = 0.0
    paid_value: float = 0.0
    retention_held: float = 0.0
    balance_budget_remaining: float = 0.0
    balance_to_pay: float = 0.0
    over_commit_flag: bool = False
    over_certification_flag: bool = False
    over_payment_flag: bool = False
    last_recalculated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

# ============================================
# AUDIT LOG MODEL (IMMUTABLE)
# ============================================
class AuditLog(BaseModel):
    audit_id: Optional[str] = Field(default=None, alias="_id")
    organisation_id: str
    project_id: Optional[str] = None
    module_name: str
    entity_type: str
    entity_id: str
    action_type: str  # CREATE, UPDATE, DELETE
    old_value_json: Optional[Dict[str, Any]] = None
    new_value_json: Optional[Dict[str, Any]] = None
    user_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

# ============================================
# GLOBAL SETTINGS MODEL
# ============================================
class GlobalSettings(BaseModel):
    settings_id: Optional[str] = Field(default=None, alias="_id")
    organisation_id: str
    default_currency: str = "INR"
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

# ============================================
# AUTH MODELS
# ============================================
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 1800  # 30 minutes in seconds
    user: UserResponse

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

# ============================================
# REFRESH TOKEN STORAGE MODEL
# ============================================
class RefreshToken(BaseModel):
    token_id: Optional[str] = Field(default=None, alias="_id")
    jti: str  # JWT ID (unique identifier)
    user_id: str
    token_hash: str  # Hashed refresh token
    expires_at: datetime
    is_revoked: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}
