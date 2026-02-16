"""
PHASE 4A: ACCOUNTING PERIODS MIGRATION

Creates the accounting_periods collection with:
- start_date: Date
- end_date: Date
- locked_flag: Boolean (default False)

Unique constraint: (start_date, end_date)
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

MIGRATION_NAME = "003_accounting_periods"
MIGRATION_VERSION = 3


async def upgrade(db: AsyncIOMotorDatabase) -> dict:
    """
    Create accounting_periods collection with unique index.
    """
    collection_name = "accounting_periods"
    
    # Create collection if not exists
    existing_collections = await db.list_collection_names()
    if collection_name not in existing_collections:
        await db.create_collection(collection_name)
        logger.info(f"[MIGRATION] Created collection: {collection_name}")
    
    # Create unique compound index on (start_date, end_date)
    await db[collection_name].create_index(
        [("start_date", 1), ("end_date", 1)],
        unique=True,
        name="idx_accounting_period_unique"
    )
    logger.info("[MIGRATION] Created unique index: idx_accounting_period_unique")
    
    # Create index on locked_flag for fast queries
    await db[collection_name].create_index(
        [("locked_flag", 1)],
        name="idx_accounting_period_locked"
    )
    logger.info("[MIGRATION] Created index: idx_accounting_period_locked")
    
    # Record migration
    await db.migrations.update_one(
        {"migration_name": MIGRATION_NAME},
        {
            "$set": {
                "migration_name": MIGRATION_NAME,
                "version": MIGRATION_VERSION,
                "applied_at": datetime.utcnow(),
                "status": "applied"
            }
        },
        upsert=True
    )
    
    return {
        "migration": MIGRATION_NAME,
        "version": MIGRATION_VERSION,
        "status": "success",
        "collection": collection_name,
        "indexes": ["idx_accounting_period_unique", "idx_accounting_period_locked"]
    }


async def downgrade(db: AsyncIOMotorDatabase) -> dict:
    """
    Drop accounting_periods collection and indexes.
    """
    collection_name = "accounting_periods"
    
    # Drop collection
    await db[collection_name].drop()
    logger.info(f"[MIGRATION] Dropped collection: {collection_name}")
    
    # Remove migration record
    await db.migrations.delete_one({"migration_name": MIGRATION_NAME})
    
    return {
        "migration": MIGRATION_NAME,
        "status": "rolled_back"
    }


# Schema reference for documentation
SCHEMA = {
    "collection": "accounting_periods",
    "fields": {
        "start_date": {"type": "date", "required": True},
        "end_date": {"type": "date", "required": True},
        "locked_flag": {"type": "bool", "default": False},
        "created_at": {"type": "datetime", "auto": True},
        "updated_at": {"type": "datetime", "auto": True},
        "created_by": {"type": "string", "optional": True},
        "locked_by": {"type": "string", "optional": True},
        "locked_at": {"type": "datetime", "optional": True}
    },
    "indexes": [
        {"fields": ["start_date", "end_date"], "unique": True},
        {"fields": ["locked_flag"], "unique": False}
    ]
}
