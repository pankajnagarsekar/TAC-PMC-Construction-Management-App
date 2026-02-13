from fastapi import FastAPI, APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
from pathlib import Path
from typing import List, Optional
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
    Token, LoginRequest
)
from auth import hash_password, verify_password, create_access_token, get_current_user
from audit_service import AuditService
from financial_service import FinancialRecalculationService
from permissions import PermissionChecker

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
app = FastAPI(title="Construction Management System - Phase 1", version="1.0.0")

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
    """Authenticate user and return JWT token"""
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
    
    # Create access token
    user_id = str(user["_id"])
    token_data = {
        "user_id": user_id,
        "email": user["email"],
        "role": user["role"],
        "organisation_id": user["organisation_id"]
    }
    
    access_token = create_access_token(data=token_data)
    
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
    
    return Token(access_token=access_token, user=user_response)


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
    
    target_user = await db.users.find_one({"_id": user_id})
    
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
    target_user = await db.users.find_one({"_id": user_id})
    
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
        {"_id": user_id},
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
    updated_user = await db.users.find_one({"_id": user_id})
    
    return UserResponse(
        user_id=str(updated_user["_id"]),
        organisation_id=updated_user["organisation_id"],
        name=updated_user["name"],
        email=updated_user["email"],
        role=updated_user["role"],
        active_status=updated_user["active_status"],
        dpr_generation_permission=updated_user.get("dpr_generation_permission", False),
        created_at=updated_user["created_at"],
        updated_at=updated_user["updated_at"]
    )


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
    
    project = await db.projects.find_one({"_id": project_id})
    
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
    project = await db.projects.find_one({"_id": project_id})
    
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
        {"_id": project_id},
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
    updated_project = await db.projects.find_one({"_id": project_id})
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
    
    code = await db.code_master.find_one({"_id": code_id})
    
    if not code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Code not found"
        )
    
    update_dict = update_data.dict(exclude_unset=True)
    update_dict["updated_at"] = datetime.utcnow()
    
    await db.code_master.update_one(
        {"_id": code_id},
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
    
    updated_code = await db.code_master.find_one({"_id": code_id})
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
    project = await db.projects.find_one({"_id": budget_data.project_id})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    code = await db.code_master.find_one({"_id": budget_data.code_id})
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
    
    # Transaction-safe budget creation + financial recalculation
    async with await client.start_session() as session:
        async with session.start_transaction():
            result = await db.project_budgets.insert_one(budget_dict, session=session)
            budget_id = str(result.inserted_id)
            
            # Trigger financial recalculation
            await financial_service.recalculate_project_code_financials(
                project_id=budget_data.project_id,
                code_id=budget_data.code_id,
                session=session
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
    return budget_dict


@api_router.get("/budgets")
async def get_budgets(
    project_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get budgets"""
    user = await permission_checker.get_authenticated_user(current_user)
    
    query = {}
    if project_id:
        await permission_checker.check_project_access(user, project_id, require_write=False)
        query["project_id"] = project_id
    
    budgets = await db.project_budgets.find(query).to_list(length=None)
    
    for b in budgets:
        b["budget_id"] = str(b.pop("_id"))
    
    return budgets


@api_router.put("/budgets/{budget_id}")
async def update_budget(
    budget_id: str,
    update_data: ProjectBudgetUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update budget (Admin only) - triggers financial recalculation"""
    user = await permission_checker.get_authenticated_user(current_user)
    await permission_checker.check_admin_role(user)
    
    budget = await db.project_budgets.find_one({"_id": budget_id})
    
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    
    # Validate amount
    if update_data.approved_budget_amount < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Budget amount must be >= 0"
        )
    
    old_amount = budget["approved_budget_amount"]
    
    update_dict = {
        "approved_budget_amount": update_data.approved_budget_amount,
        "updated_at": datetime.utcnow()
    }
    
    # Transaction-safe update + recalculation
    async with await client.start_session() as session:
        async with session.start_transaction():
            await db.project_budgets.update_one(
                {"_id": budget_id},
                {"$set": update_dict},
                session=session
            )
            
            # Trigger financial recalculation
            await financial_service.recalculate_project_code_financials(
                project_id=budget["project_id"],
                code_id=budget["code_id"],
                session=session
            )
    
    # Audit log (after transaction commit)
    await audit_service.log_action(
        organisation_id=user["organisation_id"],
        module_name="BUDGET_MANAGEMENT",
        entity_type="BUDGET",
        entity_id=budget_id,
        action_type="UPDATE",
        user_id=user["user_id"],
        project_id=budget["project_id"],
        old_value={"approved_budget_amount": old_amount},
        new_value={"approved_budget_amount": update_data.approved_budget_amount}
    )
    
    updated_budget = await db.project_budgets.find_one({"_id": budget_id})
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
    target_user = await db.users.find_one({"_id": mapping_data.user_id})
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    project = await db.projects.find_one({"_id": mapping_data.project_id})
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
    
    mapping = await db.user_project_map.find_one({"_id": map_id})
    
    if not mapping:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mapping not found"
        )
    
    await db.user_project_map.delete_one({"_id": map_id})
    
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
# HEALTH CHECK
# ============================================

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
