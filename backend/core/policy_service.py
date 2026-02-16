"""
PHASE 4C: POLICY SERVICE

Provides centralized policy enforcement by reading from Global Settings.
All policy checks go through this service for consistent behavior.

Methods:
- is_strict_budget_enabled(): Check if budget overspend protection is active
- is_dpr_enforced(): Check if DPR is required before payment certification
- is_regeneration_allowed(): Check if document regeneration is permitted

Usage:
    policy = PolicyService(db)
    if await policy.is_strict_budget_enabled():
        # enforce budget limits
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, Dict, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# DEFAULT POLICY VALUES
# =============================================================================

DEFAULT_POLICIES = {
    "strict_budget_enabled": True,      # Prevent certified > budget
    "dpr_enforced": False,              # Require DPR before PC certification
    "regeneration_allowed": True,       # Allow document regeneration
    "retention_release_enabled": True,  # Allow retention releases
    "duplicate_invoice_check": True,    # Check for duplicate invoices
    "auto_lock_on_certify": True,       # Auto-lock documents on certification
}


# =============================================================================
# POLICY SERVICE
# =============================================================================

class PolicyService:
    """
    Centralized policy service that reads from global_settings collection.
    
    Provides cached access to policy flags with fallback to defaults.
    Cache is refreshed on each call to ensure consistency.
    """
    
    COLLECTION = "global_settings"
    SETTINGS_KEY = "policies"
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self._cache: Optional[Dict[str, Any]] = None
        self._cache_timestamp: Optional[datetime] = None
        self._cache_ttl_seconds = 60  # Refresh cache every 60 seconds
    
    # =========================================================================
    # INTERNAL: SETTINGS RETRIEVAL
    # =========================================================================
    
    async def _get_settings(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Retrieve policy settings from global_settings collection.
        Uses caching with TTL to reduce database calls.
        
        Returns merged settings (DB values override defaults).
        """
        now = datetime.utcnow()
        
        # Check if cache is valid
        if (
            not force_refresh 
            and self._cache is not None 
            and self._cache_timestamp is not None
            and (now - self._cache_timestamp).total_seconds() < self._cache_ttl_seconds
        ):
            return self._cache
        
        # Fetch from database
        try:
            doc = await self.db[self.COLLECTION].find_one({"key": self.SETTINGS_KEY})
            
            if doc and "settings" in doc:
                # Merge with defaults (DB values take precedence)
                settings = {**DEFAULT_POLICIES, **doc["settings"]}
                logger.debug(f"[POLICY] Loaded settings from DB: {settings}")
            else:
                # Use defaults if no settings found
                settings = DEFAULT_POLICIES.copy()
                logger.debug("[POLICY] Using default settings (none in DB)")
            
            # Update cache
            self._cache = settings
            self._cache_timestamp = now
            
            return settings
            
        except Exception as e:
            logger.error(f"[POLICY] Error loading settings: {e}")
            # Return defaults on error
            return DEFAULT_POLICIES.copy()
    
    async def _get_policy(self, key: str, default: Any = None) -> Any:
        """Get a specific policy value by key."""
        settings = await self._get_settings()
        return settings.get(key, default)
    
    # =========================================================================
    # PUBLIC: POLICY CHECK METHODS
    # =========================================================================
    
    async def is_strict_budget_enabled(self) -> bool:
        """
        Check if strict budget enforcement is enabled.
        
        When enabled:
        - Certified value cannot exceed approved budget
        - Work orders cannot exceed remaining budget
        - Budget changes require approval workflow
        
        Returns:
            bool: True if strict budget enforcement is active
        """
        result = await self._get_policy("strict_budget_enabled", True)
        logger.debug(f"[POLICY] is_strict_budget_enabled: {result}")
        return bool(result)
    
    async def is_dpr_enforced(self) -> bool:
        """
        Check if DPR (Daily Progress Report) is enforced.
        
        When enabled:
        - Payment certificates require associated DPR
        - Cannot certify PC without submitted DPR for the period
        - DPR must be approved before PC certification
        
        Returns:
            bool: True if DPR is required for certification
        """
        result = await self._get_policy("dpr_enforced", False)
        logger.debug(f"[POLICY] is_dpr_enforced: {result}")
        return bool(result)
    
    async def is_regeneration_allowed(self) -> bool:
        """
        Check if document regeneration is allowed.
        
        When enabled:
        - PDF documents can be regenerated
        - Snapshots can be recreated (with new version)
        - Allows fixing formatting issues without new revision
        
        When disabled:
        - Documents are immutable once generated
        - Requires formal revision to make any changes
        
        Returns:
            bool: True if regeneration is permitted
        """
        result = await self._get_policy("regeneration_allowed", True)
        logger.debug(f"[POLICY] is_regeneration_allowed: {result}")
        return bool(result)
    
    # =========================================================================
    # ADDITIONAL POLICY METHODS (for future use)
    # =========================================================================
    
    async def is_retention_release_enabled(self) -> bool:
        """Check if retention releases are enabled."""
        result = await self._get_policy("retention_release_enabled", True)
        return bool(result)
    
    async def is_duplicate_invoice_check_enabled(self) -> bool:
        """Check if duplicate invoice checking is enabled."""
        result = await self._get_policy("duplicate_invoice_check", True)
        return bool(result)
    
    async def is_auto_lock_on_certify_enabled(self) -> bool:
        """Check if documents auto-lock on certification."""
        result = await self._get_policy("auto_lock_on_certify", True)
        return bool(result)
    
    # =========================================================================
    # ADMIN: SETTINGS MANAGEMENT
    # =========================================================================
    
    async def get_all_policies(self) -> Dict[str, Any]:
        """
        Get all policy settings (for admin UI).
        
        Returns:
            Dict with all policy flags and their current values
        """
        settings = await self._get_settings(force_refresh=True)
        return {
            "policies": settings,
            "defaults": DEFAULT_POLICIES,
            "cache_ttl_seconds": self._cache_ttl_seconds
        }
    
    async def update_policy(self, key: str, value: bool) -> Dict[str, Any]:
        """
        Update a specific policy setting.
        
        Args:
            key: Policy key to update
            value: New boolean value
            
        Returns:
            Updated settings dict
        """
        if key not in DEFAULT_POLICIES:
            raise ValueError(f"Unknown policy key: {key}")
        
        # Upsert the settings document
        await self.db[self.COLLECTION].update_one(
            {"key": self.SETTINGS_KEY},
            {
                "$set": {
                    f"settings.{key}": value,
                    "updated_at": datetime.utcnow()
                },
                "$setOnInsert": {
                    "key": self.SETTINGS_KEY,
                    "created_at": datetime.utcnow()
                }
            },
            upsert=True
        )
        
        # Invalidate cache
        self._cache = None
        self._cache_timestamp = None
        
        logger.info(f"[POLICY] Updated {key} = {value}")
        
        # Return fresh settings
        return await self.get_all_policies()
    
    async def reset_to_defaults(self) -> Dict[str, Any]:
        """
        Reset all policies to default values.
        
        Returns:
            Default settings dict
        """
        await self.db[self.COLLECTION].update_one(
            {"key": self.SETTINGS_KEY},
            {
                "$set": {
                    "settings": DEFAULT_POLICIES.copy(),
                    "updated_at": datetime.utcnow(),
                    "reset_at": datetime.utcnow()
                },
                "$setOnInsert": {
                    "key": self.SETTINGS_KEY,
                    "created_at": datetime.utcnow()
                }
            },
            upsert=True
        )
        
        # Invalidate cache
        self._cache = None
        self._cache_timestamp = None
        
        logger.info("[POLICY] Reset all policies to defaults")
        
        return await self.get_all_policies()


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def create_policy_service(db: AsyncIOMotorDatabase) -> PolicyService:
    """
    Factory function to create PolicyService instance.
    
    Usage:
        from core.policy_service import create_policy_service
        policy = create_policy_service(db)
    """
    return PolicyService(db)
