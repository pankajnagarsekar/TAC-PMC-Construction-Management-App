#!/usr/bin/env python3
"""
MIGRATION SCRIPT: Phase 2 - Snapshot + Document Integrity

Creates:
1. snapshots collection with indexes
2. locked_flag indexes on work_orders, payment_certificates, dpr

Run: python migrations/002_snapshot_integrity.py
"""

import asyncio
import os
import sys
from datetime import datetime

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()


async def run_migration():
    """Execute the snapshot + document integrity migration."""
    
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/?replicaSet=rs0')
    db_name = os.environ.get('DB_NAME', 'construction_management')
    
    print(f"Connecting to: {mongo_url}")
    print(f"Database: {db_name}")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Test connection
        await client.admin.command('ping')
        print("✓ Connected to MongoDB")
        
        existing = await db.list_collection_names()
        print(f"Existing collections: {existing}")
        
        # =====================================================
        # 1. Create snapshots collection
        # =====================================================
        if "snapshots" not in existing:
            await db.create_collection("snapshots")
            print("✓ Created snapshots collection")
        else:
            print("• snapshots collection already exists")
        
        # Unique index on (entity_type, entity_id, version)
        await db.snapshots.create_index(
            [("entity_type", 1), ("entity_id", 1), ("version", 1)],
            unique=True,
            name="idx_snapshot_entity_version_unique"
        )
        print("✓ Created unique index: idx_snapshot_entity_version_unique")
        
        # Index for entity queries
        await db.snapshots.create_index(
            [("entity_type", 1), ("entity_id", 1)],
            name="idx_snapshot_entity"
        )
        print("✓ Created index: idx_snapshot_entity")
        
        # Index for time-based queries
        await db.snapshots.create_index(
            [("generated_at", -1)],
            name="idx_snapshot_generated_at"
        )
        print("✓ Created index: idx_snapshot_generated_at")
        
        # Index for checksum lookups
        await db.snapshots.create_index(
            [("data_checksum", 1)],
            name="idx_snapshot_data_checksum"
        )
        print("✓ Created index: idx_snapshot_data_checksum")
        
        await db.snapshots.create_index(
            [("pdf_checksum", 1)],
            name="idx_snapshot_pdf_checksum"
        )
        print("✓ Created index: idx_snapshot_pdf_checksum")
        
        # Index for latest snapshot queries
        await db.snapshots.create_index(
            [("is_latest", 1)],
            name="idx_snapshot_is_latest"
        )
        print("✓ Created index: idx_snapshot_is_latest")
        
        # =====================================================
        # 2. Add locked_flag indexes to document collections
        # =====================================================
        
        # Work Orders
        await db.work_orders.create_index(
            [("locked_flag", 1)],
            name="idx_wo_locked_flag"
        )
        print("✓ Created index: idx_wo_locked_flag")
        
        # Payment Certificates
        await db.payment_certificates.create_index(
            [("locked_flag", 1)],
            name="idx_pc_locked_flag"
        )
        print("✓ Created index: idx_pc_locked_flag")
        
        # DPR
        await db.dpr.create_index(
            [("locked_flag", 1)],
            name="idx_dpr_locked_flag"
        )
        print("✓ Created index: idx_dpr_locked_flag")
        
        # =====================================================
        # Verify indexes
        # =====================================================
        snapshot_indexes = await db.snapshots.index_information()
        
        print("\n=== Snapshots Indexes ===")
        for name, info in snapshot_indexes.items():
            print(f"  {name}: {info['key']}")
        
        # =====================================================
        # Migration metadata
        # =====================================================
        migration_record = {
            "migration_id": "002_snapshot_integrity",
            "description": "Phase 2 - Snapshot + Document Integrity",
            "tables_created": ["snapshots"],
            "indexes_created": [
                "idx_snapshot_entity_version_unique",
                "idx_snapshot_entity",
                "idx_snapshot_generated_at",
                "idx_snapshot_data_checksum",
                "idx_snapshot_pdf_checksum",
                "idx_snapshot_is_latest",
                "idx_wo_locked_flag",
                "idx_pc_locked_flag",
                "idx_dpr_locked_flag"
            ],
            "executed_at": datetime.utcnow(),
            "status": "success"
        }
        
        await db.migrations.update_one(
            {"migration_id": "002_snapshot_integrity"},
            {"$set": migration_record},
            upsert=True
        )
        print("\n✓ Migration record saved")
        
        print("\n" + "="*50)
        print("MIGRATION COMPLETE: Snapshot + Document Integrity")
        print("="*50)
        
        return {
            "status": "success",
            "collection": "snapshots",
            "indexes": 9
        }
        
    except Exception as e:
        print(f"\n✗ Migration failed: {str(e)}")
        raise
    finally:
        client.close()


if __name__ == "__main__":
    result = asyncio.run(run_migration())
    print(f"\nResult: {result}")
