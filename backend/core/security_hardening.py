"""
PHASE 2 WAVE 3 - PILLAR D: SECURITY HARDENING

Implements:
1. Organisation_ID filtering on ALL queries
2. All endpoints require authentication
3. Signed URLs for media retrieval
4. Private file storage
5. Prevent direct file path access
6. Audit all mutation endpoints
7. Configurable retention periods

RULES:
- No data leakage between organisations
- All media access via signed URLs
- All mutations logged
"""

from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from bson import ObjectId
import hashlib
import hmac
import base64
import secrets
import logging
import os

logger = logging.getLogger(__name__)


class SecurityError(Exception):
    """Security violation error"""
    pass


class OrganisationAccessError(SecurityError):
    """Raised when trying to access data from wrong organisation"""
    def __init__(self, user_org: str, resource_org: str):
        super().__init__(f"Access denied: User org {user_org} cannot access resource from org {resource_org}")


class SignedURLExpiredError(SecurityError):
    """Raised when signed URL has expired"""
    pass


class SignedURLInvalidError(SecurityError):
    """Raised when signed URL signature is invalid"""
    pass


class SecurityHardening:
    """
    Security Hardening Layer.
    
    Features:
    - Organisation isolation
    - Signed URLs
    - Mutation auditing
    - Configurable retention
    """
    
    # Default signing key (should be from environment in production)
    SIGNING_KEY = os.environ.get("URL_SIGNING_KEY", "default-signing-key-change-in-production")
    
    # Default signed URL expiration (hours)
    DEFAULT_URL_EXPIRATION = 24
    
    def __init__(self, client: AsyncIOMotorClient, db: AsyncIOMotorDatabase):
        self.client = client
        self.db = db
    
    # =========================================================================
    # ORGANISATION ISOLATION
    # =========================================================================
    
    def enforce_organisation_filter(
        self,
        query: Dict,
        user_organisation_id: str
    ) -> Dict:
        """
        Enforce organisation_id filter on query.
        ALWAYS adds organisation_id to prevent cross-org access.
        """
        query["organisation_id"] = user_organisation_id
        return query
    
    async def verify_resource_access(
        self,
        collection_name: str,
        resource_id: str,
        user_organisation_id: str
    ) -> bool:
        """
        Verify user can access specific resource.
        Raises OrganisationAccessError if not allowed.
        """
        collection = self.db[collection_name]
        
        try:
            resource = await collection.find_one({"_id": ObjectId(resource_id)})
        except:
            resource = await collection.find_one({"_id": resource_id})
        
        if not resource:
            return False
        
        resource_org = resource.get("organisation_id")
        
        if resource_org and resource_org != user_organisation_id:
            logger.warning(f"[SECURITY] Org access violation: user={user_organisation_id}, resource={resource_org}")
            raise OrganisationAccessError(user_organisation_id, resource_org)
        
        return True
    
    # =========================================================================
    # SIGNED URLS
    # =========================================================================
    
    def generate_signed_url(
        self,
        resource_path: str,
        organisation_id: str,
        expiration_hours: Optional[int] = None
    ) -> str:
        """
        Generate signed URL for media access.
        
        URL format: /media/{resource_path}?sig={signature}&exp={expiration}&org={org_id}
        """
        expiration = expiration_hours or self.DEFAULT_URL_EXPIRATION
        expires_at = datetime.utcnow() + timedelta(hours=expiration)
        expires_ts = int(expires_at.timestamp())
        
        # Create signature
        message = f"{resource_path}:{organisation_id}:{expires_ts}"
        signature = hmac.new(
            self.SIGNING_KEY.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        # Encode for URL
        encoded_path = base64.urlsafe_b64encode(resource_path.encode()).decode()
        
        signed_url = f"/api/v2/media/{encoded_path}?sig={signature}&exp={expires_ts}&org={organisation_id}"
        
        logger.debug(f"[SECURITY] Signed URL generated for {resource_path[:50]}...")
        
        return signed_url
    
    def verify_signed_url(
        self,
        encoded_path: str,
        signature: str,
        expiration: int,
        organisation_id: str,
        user_organisation_id: str
    ) -> str:
        """
        Verify signed URL and return decoded resource path.
        
        Raises:
        - SignedURLExpiredError if expired
        - SignedURLInvalidError if signature doesn't match
        - OrganisationAccessError if org mismatch
        """
        # Check organisation
        if organisation_id != user_organisation_id:
            raise OrganisationAccessError(user_organisation_id, organisation_id)
        
        # Check expiration
        if datetime.utcnow().timestamp() > expiration:
            raise SignedURLExpiredError("Signed URL has expired")
        
        # Decode path
        try:
            resource_path = base64.urlsafe_b64decode(encoded_path.encode()).decode()
        except:
            raise SignedURLInvalidError("Invalid resource path encoding")
        
        # Verify signature
        message = f"{resource_path}:{organisation_id}:{expiration}"
        expected_signature = hmac.new(
            self.SIGNING_KEY.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_signature):
            logger.warning(f"[SECURITY] Invalid signed URL signature")
            raise SignedURLInvalidError("Invalid signature")
        
        return resource_path
    
    # =========================================================================
    # MUTATION AUDITING
    # =========================================================================
    
    async def audit_mutation(
        self,
        organisation_id: str,
        user_id: str,
        endpoint: str,
        method: str,
        entity_type: str,
        entity_id: Optional[str],
        request_data: Optional[Dict] = None,
        response_status: int = 200,
        ip_address: Optional[str] = None
    ):
        """
        Log all mutation requests for audit trail.
        """
        audit_doc = {
            "organisation_id": organisation_id,
            "user_id": user_id,
            "endpoint": endpoint,
            "method": method,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "request_summary": self._sanitize_request(request_data) if request_data else None,
            "response_status": response_status,
            "ip_address": ip_address,
            "timestamp": datetime.utcnow()
        }
        
        await self.db.mutation_audit_log.insert_one(audit_doc)
        
        logger.debug(f"[AUDIT] {method} {endpoint} by {user_id}")
    
    def _sanitize_request(self, data: Dict) -> Dict:
        """Remove sensitive fields from request data for logging"""
        sensitive_fields = ["password", "token", "secret", "api_key"]
        sanitized = {}
        
        for key, value in data.items():
            if any(s in key.lower() for s in sensitive_fields):
                sanitized[key] = "[REDACTED]"
            elif isinstance(value, dict):
                sanitized[key] = self._sanitize_request(value)
            else:
                sanitized[key] = value
        
        return sanitized
    
    # =========================================================================
    # CONFIGURABLE SETTINGS
    # =========================================================================
    
    async def get_organisation_settings(
        self,
        organisation_id: str
    ) -> Dict:
        """Get organisation-specific settings including retention periods"""
        settings = await self.db.organisation_settings.find_one(
            {"organisation_id": organisation_id}
        )
        
        if not settings:
            # Return defaults
            return {
                "organisation_id": organisation_id,
                "media_retention_days": 365,
                "audio_retention_days": 90,
                "pdf_retention_days": 180,
                "signed_url_expiration_hours": 24,
                "max_file_size_mb": 50,
                "allowed_file_types": ["jpg", "jpeg", "png", "pdf", "mp3", "wav", "m4a"]
            }
        
        settings["settings_id"] = str(settings.pop("_id"))
        return settings
    
    async def update_organisation_settings(
        self,
        organisation_id: str,
        user_id: str,
        settings: Dict
    ):
        """Update organisation settings"""
        # Get old settings for audit
        old_settings = await self.get_organisation_settings(organisation_id)
        
        # Validate settings
        allowed_keys = [
            "media_retention_days", "audio_retention_days", "pdf_retention_days",
            "signed_url_expiration_hours", "max_file_size_mb", "allowed_file_types"
        ]
        
        update_data = {k: v for k, v in settings.items() if k in allowed_keys}
        update_data["updated_by"] = user_id
        update_data["updated_at"] = datetime.utcnow()
        
        await self.db.organisation_settings.update_one(
            {"organisation_id": organisation_id},
            {
                "$set": update_data,
                "$setOnInsert": {"organisation_id": organisation_id, "created_at": datetime.utcnow()}
            },
            upsert=True
        )
        
        # Audit log
        await self.db.audit_logs.insert_one({
            "organisation_id": organisation_id,
            "module_name": "SETTINGS",
            "entity_type": "ORGANISATION_SETTINGS",
            "entity_id": organisation_id,
            "action_type": "UPDATE",
            "old_value_json": old_settings,
            "new_value_json": update_data,
            "user_id": user_id,
            "timestamp": datetime.utcnow()
        })
        
        logger.info(f"[SETTINGS] Updated for org {organisation_id}")
    
    # =========================================================================
    # FILE ACCESS VALIDATION
    # =========================================================================
    
    def validate_file_path(self, file_path: str) -> bool:
        """
        Validate file path to prevent directory traversal attacks.
        """
        # Block directory traversal
        if ".." in file_path or file_path.startswith("/"):
            logger.warning(f"[SECURITY] Directory traversal attempt: {file_path}")
            return False
        
        # Block absolute paths
        if ":" in file_path:  # Windows paths
            logger.warning(f"[SECURITY] Absolute path attempt: {file_path}")
            return False
        
        return True
    
    # =========================================================================
    # INDEX CREATION
    # =========================================================================
    
    async def create_indexes(self):
        """Create security-related indexes"""
        try:
            await self.db.mutation_audit_log.create_index(
                [("organisation_id", 1), ("timestamp", -1)],
                name="mutation_audit_lookup"
            )
            await self.db.mutation_audit_log.create_index(
                [("user_id", 1), ("timestamp", -1)],
                name="mutation_audit_user"
            )
            await self.db.organisation_settings.create_index(
                [("organisation_id", 1)],
                unique=True,
                name="org_settings_unique"
            )
            logger.info("Security indexes created")
        except Exception as e:
            logger.warning(f"Security index creation: {e}")
