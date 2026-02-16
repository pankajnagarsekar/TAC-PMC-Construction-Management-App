"""
PHASE 2: SNAPSHOT + DOCUMENT INTEGRITY

Implements:
1. Snapshots collection - immutable records of finalized documents
2. Embedded JSON snapshots (no FK references)
3. Global Settings binding at snapshot time
4. SHA-256 checksum for PDF integrity
5. Document locking
6. Version preservation (old snapshots never overwritten)

This module provides snapshot functionality WITHOUT modifying financial logic.
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from bson import ObjectId
from decimal import Decimal
from bson.decimal128 import Decimal128
from typing import Dict, Any, Optional
import hashlib
import json
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# UTILITIES
# =============================================================================

def serialize_for_snapshot(obj: Any) -> Any:
    """
    Recursively serialize object for JSON snapshot storage.
    Converts MongoDB types to JSON-serializable formats.
    """
    if obj is None:
        return None
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, Decimal128):
        return float(obj.to_decimal())
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: serialize_for_snapshot(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [serialize_for_snapshot(item) for item in obj]
    if isinstance(obj, bytes):
        return obj.hex()
    return obj


def compute_checksum(data: bytes) -> str:
    """Compute SHA-256 checksum of data."""
    return hashlib.sha256(data).hexdigest()


def compute_json_checksum(data: Dict[str, Any]) -> str:
    """Compute SHA-256 checksum of JSON data."""
    json_str = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(json_str.encode('utf-8')).hexdigest()


# =============================================================================
# ENTITY TYPES
# =============================================================================

class SnapshotEntityType:
    WORK_ORDER = "WORK_ORDER"
    PAYMENT_CERTIFICATE = "PAYMENT_CERTIFICATE"
    DPR = "DPR"


# =============================================================================
# SNAPSHOT SERVICE
# =============================================================================

class SnapshotService:
    """
    Service for creating and managing immutable document snapshots.
    
    Key principles:
    - Snapshots are immutable (never overwritten)
    - Each new version creates a new snapshot record
    - Global settings are embedded at snapshot time
    - Full document data is embedded (no FK references)
    - PDF checksum ensures integrity
    """
    
    COLLECTION = "snapshots"
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def create_indexes(self):
        """Create required indexes for snapshots collection."""
        # Unique constraint: (entity_type, entity_id, version)
        await self.db[self.COLLECTION].create_index(
            [("entity_type", 1), ("entity_id", 1), ("version", 1)],
            unique=True,
            name="idx_snapshot_entity_version_unique"
        )
        
        # Index for querying by entity
        await self.db[self.COLLECTION].create_index(
            [("entity_type", 1), ("entity_id", 1)],
            name="idx_snapshot_entity"
        )
        
        # Index for querying by generation time
        await self.db[self.COLLECTION].create_index(
            [("generated_at", -1)],
            name="idx_snapshot_generated_at"
        )
        
        # Index for checksum lookups
        await self.db[self.COLLECTION].create_index(
            [("checksum", 1)],
            name="idx_snapshot_checksum"
        )
        
        logger.info("[SNAPSHOT] Created snapshot indexes")
    
    async def get_global_settings(self, organisation_id: str) -> Dict[str, Any]:
        """
        Get current global settings for embedding in snapshot.
        Returns a fully serialized copy (not a reference).
        """
        settings = await self.db.global_settings.find_one({
            "organisation_id": organisation_id
        })
        
        if not settings:
            # Return defaults if no settings exist
            return {
                "currency": "INR",
                "retention_percentage_default": 5.0,
                "cgst_percentage": 9.0,
                "sgst_percentage": 9.0,
                "date_format": "DD/MM/YYYY",
                "financial_year_start_month": 4,
                "captured_at": datetime.utcnow().isoformat()
            }
        
        # Create clean copy without MongoDB internals
        return serialize_for_snapshot({
            "currency": settings.get("currency", "INR"),
            "retention_percentage_default": settings.get("retention_percentage_default", 5.0),
            "cgst_percentage": settings.get("cgst_percentage", 9.0),
            "sgst_percentage": settings.get("sgst_percentage", 9.0),
            "date_format": settings.get("date_format", "DD/MM/YYYY"),
            "financial_year_start_month": settings.get("financial_year_start_month", 4),
            "gst_number": settings.get("gst_number"),
            "pan_number": settings.get("pan_number"),
            "organisation_name": settings.get("organisation_name"),
            "organisation_address": settings.get("organisation_address"),
            "captured_at": datetime.utcnow().isoformat()
        })
    
    async def get_next_version(
        self,
        entity_type: str,
        entity_id: str
    ) -> int:
        """Get the next version number for a snapshot."""
        latest = await self.db[self.COLLECTION].find_one(
            {"entity_type": entity_type, "entity_id": entity_id},
            sort=[("version", -1)]
        )
        
        if latest:
            return latest.get("version", 0) + 1
        return 1
    
    async def create_snapshot(
        self,
        entity_type: str,
        entity_id: str,
        data: Dict[str, Any],
        organisation_id: str,
        pdf_bytes: Optional[bytes] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create an immutable snapshot of a document.
        
        Args:
            entity_type: Type of entity (WORK_ORDER, PAYMENT_CERTIFICATE, DPR)
            entity_id: ID of the entity
            data: Full embedded document data (no FK references)
            organisation_id: Organisation ID for settings lookup
            pdf_bytes: Optional PDF bytes for checksum
            user_id: User who triggered the snapshot
        
        Returns:
            Created snapshot record
        """
        # Get next version (preserves old snapshots)
        version = await self.get_next_version(entity_type, entity_id)
        
        # Get current global settings to embed
        settings = await self.get_global_settings(organisation_id)
        
        # Serialize data for storage
        serialized_data = serialize_for_snapshot(data)
        
        # Compute checksums
        data_checksum = compute_json_checksum(serialized_data)
        pdf_checksum = compute_checksum(pdf_bytes) if pdf_bytes else None
        
        # Build snapshot record
        snapshot = {
            "snapshot_id": str(ObjectId()),
            "entity_type": entity_type,
            "entity_id": entity_id,
            "version": version,
            "data_json": serialized_data,
            "settings_json": settings,
            "data_checksum": data_checksum,
            "pdf_checksum": pdf_checksum,
            "generated_at": datetime.utcnow(),
            "generated_by": user_id,
            "is_latest": True
        }
        
        # Mark previous snapshots as not latest
        await self.db[self.COLLECTION].update_many(
            {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "is_latest": True
            },
            {"$set": {"is_latest": False}}
        )
        
        # Insert new snapshot
        result = await self.db[self.COLLECTION].insert_one(snapshot)
        snapshot["_id"] = result.inserted_id
        
        logger.info(
            f"[SNAPSHOT] Created snapshot: {entity_type}/{entity_id} v{version} "
            f"checksum={data_checksum[:8]}..."
        )
        
        return snapshot
    
    async def get_snapshot(
        self,
        entity_type: str,
        entity_id: str,
        version: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get a snapshot by entity and optional version.
        If version is None, returns the latest snapshot.
        """
        query = {"entity_type": entity_type, "entity_id": entity_id}
        
        if version is not None:
            query["version"] = version
            return await self.db[self.COLLECTION].find_one(query)
        else:
            # Get latest
            return await self.db[self.COLLECTION].find_one(
                query,
                sort=[("version", -1)]
            )
    
    async def get_all_versions(
        self,
        entity_type: str,
        entity_id: str
    ) -> list:
        """Get all snapshot versions for an entity."""
        cursor = self.db[self.COLLECTION].find(
            {"entity_type": entity_type, "entity_id": entity_id}
        ).sort("version", -1)
        
        return await cursor.to_list(length=None)
    
    async def verify_checksum(
        self,
        entity_type: str,
        entity_id: str,
        version: int,
        pdf_bytes: Optional[bytes] = None
    ) -> Dict[str, Any]:
        """
        Verify integrity of a snapshot.
        
        Returns:
            {
                "valid": bool,
                "data_checksum_match": bool,
                "pdf_checksum_match": bool (if pdf provided),
                "snapshot_version": int
            }
        """
        snapshot = await self.get_snapshot(entity_type, entity_id, version)
        
        if not snapshot:
            return {
                "valid": False,
                "error": "Snapshot not found"
            }
        
        # Verify data checksum
        current_data_checksum = compute_json_checksum(snapshot.get("data_json", {}))
        data_match = current_data_checksum == snapshot.get("data_checksum")
        
        result = {
            "valid": data_match,
            "data_checksum_match": data_match,
            "snapshot_version": snapshot.get("version"),
            "generated_at": snapshot.get("generated_at")
        }
        
        # Verify PDF checksum if provided
        if pdf_bytes and snapshot.get("pdf_checksum"):
            pdf_checksum = compute_checksum(pdf_bytes)
            pdf_match = pdf_checksum == snapshot.get("pdf_checksum")
            result["pdf_checksum_match"] = pdf_match
            result["valid"] = result["valid"] and pdf_match
        
        return result


# =============================================================================
# DOCUMENT LOCKING SERVICE
# =============================================================================

class DocumentLockService:
    """
    Service for managing document locking.
    Locked documents cannot be modified.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def lock_document(
        self,
        collection: str,
        document_id: str,
        snapshot_version: int,
        user_id: str
    ) -> bool:
        """
        Lock a document after finalization.
        Sets locked_flag = true and records lock metadata.
        """
        result = await self.db[collection].update_one(
            {"_id": ObjectId(document_id)},
            {
                "$set": {
                    "locked_flag": True,
                    "locked_at": datetime.utcnow(),
                    "locked_by": user_id,
                    "locked_snapshot_version": snapshot_version
                }
            }
        )
        
        if result.modified_count > 0:
            logger.info(f"[LOCK] Document locked: {collection}/{document_id}")
            return True
        
        return False
    
    async def is_locked(self, collection: str, document_id: str) -> bool:
        """Check if a document is locked."""
        doc = await self.db[collection].find_one(
            {"_id": ObjectId(document_id)},
            {"locked_flag": 1}
        )
        return doc.get("locked_flag", False) if doc else False
    
    async def unlock_document(
        self,
        collection: str,
        document_id: str,
        user_id: str,
        reason: str
    ) -> bool:
        """
        Unlock a document (admin only, with audit trail).
        Creates an audit record of the unlock.
        """
        # Record unlock in audit log
        await self.db.audit_logs.insert_one({
            "action": "DOCUMENT_UNLOCK",
            "collection": collection,
            "document_id": document_id,
            "user_id": user_id,
            "reason": reason,
            "timestamp": datetime.utcnow()
        })
        
        result = await self.db[collection].update_one(
            {"_id": ObjectId(document_id)},
            {
                "$set": {
                    "locked_flag": False,
                    "unlocked_at": datetime.utcnow(),
                    "unlocked_by": user_id,
                    "unlock_reason": reason
                }
            }
        )
        
        if result.modified_count > 0:
            logger.warning(f"[LOCK] Document unlocked: {collection}/{document_id} reason={reason}")
            return True
        
        return False


# =============================================================================
# WORK ORDER SNAPSHOT BUILDER
# =============================================================================

async def build_work_order_snapshot(
    db: AsyncIOMotorDatabase,
    wo_id: str
) -> Dict[str, Any]:
    """
    Build complete embedded Work Order snapshot.
    Resolves all FK references to embedded data.
    """
    wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    if not wo:
        raise ValueError(f"Work Order not found: {wo_id}")
    
    # Get related entities
    project = await db.projects.find_one({"_id": ObjectId(wo.get("project_id"))})
    vendor = await db.vendors.find_one({"_id": ObjectId(wo.get("vendor_id"))}) if wo.get("vendor_id") else None
    code = await db.code_master.find_one({"code_id": wo.get("code_id")})
    
    # Build embedded snapshot
    snapshot_data = {
        "wo_id": str(wo["_id"]),
        "document_number": wo.get("document_number"),
        "wo_number": wo.get("wo_number"),
        "status": wo.get("status"),
        "description": wo.get("description"),
        
        # Financial values (embedded, not references)
        "rate": wo.get("rate"),
        "quantity": wo.get("quantity"),
        "unit": wo.get("unit"),
        "base_amount": wo.get("base_amount"),
        "retention_percentage": wo.get("retention_percentage"),
        "retention_amount": wo.get("retention_amount"),
        "net_payable": wo.get("net_payable"),
        
        # Embedded project data
        "project": {
            "project_id": str(project["_id"]) if project else None,
            "project_name": project.get("project_name") if project else None,
            "project_code": project.get("project_code") if project else None,
            "location": project.get("location") if project else None
        } if project else None,
        
        # Embedded vendor data
        "vendor": {
            "vendor_id": str(vendor["_id"]) if vendor else None,
            "vendor_name": vendor.get("vendor_name") if vendor else None,
            "vendor_code": vendor.get("vendor_code") if vendor else None,
            "gst_number": vendor.get("gst_number") if vendor else None,
            "pan_number": vendor.get("pan_number") if vendor else None,
            "address": vendor.get("address") if vendor else None
        } if vendor else None,
        
        # Embedded code data
        "activity_code": {
            "code_id": code.get("code_id") if code else None,
            "code_name": code.get("code_name") if code else None,
            "description": code.get("description") if code else None
        } if code else None,
        
        # Timestamps
        "created_at": wo.get("created_at"),
        "issued_at": wo.get("issued_at"),
        "updated_at": wo.get("updated_at")
    }
    
    return snapshot_data


# =============================================================================
# PAYMENT CERTIFICATE SNAPSHOT BUILDER
# =============================================================================

async def build_payment_certificate_snapshot(
    db: AsyncIOMotorDatabase,
    pc_id: str
) -> Dict[str, Any]:
    """
    Build complete embedded Payment Certificate snapshot.
    Resolves all FK references to embedded data.
    """
    pc = await db.payment_certificates.find_one({"_id": ObjectId(pc_id)})
    if not pc:
        raise ValueError(f"Payment Certificate not found: {pc_id}")
    
    # Get related entities
    wo = await db.work_orders.find_one({"_id": ObjectId(pc.get("wo_id"))}) if pc.get("wo_id") else None
    project = await db.projects.find_one({"_id": ObjectId(pc.get("project_id"))})
    vendor = await db.vendors.find_one({"_id": ObjectId(pc.get("vendor_id"))}) if pc.get("vendor_id") else None
    code = await db.code_master.find_one({"code_id": pc.get("code_id")})
    
    # Build embedded snapshot
    snapshot_data = {
        "pc_id": str(pc["_id"]),
        "document_number": pc.get("document_number"),
        "pc_number": pc.get("pc_number"),
        "status": pc.get("status"),
        "bill_period_start": pc.get("bill_period_start"),
        "bill_period_end": pc.get("bill_period_end"),
        
        # Financial values (embedded)
        "current_bill_amount": pc.get("current_bill_amount"),
        "cumulative_previous_certified": pc.get("cumulative_previous_certified"),
        "cumulative_certified": pc.get("cumulative_certified"),
        "retention_percentage": pc.get("retention_percentage"),
        "retention_current": pc.get("retention_current"),
        "retention_cumulative": pc.get("retention_cumulative"),
        "cgst_percentage": pc.get("cgst_percentage"),
        "sgst_percentage": pc.get("sgst_percentage"),
        "cgst_amount": pc.get("cgst_amount"),
        "sgst_amount": pc.get("sgst_amount"),
        "tds_percentage": pc.get("tds_percentage"),
        "tds_amount": pc.get("tds_amount"),
        "net_payable": pc.get("net_payable"),
        "paid_amount": pc.get("paid_amount"),
        "balance_payable": pc.get("balance_payable"),
        
        # Embedded Work Order data
        "work_order": {
            "wo_id": str(wo["_id"]) if wo else None,
            "document_number": wo.get("document_number") if wo else None,
            "description": wo.get("description") if wo else None,
            "rate": wo.get("rate") if wo else None,
            "quantity": wo.get("quantity") if wo else None,
            "base_amount": wo.get("base_amount") if wo else None
        } if wo else None,
        
        # Embedded project data
        "project": {
            "project_id": str(project["_id"]) if project else None,
            "project_name": project.get("project_name") if project else None,
            "project_code": project.get("project_code") if project else None
        } if project else None,
        
        # Embedded vendor data
        "vendor": {
            "vendor_id": str(vendor["_id"]) if vendor else None,
            "vendor_name": vendor.get("vendor_name") if vendor else None,
            "vendor_code": vendor.get("vendor_code") if vendor else None,
            "gst_number": vendor.get("gst_number") if vendor else None
        } if vendor else None,
        
        # Embedded code data
        "activity_code": {
            "code_id": code.get("code_id") if code else None,
            "code_name": code.get("code_name") if code else None
        } if code else None,
        
        # Timestamps
        "created_at": pc.get("created_at"),
        "certified_at": pc.get("certified_at"),
        "updated_at": pc.get("updated_at")
    }
    
    return snapshot_data


# =============================================================================
# DPR SNAPSHOT BUILDER
# =============================================================================

async def build_dpr_snapshot(
    db: AsyncIOMotorDatabase,
    dpr_id: str
) -> Dict[str, Any]:
    """
    Build complete embedded DPR snapshot.
    Resolves all FK references to embedded data.
    """
    dpr = await db.dpr.find_one({"_id": ObjectId(dpr_id)})
    if not dpr:
        raise ValueError(f"DPR not found: {dpr_id}")
    
    # Get related entities
    project = await db.projects.find_one({"_id": ObjectId(dpr.get("project_id"))})
    
    # Build embedded snapshot
    snapshot_data = {
        "dpr_id": str(dpr["_id"]),
        "dpr_date": dpr.get("dpr_date"),
        "status": dpr.get("status"),
        
        # DPR details
        "weather_conditions": dpr.get("weather_conditions"),
        "manpower_count": dpr.get("manpower_count"),
        "progress_notes": dpr.get("progress_notes"),
        "issues_encountered": dpr.get("issues_encountered"),
        
        # Embedded images (full data, not references)
        "images": [
            {
                "image_id": img.get("image_id"),
                "caption": img.get("caption"),
                "uploaded_at": img.get("uploaded_at"),
                # Note: image_url is preserved for reference
                "image_url": img.get("image_url")
            }
            for img in dpr.get("images", [])
        ],
        
        # Embedded project data
        "project": {
            "project_id": str(project["_id"]) if project else None,
            "project_name": project.get("project_name") if project else None,
            "project_code": project.get("project_code") if project else None,
            "location": project.get("location") if project else None
        } if project else None,
        
        # Timestamps
        "created_at": dpr.get("created_at"),
        "submitted_at": dpr.get("submitted_at"),
        "updated_at": dpr.get("updated_at")
    }
    
    return snapshot_data


# =============================================================================
# MIGRATION SCRIPT
# =============================================================================

async def run_migration(db: AsyncIOMotorDatabase):
    """
    Migration script to create snapshots collection.
    Safe to run multiple times (idempotent).
    """
    logger.info("[MIGRATION] Starting Phase 2 - Snapshot migration...")
    
    # Create collection if not exists
    existing = await db.list_collection_names()
    
    if "snapshots" not in existing:
        await db.create_collection("snapshots")
        logger.info("[MIGRATION] Created snapshots collection")
    
    # Create indexes
    await db.snapshots.create_index(
        [("entity_type", 1), ("entity_id", 1), ("version", 1)],
        unique=True,
        name="idx_snapshot_entity_version_unique"
    )
    
    await db.snapshots.create_index(
        [("entity_type", 1), ("entity_id", 1)],
        name="idx_snapshot_entity"
    )
    
    await db.snapshots.create_index(
        [("generated_at", -1)],
        name="idx_snapshot_generated_at"
    )
    
    await db.snapshots.create_index(
        [("checksum", 1)],
        name="idx_snapshot_checksum"
    )
    
    await db.snapshots.create_index(
        [("is_latest", 1)],
        name="idx_snapshot_is_latest"
    )
    
    # Add locked_flag index to work_orders
    await db.work_orders.create_index(
        [("locked_flag", 1)],
        name="idx_wo_locked_flag"
    )
    
    # Add locked_flag index to payment_certificates
    await db.payment_certificates.create_index(
        [("locked_flag", 1)],
        name="idx_pc_locked_flag"
    )
    
    # Add locked_flag index to dpr
    await db.dpr.create_index(
        [("locked_flag", 1)],
        name="idx_dpr_locked_flag"
    )
    
    logger.info("[MIGRATION] Phase 2 - Snapshot migration complete")
    
    return {
        "status": "success",
        "collection": "snapshots",
        "indexes_created": 8
    }
