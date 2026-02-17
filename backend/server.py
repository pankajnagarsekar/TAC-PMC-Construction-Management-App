from fastapi import FastAPI, APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId, Decimal128
import os
import logging
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime

# Import custom modules
from models import (
    Organisation, OrganisationCreate,
    User, UserCreate, UserResponse, UserUpdate,
    UserProjectMap, UserProjectMapCreate,
    Project, ProjectCreate, ProjectUpdate,
    CodeMaster, CodeMasterCreate, CodeMasterUpdate,
    ProjectBudget, ProjectBudgetCreate, ProjectBudgetUpdate,
    DerivedFinancialState,
    AuditLog,
    GlobalSettings,
    Token, LoginRequest, RefreshTokenRequest,
    WorkerEntry, WorkersDailyLog, WorkersDailyLogCreate, WorkersDailyLogUpdate
)
from auth import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    decode_refresh_token, get_current_user
)
from audit_service import AuditService
from financial_service import FinancialRecalculationService
from permissions import PermissionChecker


def serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize MongoDB document for JSON response (handles Decimal128, ObjectId, datetime)"""
    if doc is None:
        return None
    result = {}
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, Decimal128):
            result[key] = float(value.to_decimal())
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, dict):
            result[key] = serialize_doc(value)
        elif isinstance(value, list):
            result[key] = [
                serialize_doc(item) if isinstance(item, dict)
                else float(item.to_decimal()) if isinstance(item, Decimal128)
                else str(item) if isinstance(item, ObjectId)
                else item
                for item in value
            ]
        else:
            result[key] = value
    return result

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Initialize services
audit_service = AuditService(db)
financial_service = FinancialRecalculationService(db)
permission_checker = PermissionChecker(db)

# Create the main app
app = FastAPI(
    title="Construction Management System - Phase 2 Hardened",
    version="2.0.0",
    description="Enterprise Construction Management with Hardened Financial Core"
)

# Create router with /api prefix
api_router = APIRouter(prefix="/api")

# HTTP Bearer for token extraction
security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================
# AUTHENTICATION ENDPOINTS
# ============================================

@api_router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(user_data: UserCreate):
    """
    Register a new user.
    First user becomes Admin, subsequent users default to their specified role.
    """
    # Check if email already exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Get default organisation (assuming single org for Phase 1)
    organisation = await db.organisations.find_one({})
    if not organisation:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No organisation found. Please run seed script."
        )
    
    organisation_id = str(organisation["_id"])
    
    # Check if this is the first user
    user_count = await db.users.count_documents({})
    role = "Admin" if user_count == 0 else user_data.role
    
    # Hash password
    hashed_pw = hash_password(user_data.password)
    
    # Create user
    user_dict = {
        "organisation_id": organisation_id,
        "name": user_data.name,
        "email": user_data.email,
        "hashed_password": hashed_pw,
        "role": role,
        "active_status": True,
        "dpr_generation_permission": user_data.dpr_generation_permission,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await db.users.insert_one(user_dict)
    user_id = str(result.inserted_id)
    
    # Audit log
    await audit_service.log_action(
        organisation_id=organisation_id,
        module_name="USER_MANAGEMENT",
        entity_type="USER",
        entity_id=user_id,
        action_type="CREATE",
        user_id=user_id,
        new_value={"email": user_data.email, "role": role}
    )
    
    # Return user response
    user_dict["user_id"] = user_id
    del user_dict["hashed_password"]
    return UserResponse(**user_dict)


@api_router.post("/auth/login", response_model=Token)
async def login(login_data: LoginRequest):
    """
    Authenticate user and return JWT tokens.
    
    CORRECTED: Access token expires in 30 minutes (not 30 days).
    Refresh token expires in 7 days.
    """
    # Find user by email
    user = await db.users.find_one({"email": login_data.email})
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Verify password
    if not verify_password(login_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Check active status
    if not user.get("active_status", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    # Create tokens
    user_id = str(user["_id"])
    token_data = {
        "user_id": user_id,
        "email": user["email"],
        "role": user["role"],
        "organisation_id": user["organisation_id"]
    }
    
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(user_id=user_id)
    
    # Store refresh token in database (for token rotation)
    from auth import decode_refresh_token
    refresh_payload = decode_refresh_token(refresh_token)
    
    refresh_token_doc = {
        "jti": refresh_payload["jti"],
        "user_id": user_id,
        "token_hash": hash_password(refresh_token),  # Store hashed
        "expires_at": datetime.utcfromtimestamp(refresh_payload["exp"]),
        "is_revoked": False,
        "created_at": datetime.utcnow()
    }
    
    await db.refresh_tokens.insert_one(refresh_token_doc)
    
    # Prepare user response
    user_response = UserResponse(
        user_id=user_id,
        organisation_id=user["organisation_id"],
        name=user["name"],
        email=user["email"],
        role=user["role"],
        active_status=user["active_status"],
        dpr_generation_permission=user.get("dpr_generation_permission", False),
        assigned_projects=user.get("assigned_projects", []),
        screen_permissions=user.get("screen_permissions", []),
        created_at=user["created_at"],
        updated_at=user["updated_at"]
    )
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=1800,  # 30 minutes in seconds
        user=user_response
    )


@api_router.post("/auth/refresh", response_model=Token)
async def refresh_access_token(request: RefreshTokenRequest):
    """
    Refresh access token using refresh token.
    
    Token Rotation: Old refresh token is revoked, new one is issued.
    """
    try:
        # Decode refresh token
        payload = decode_refresh_token(request.refresh_token)
        jti = payload["jti"]
        user_id = payload["user_id"]
        
        # Check if refresh token exists and is not revoked
        token_doc = await db.refresh_tokens.find_one({
            "jti": jti,
            "user_id": user_id,
            "is_revoked": False
        })
        
        if not token_doc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token is invalid or has been revoked"
            )
        
        # Get user
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        
        if not user or not user.get("active_status", False):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
        
        # Revoke old refresh token
        await db.refresh_tokens.update_one(
            {"jti": jti},
            {"$set": {"is_revoked": True}}
        )
        
        # Create new tokens (token rotation)
        token_data = {
            "user_id": user_id,
            "email": user["email"],
            "role": user["role"],
            "organisation_id": user["organisation_id"]
        }
        
        new_access_token = create_access_token(data=token_data)
        new_refresh_token = create_refresh_token(user_id=user_id)
        
        # Store new refresh token
        new_refresh_payload = decode_refresh_token(new_refresh_token)
        
        new_refresh_token_doc = {
            "jti": new_refresh_payload["jti"],
            "user_id": user_id,
            "token_hash": hash_password(new_refresh_token),
            "expires_at": datetime.utcfromtimestamp(new_refresh_payload["exp"]),
            "is_revoked": False,
            "created_at": datetime.utcnow()
        }
        
        await db.refresh_tokens.insert_one(new_refresh_token_doc)
        
        # Prepare user response
        user_response = UserResponse(
            user_id=user_id,
            organisation_id=user["organisation_id"],
            name=user["name"],
            email=user["email"],
            role=user["role"],
            active_status=user["active_status"],
            dpr_generation_permission=user.get("dpr_generation_permission", False),
            created_at=user["created_at"],
            updated_at=user["updated_at"]
        )
        
        return Token(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            expires_in=1800,  # 30 minutes
            user=user_response
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Refresh token error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )


# ============================================
# USER MANAGEMENT ENDPOINTS
# ============================================

@api_router.get("/users", response_model=List[UserResponse])
async def get_users(current_user: dict = Depends(get_current_user)):
    """Get all users in the organisation"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    # Filter by organisation
    users = await db.users.find(
        {"organisation_id": user["organisation_id"]}
    ).to_list(length=None)
    
    # Convert to response format
    user_list = []
    for u in users:
        user_list.append(UserResponse(
            user_id=str(u["_id"]),
            organisation_id=u["organisation_id"],
            name=u["name"],
            email=u["email"],
            role=u["role"],
            active_status=u["active_status"],
            dpr_generation_permission=u.get("dpr_generation_permission", False),
            created_at=u["created_at"],
            updated_at=u["updated_at"]
        ))
    
    return user_list


@api_router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get specific user by ID"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    target_user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check organisation match
    if target_user["organisation_id"] != user["organisation_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return UserResponse(
        user_id=str(target_user["_id"]),
        organisation_id=target_user["organisation_id"],
        name=target_user["name"],
        email=target_user["email"],
        role=target_user["role"],
        active_status=target_user["active_status"],
        dpr_generation_permission=target_user.get("dpr_generation_permission", False),
        created_at=target_user["created_at"],
        updated_at=target_user["updated_at"]
    )


@api_router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    update_data: UserUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update user (Admin only)"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    # Get existing user
    target_user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check organisation match
    if target_user["organisation_id"] != user["organisation_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Prepare update
    update_dict = update_data.dict(exclude_unset=True)
    update_dict["updated_at"] = datetime.utcnow()
    
    # Update user
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": update_dict}
    )
    
    # Audit log
    await audit_service.log_action(
        organisation_id=user["organisation_id"],
        module_name="USER_MANAGEMENT",
        entity_type="USER",
        entity_id=user_id,
        action_type="UPDATE",
        user_id=user["user_id"],
        old_value={"role": target_user.get("role"), "active_status": target_user.get("active_status")},
        new_value=update_dict
    )
    
    # Get updated user
    updated_user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    return UserResponse(
        user_id=str(updated_user["_id"]),
        organisation_id=updated_user["organisation_id"],
        name=updated_user["name"],
        email=updated_user["email"],
        role=updated_user["role"],
        active_status=updated_user["active_status"],
        dpr_generation_permission=updated_user.get("dpr_generation_permission", False),
        assigned_projects=updated_user.get("assigned_projects", []),
        screen_permissions=updated_user.get("screen_permissions", []),
        created_at=updated_user["created_at"],
        updated_at=updated_user["updated_at"]
    )


@api_router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete/deactivate user (Admin only)"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    target_user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if target_user["organisation_id"] != user["organisation_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Don't allow deleting self
    if str(target_user["_id"]) == user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    # Soft delete - deactivate
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"active_status": False, "updated_at": datetime.utcnow()}}
    )
    
    return {"message": "User deactivated successfully"}


# ============================================
# PROJECT ENDPOINTS
# ============================================

@api_router.post("/projects", status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create new project (Admin only)"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    project_dict = project_data.dict()
    project_dict["organisation_id"] = user["organisation_id"]
    project_dict["created_at"] = datetime.utcnow()
    project_dict["updated_at"] = datetime.utcnow()
    
    result = await db.projects.insert_one(project_dict)
    project_id = str(result.inserted_id)
    
    # Audit log
    await audit_service.log_action(
        organisation_id=user["organisation_id"],
        module_name="PROJECT_MANAGEMENT",
        entity_type="PROJECT",
        entity_id=project_id,
        action_type="CREATE",
        user_id=user["user_id"],
        project_id=project_id,
        new_value={"project_name": project_data.project_name}
    )
    
    project_dict["project_id"] = project_id
    # Remove MongoDB _id to avoid serialization issues
    if "_id" in project_dict:
        del project_dict["_id"]
    return project_dict


@api_router.get("/projects")
async def get_projects(current_user: dict = Depends(get_current_user)):
    """Get all projects user has access to"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    # Admin sees all projects in organisation
    if user["role"] == "Admin":
        projects = await db.projects.find(
            {"organisation_id": user["organisation_id"]}
        ).to_list(length=None)
    else:
        # Get projects from user_project_map
        mappings = await db.user_project_map.find(
            {"user_id": user["user_id"]}
        ).to_list(length=None)
        
        project_ids = [m["project_id"] for m in mappings]
        
        projects = await db.projects.find(
            {"_id": {"$in": project_ids}, "organisation_id": user["organisation_id"]}
        ).to_list(length=None)
    
    # Convert ObjectId to string
    for p in projects:
        p["project_id"] = str(p.pop("_id"))
    
    return projects


@api_router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get specific project"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_project_access(user, project_id, require_write=False)
    
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    project["project_id"] = str(project.pop("_id"))
    return project


@api_router.put("/projects/{project_id}")
async def update_project(
    project_id: str,
    update_data: ProjectUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update project (Admin only)"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    await permission_checker.verify_project_organisation(project_id, user["organisation_id"])
    
    # Get existing project
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Prepare update
    update_dict = update_data.dict(exclude_unset=True)
    update_dict["updated_at"] = datetime.utcnow()
    
    # Update project
    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": update_dict}
    )
    
    # Audit log
    await audit_service.log_action(
        organisation_id=user["organisation_id"],
        module_name="PROJECT_MANAGEMENT",
        entity_type="PROJECT",
        entity_id=project_id,
        action_type="UPDATE",
        user_id=user["user_id"],
        project_id=project_id,
        old_value={"project_name": project.get("project_name")},
        new_value=update_dict
    )
    
    # Recalculate financials if retention/GST changed
    if any(k in update_dict for k in ["project_retention_percentage", "project_cgst_percentage", "project_sgst_percentage"]):
        await financial_service.recalculate_all_project_financials(project_id)
    
    # Get updated project
    updated_project = await db.projects.find_one({"_id": ObjectId(project_id)})
    updated_project["project_id"] = str(updated_project.pop("_id"))
    
    return updated_project


# ============================================
# CODE MASTER ENDPOINTS
# ============================================

@api_router.post("/codes", status_code=status.HTTP_201_CREATED)
async def create_code(
    code_data: CodeMasterCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create new code (Admin only)"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    # Check if code_short already exists
    existing = await db.code_master.find_one({"code_short": code_data.code_short})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code short already exists"
        )
    
    code_dict = code_data.dict()
    code_dict["active_status"] = True
    code_dict["created_at"] = datetime.utcnow()
    code_dict["updated_at"] = datetime.utcnow()
    
    result = await db.code_master.insert_one(code_dict)
    code_id = str(result.inserted_id)
    
    # Audit log
    await audit_service.log_action(
        organisation_id=user["organisation_id"],
        module_name="CODE_MASTER",
        entity_type="CODE",
        entity_id=code_id,
        action_type="CREATE",
        user_id=user["user_id"],
        new_value={"code_short": code_data.code_short}
    )
    
    code_dict["code_id"] = code_id
    # Remove MongoDB _id to avoid serialization issues
    if "_id" in code_dict:
        del code_dict["_id"]
    return code_dict


@api_router.get("/codes")
async def get_codes(
    active_only: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """Get all codes"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    query = {}
    if active_only:
        query["active_status"] = True
    
    codes = await db.code_master.find(query).to_list(length=None)
    
    for c in codes:
        c["code_id"] = str(c.pop("_id"))
    
    return codes


@api_router.put("/codes/{code_id}")
async def update_code(
    code_id: str,
    update_data: CodeMasterUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update code (Admin only)"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    code = await db.code_master.find_one({"_id": ObjectId(code_id)})
    
    if not code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Code not found"
        )
    
    update_dict = update_data.dict(exclude_unset=True)
    update_dict["updated_at"] = datetime.utcnow()
    
    await db.code_master.update_one(
        {"_id": ObjectId(code_id)},
        {"$set": update_dict}
    )
    
    # Audit log
    await audit_service.log_action(
        organisation_id=user["organisation_id"],
        module_name="CODE_MASTER",
        entity_type="CODE",
        entity_id=code_id,
        action_type="UPDATE",
        user_id=user["user_id"],
        old_value={"active_status": code.get("active_status")},
        new_value=update_dict
    )
    
    updated_code = await db.code_master.find_one({"_id": ObjectId(code_id)})
    updated_code["code_id"] = str(updated_code.pop("_id"))
    
    return updated_code


@api_router.delete("/codes/{code_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_code(
    code_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete code (Admin only).
    RULE: If referenced in budgets, prevent delete - only allow active_status = False
    """
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    # Check if code is referenced in budgets
    budget_ref = await db.project_budgets.find_one({"code_id": code_id})
    
    if budget_ref:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete code - it is referenced in project budgets. Set active_status to False instead."
        )
    
    # Safe to delete
    await db.code_master.delete_one({"_id": code_id})
    
    # Audit log
    await audit_service.log_action(
        organisation_id=user["organisation_id"],
        module_name="CODE_MASTER",
        entity_type="CODE",
        entity_id=code_id,
        action_type="DELETE",
        user_id=user["user_id"]
    )
    
    return None


# ============================================
# PROJECT BUDGET ENDPOINTS
# ============================================

@api_router.post("/budgets", status_code=status.HTTP_201_CREATED)
async def create_budget(
    budget_data: ProjectBudgetCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create project budget (Admin only)"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    # Verify project and code exist
    project = await db.projects.find_one({"_id": ObjectId(budget_data.project_id)})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    code = await db.code_master.find_one({"_id": ObjectId(budget_data.code_id)})
    if not code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Code not found"
        )
    
    # Check if budget already exists
    existing = await db.project_budgets.find_one({
        "project_id": budget_data.project_id,
        "code_id": budget_data.code_id
    })
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Budget already exists for this project and code combination"
        )
    
    # Validate amount
    if budget_data.approved_budget_amount < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Budget amount must be >= 0"
        )
    
    budget_dict = budget_data.dict()
    budget_dict["created_at"] = datetime.utcnow()
    budget_dict["updated_at"] = datetime.utcnow()
    
    # Create budget (without transaction for single MongoDB instance)
    result = await db.project_budgets.insert_one(budget_dict)
    budget_id = str(result.inserted_id)
    
    # Trigger financial recalculation
    await financial_service.recalculate_project_code_financials(
        project_id=budget_data.project_id,
        code_id=budget_data.code_id
    )
    
    # Audit log (after transaction commit)
    await audit_service.log_action(
        organisation_id=user["organisation_id"],
        module_name="BUDGET_MANAGEMENT",
        entity_type="BUDGET",
        entity_id=budget_id,
        action_type="CREATE",
        user_id=user["user_id"],
        project_id=budget_data.project_id,
        new_value={"approved_budget_amount": budget_data.approved_budget_amount}
    )
    
    budget_dict["budget_id"] = budget_id
    # Remove MongoDB _id to avoid serialization issues
    if "_id" in budget_dict:
        del budget_dict["_id"]
    return budget_dict


@api_router.get("/budgets")
async def get_budgets(
    project_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get budgets with enriched financial state data"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    query = {}
    if project_id:
        await permission_checker.check_project_access(user, project_id, require_write=False)
        query["project_id"] = project_id
    
    budgets = await db.project_budgets.find(query).to_list(length=None)
    
    result = []
    for b in budgets:
        b["budget_id"] = str(b.pop("_id"))
        
        # Enrich with financial state data for UI-6 validation
        financial_state = await db.financial_state.find_one({
            "project_id": b["project_id"],
            "code_id": b["code_id"]
        })
        
        if financial_state:
            b["committed_value"] = financial_state.get("committed_value", 0)
            b["certified_value"] = financial_state.get("certified_value", 0)
            b["balance_remaining"] = financial_state.get("balance_budget_remaining", 0)
            b["over_commit_flag"] = financial_state.get("over_commit_flag", False)
        else:
            # Default values when no financial activity yet
            b["committed_value"] = 0
            b["certified_value"] = 0
            b["balance_remaining"] = b.get("approved_budget_amount", 0)
            b["over_commit_flag"] = False
        
        result.append(serialize_doc(b))
    
    return result


@api_router.put("/budgets/{budget_id}")
async def update_budget(
    budget_id: str,
    update_data: ProjectBudgetUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Update budget (Admin only) - ROUTED TO HARDENED ENGINE.
    
    PHASE 2: This endpoint now uses the hardened financial engine
    with transaction atomicity and invariant enforcement.
    """
    from hardened_routes import hardened_engine
    
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    # Route to hardened engine
    result = await hardened_engine.modify_budget(
        budget_id=budget_id,
        organisation_id=user["organisation_id"],
        user_id=user["user_id"],
        new_amount=update_data.approved_budget_amount
    )
    
    # Return updated budget
    updated_budget = await db.project_budgets.find_one({"_id": ObjectId(budget_id)})
    updated_budget["budget_id"] = str(updated_budget.pop("_id"))
    
    return updated_budget


# ============================================
# DERIVED FINANCIAL STATE ENDPOINTS
# ============================================

@api_router.get("/financial-state")
async def get_financial_state(
    project_id: str,
    code_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get derived financial state for project"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_project_access(user, project_id, require_write=False)
    
    query = {"project_id": project_id}
    if code_id:
        query["code_id"] = code_id
    
    states = await db.derived_financial_state.find(query).to_list(length=None)
    
    for s in states:
        s["state_id"] = str(s.pop("_id"))
    
    return states


# ============================================
# USER-PROJECT MAPPING ENDPOINTS
# ============================================

@api_router.post("/mappings", status_code=status.HTTP_201_CREATED)
async def create_mapping(
    mapping_data: UserProjectMapCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create user-project mapping (Admin only)"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    # Verify user and project exist
    target_user = await db.users.find_one({"_id": ObjectId(mapping_data.user_id)})
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    project = await db.projects.find_one({"_id": ObjectId(mapping_data.project_id)})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check if mapping already exists
    existing = await db.user_project_map.find_one({
        "user_id": mapping_data.user_id,
        "project_id": mapping_data.project_id
    })
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mapping already exists"
        )
    
    mapping_dict = mapping_data.dict()
    mapping_dict["created_at"] = datetime.utcnow()
    
    result = await db.user_project_map.insert_one(mapping_dict)
    map_id = str(result.inserted_id)
    
    # Audit log
    await audit_service.log_action(
        organisation_id=user["organisation_id"],
        module_name="ACCESS_CONTROL",
        entity_type="USER_PROJECT_MAP",
        entity_id=map_id,
        action_type="CREATE",
        user_id=user["user_id"],
        project_id=mapping_data.project_id,
        new_value={"user_id": mapping_data.user_id, "project_id": mapping_data.project_id}
    )
    
    mapping_dict["map_id"] = map_id
    # Remove MongoDB _id to avoid serialization issues
    if "_id" in mapping_dict:
        del mapping_dict["_id"]
    return mapping_dict


@api_router.get("/mappings")
async def get_mappings(
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get user-project mappings"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    query = {}
    if user_id:
        query["user_id"] = user_id
    if project_id:
        query["project_id"] = project_id
    
    mappings = await db.user_project_map.find(query).to_list(length=None)
    
    for m in mappings:
        m["map_id"] = str(m.pop("_id"))
    
    return mappings


@api_router.delete("/mappings/{map_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mapping(
    map_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete user-project mapping (Admin only)"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    mapping = await db.user_project_map.find_one({"_id": ObjectId(map_id)})
    
    if not mapping:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mapping not found"
        )
    
    await db.user_project_map.delete_one({"_id": ObjectId(map_id)})
    
    # Audit log
    await audit_service.log_action(
        organisation_id=user["organisation_id"],
        module_name="ACCESS_CONTROL",
        entity_type="USER_PROJECT_MAP",
        entity_id=map_id,
        action_type="DELETE",
        user_id=user["user_id"],
        project_id=mapping["project_id"]
    )
    
    return None


# ============================================
# AUDIT LOG ENDPOINTS (READ ONLY)
# ============================================

@api_router.get("/audit-logs")
async def get_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    project_id: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get audit logs (Admin only)"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    logs = await audit_service.get_audit_logs(
        organisation_id=user["organisation_id"],
        entity_type=entity_type,
        entity_id=entity_id,
        project_id=project_id,
        limit=limit
    )
    
    return logs


# ============================================
# PETTY CASH ENDPOINTS
# ============================================

@api_router.get("/petty-cash")
async def get_petty_cash(
    project_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get petty cash entries"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    query = {"organisation_id": user["organisation_id"]}
    if project_id:
        query["project_id"] = project_id
    
    entries = await db.petty_cash.find(query).sort("date", -1).to_list(length=100)
    
    for entry in entries:
        entry["petty_cash_id"] = str(entry.pop("_id"))
    
    return entries


@api_router.post("/petty-cash", status_code=status.HTTP_201_CREATED)
async def create_petty_cash(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Create petty cash entry"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    entry = {
        "organisation_id": user["organisation_id"],
        "project_id": data.get("project_id"),
        "date": datetime.fromisoformat(data.get("date").replace("Z", "+00:00")) if isinstance(data.get("date"), str) else data.get("date"),
        "description": data.get("description"),
        "amount": float(data.get("amount", 0)),
        "type": data.get("type", "expense"),
        "category": data.get("category", "general"),
        "receipt_url": data.get("receipt_url"),
        "status": "pending",
        "created_by": user["user_id"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await db.petty_cash.insert_one(entry)
    entry["petty_cash_id"] = str(result.inserted_id)
    if "_id" in entry:
        del entry["_id"]
    
    return entry


@api_router.put("/petty-cash/{entry_id}")
async def update_petty_cash(
    entry_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update petty cash entry"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    existing = await db.petty_cash.find_one({"_id": ObjectId(entry_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    update_data = {
        "description": data.get("description", existing.get("description")),
        "amount": float(data.get("amount", existing.get("amount"))),
        "type": data.get("type", existing.get("type")),
        "category": data.get("category", existing.get("category")),
        "updated_at": datetime.utcnow()
    }
    
    await db.petty_cash.update_one({"_id": ObjectId(entry_id)}, {"$set": update_data})
    
    updated = await db.petty_cash.find_one({"_id": ObjectId(entry_id)})
    updated["petty_cash_id"] = str(updated.pop("_id"))
    return updated


@api_router.delete("/petty-cash/{entry_id}")
async def delete_petty_cash(
    entry_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete petty cash entry"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    existing = await db.petty_cash.find_one({"_id": ObjectId(entry_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    await db.petty_cash.delete_one({"_id": ObjectId(entry_id)})
    return {"message": "Entry deleted successfully"}


@api_router.post("/petty-cash/{entry_id}/approve")
async def approve_petty_cash(
    entry_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Approve petty cash entry"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    await db.petty_cash.update_one(
        {"_id": ObjectId(entry_id)},
        {"$set": {"status": "approved", "approved_by": user["user_id"], "updated_at": datetime.utcnow()}}
    )
    
    return {"message": "Entry approved"}


# ============================================
# ORGANIZATION SETTINGS
# ============================================

@api_router.get("/organisation-settings")
async def get_organisation_settings(
    current_user: dict = Depends(get_current_user)
):
    """Get organisation settings"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    settings = await db.organisation_settings.find_one({
        "organisation_id": user["organisation_id"]
    })
    
    if not settings:
        # Return defaults
        return {
            "organisation_id": user["organisation_id"],
            "name": "My Organisation",
            "address": "",
            "email": "",
            "phone": "",
            "gst_number": "",
            "pan_number": "",
            "cgst_percentage": 9.0,
            "sgst_percentage": 9.0,
            "wo_prefix": "WO",
            "pc_prefix": "PC",
            "invoice_prefix": "INV",
            "terms_and_conditions": "",
            "currency": "INR",
            "currency_symbol": "₹",
        }
    
    settings["settings_id"] = str(settings.pop("_id"))
    return settings


@api_router.put("/organisation-settings")
async def update_organisation_settings(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update organisation settings"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    update_data = {
        "organisation_id": user["organisation_id"],
        "name": data.get("name", ""),
        "address": data.get("address", ""),
        "email": data.get("email", ""),
        "phone": data.get("phone", ""),
        "logo_base64": data.get("logo_base64", ""),
        "gst_number": data.get("gst_number", ""),
        "pan_number": data.get("pan_number", ""),
        "cgst_percentage": float(data.get("cgst_percentage", 9.0)),
        "sgst_percentage": float(data.get("sgst_percentage", 9.0)),
        "wo_prefix": data.get("wo_prefix", "WO"),
        "pc_prefix": data.get("pc_prefix", "PC"),
        "invoice_prefix": data.get("invoice_prefix", "INV"),
        "terms_and_conditions": data.get("terms_and_conditions", ""),
        "currency": data.get("currency", "INR"),
        "currency_symbol": data.get("currency_symbol", "₹"),
        "owner_name": data.get("owner_name", ""),
        "owner_mobile": data.get("owner_mobile", ""),
        "owner_address": data.get("owner_address", ""),
        "owner_email": data.get("owner_email", ""),
        "updated_at": datetime.utcnow(),
    }
    
    await db.organisation_settings.update_one(
        {"organisation_id": user["organisation_id"]},
        {"$set": update_data},
        upsert=True
    )
    
    return {"message": "Settings updated successfully", **update_data}


# ============================================
# HEALTH CHECK
# ============================================

# ============================================
# WORKERS DAILY LOG ENDPOINTS
# ============================================

@api_router.post("/worker-logs", status_code=status.HTTP_201_CREATED)
async def create_worker_log(
    log_data: WorkersDailyLogCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new workers daily log (Supervisor)"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    # Check if log already exists for this date and project
    existing = await db.worker_logs.find_one({
        "project_id": log_data.project_id,
        "date": log_data.date,
        "supervisor_id": user["user_id"]
    })
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Worker log already exists for this date. Please update the existing log."
        )
    
    # Calculate totals
    total_workers = len(log_data.workers)
    total_hours = sum(w.hours_worked for w in log_data.workers)
    
    log_dict = {
        "organisation_id": user["organisation_id"],
        "project_id": log_data.project_id,
        "date": log_data.date,
        "supervisor_id": user["user_id"],
        "supervisor_name": user["name"],
        "workers": [w.dict() for w in log_data.workers],
        "total_workers": total_workers,
        "total_hours": total_hours,
        "weather": log_data.weather,
        "site_conditions": log_data.site_conditions,
        "remarks": log_data.remarks,
        "status": "draft",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await db.worker_logs.insert_one(log_dict)
    log_dict["log_id"] = str(result.inserted_id)
    del log_dict["_id"] if "_id" in log_dict else None
    
    return log_dict


@api_router.get("/worker-logs")
async def get_worker_logs(
    project_id: Optional[str] = None,
    date: Optional[str] = None,
    supervisor_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get workers daily logs with optional filters"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    query = {"organisation_id": user["organisation_id"]}
    
    if project_id:
        query["project_id"] = project_id
    if date:
        query["date"] = date
    if supervisor_id:
        query["supervisor_id"] = supervisor_id
    if status:
        query["status"] = status
    
    logs = await db.worker_logs.find(query).sort("date", -1).to_list(length=100)
    
    for log in logs:
        log["log_id"] = str(log.pop("_id"))
    
    return logs


@api_router.get("/worker-logs/{log_id}")
async def get_worker_log(
    log_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific worker log by ID"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    log = await db.worker_logs.find_one({
        "_id": ObjectId(log_id),
        "organisation_id": user["organisation_id"]
    })
    
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worker log not found"
        )
    
    log["log_id"] = str(log.pop("_id"))
    return log


@api_router.put("/worker-logs/{log_id}")
async def update_worker_log(
    log_id: str,
    update_data: WorkersDailyLogUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a workers daily log"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    log = await db.worker_logs.find_one({
        "_id": ObjectId(log_id),
        "organisation_id": user["organisation_id"]
    })
    
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worker log not found"
        )
    
    # Prepare update
    update_dict = {}
    
    if update_data.workers is not None:
        update_dict["workers"] = [w.dict() for w in update_data.workers]
        update_dict["total_workers"] = len(update_data.workers)
        update_dict["total_hours"] = sum(w.hours_worked for w in update_data.workers)
    
    if update_data.weather is not None:
        update_dict["weather"] = update_data.weather
    if update_data.site_conditions is not None:
        update_dict["site_conditions"] = update_data.site_conditions
    if update_data.remarks is not None:
        update_dict["remarks"] = update_data.remarks
    if update_data.status is not None:
        update_dict["status"] = update_data.status
    
    update_dict["updated_at"] = datetime.utcnow()
    
    await db.worker_logs.update_one(
        {"_id": ObjectId(log_id)},
        {"$set": update_dict}
    )
    
    updated_log = await db.worker_logs.find_one({"_id": ObjectId(log_id)})
    updated_log["log_id"] = str(updated_log.pop("_id"))
    
    return updated_log


@api_router.get("/worker-logs/check/{project_id}/{date}")
async def check_worker_log_exists(
    project_id: str,
    date: str,
    current_user: dict = Depends(get_current_user)
):
    """Check if worker log exists for a specific date and project"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    log = await db.worker_logs.find_one({
        "project_id": project_id,
        "date": date,
        "supervisor_id": user["user_id"]
    })
    
    return {
        "exists": log is not None,
        "log_id": str(log["_id"]) if log else None,
        "status": log.get("status") if log else None
    }


@api_router.get("/worker-logs/report/summary")
async def get_worker_logs_summary(
    project_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get summary report of worker logs for admin"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    query = {"organisation_id": user["organisation_id"]}
    
    if project_id:
        query["project_id"] = project_id
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}
    
    logs = await db.worker_logs.find(query).to_list(length=1000)
    
    # Calculate summary statistics
    total_logs = len(logs)
    total_workers = sum(log.get("total_workers", 0) for log in logs)
    total_hours = sum(log.get("total_hours", 0) for log in logs)
    
    # Group by skill type
    skill_breakdown = {}
    for log in logs:
        for worker in log.get("workers", []):
            skill = worker.get("skill_type", "Unknown")
            if skill not in skill_breakdown:
                skill_breakdown[skill] = {"count": 0, "hours": 0}
            skill_breakdown[skill]["count"] += 1
            skill_breakdown[skill]["hours"] += worker.get("hours_worked", 0)
    
    return {
        "total_logs": total_logs,
        "total_workers": total_workers,
        "total_hours": total_hours,
        "skill_breakdown": skill_breakdown,
        "date_range": {
            "start": start_date,
            "end": end_date
        }
    }


@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow(),
        "version": "1.0.0",
        "phase": "Phase 1 - Foundation"
    }


# Include router in main app
app.include_router(api_router)

# Include Phase 2 hardened routes
from hardened_routes import hardened_router
app.include_router(hardened_router)

# Include Phase 2 Wave 2 lifecycle routes
from wave2_routes import wave2_router
app.include_router(wave2_router)

# Include Phase 2 Wave 3 routes
from wave3_routes import wave3_router
app.include_router(wave3_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
