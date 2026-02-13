from fastapi import HTTPException, status, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from auth import get_current_user
import logging

logger = logging.getLogger(__name__)

class PermissionChecker:
    """
    Permission enforcement middleware for Phase 1.
    
    RULES:
    1. User must be authenticated
    2. User must have active_status = TRUE
    3. For project-specific operations, user_project_map entry must exist
    4. Role-based permissions apply
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_authenticated_user(self, current_user: dict = Depends(get_current_user)):
        """Get and validate authenticated user"""
        user_id = current_user.get("user_id")
        
        # Fetch user from database
        user = await self.db.users.find_one({"_id": ObjectId(user_id)})
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        # Check active status
        if not user.get("active_status", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )
        
        # Convert _id to user_id for consistency
        user["user_id"] = str(user.pop("_id"))
        
        return user
    
    async def check_project_access(
        self,
        user: dict,
        project_id: str,
        require_write: bool = False
    ):
        """
        Check if user has access to a specific project.
        
        Args:
            user: User dict from get_authenticated_user
            project_id: Project ID to check access for
            require_write: If True, check for write access; else check for read access
        """
        # Admins have automatic access to all projects
        if user.get("role") == "Admin":
            return True
        
        # Check user_project_map
        mapping = await self.db.user_project_map.find_one({
            "user_id": user["user_id"],
            "project_id": project_id
        })
        
        if not mapping:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User does not have access to this project"
            )
        
        # Check access type
        if require_write and not mapping.get("write_access", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User does not have write access to this project"
            )
        
        if not mapping.get("read_access", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User does not have read access to this project"
            )
        
        return True
    
    async def check_admin_role(self, user: dict):
        """Check if user has Admin role"""
        if user.get("role") != "Admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin role required for this operation"
            )
        return True
    
    async def verify_project_organisation(
        self,
        project_id: str,
        organisation_id: str
    ):
        """Verify that project belongs to the user's organisation"""
        project = await self.db.projects.find_one({"_id": project_id})
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        if project.get("organisation_id") != organisation_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Project does not belong to your organisation"
            )
        
        return True
