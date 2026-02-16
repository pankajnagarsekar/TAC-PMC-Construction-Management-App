#!/usr/bin/env python3
"""
MIGRATION SCRIPT: Financial Determinism Foundation (Phase 1)

Creates:
1. financial_aggregates collection with unique index
2. mutation_operation_logs collection with unique index

Run: python migrations/001_financial_determinism.py
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
    """Execute the financial determinism migration."""
    
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
        
        # Get existing collections
        existing = await db.list_collection_names()
        print(f"Existing collections: {existing}")
        
        # =====================================================
        # 1. Create financial_aggregates collection
        # =====================================================
        if "financial_aggregates" not in existing:
            await db.create_collection("financial_aggregates")
            print("✓ Created financial_aggregates collection")
        else:
            print("• financial_aggregates collection already exists")
        
        # Create unique index on (project_id, code_id)
        await db.financial_aggregates.create_index(
            [("project_id", 1), ("code_id", 1)],
            unique=True,
            name="idx_aggregate_project_code_unique"
        )
        print("✓ Created unique index: idx_aggregate_project_code_unique")
        
        # Create index for reconciliation queries
        await db.financial_aggregates.create_index(
            [("last_reconciled_at", -1)],
            name="idx_aggregate_reconciled_at"
        )
        print("✓ Created index: idx_aggregate_reconciled_at")
        
        # Create index for version tracking
        await db.financial_aggregates.create_index(
            [("version", -1)],
            name="idx_aggregate_version"
        )
        print("✓ Created index: idx_aggregate_version")
        
        # =====================================================
        # 2. Create mutation_operation_logs collection
        # =====================================================
        if "mutation_operation_logs" not in existing:
            await db.create_collection("mutation_operation_logs")
            print("✓ Created mutation_operation_logs collection")
        else:
            print("• mutation_operation_logs collection already exists")
        
        # Create unique index on operation_id
        await db.mutation_operation_logs.create_index(
            [("operation_id", 1)],
            unique=True,
            name="idx_mutation_operation_id_unique"
        )
        print("✓ Created unique index: idx_mutation_operation_id_unique")
        
        # Create index for entity lookups
        await db.mutation_operation_logs.create_index(
            [("entity_type", 1), ("entity_id", 1)],
            name="idx_mutation_entity"
        )
        print("✓ Created index: idx_mutation_entity")
        
        # Create index for time-based queries
        await db.mutation_operation_logs.create_index(
            [("created_at", -1)],
            name="idx_mutation_created_at"
        )
        print("✓ Created index: idx_mutation_created_at")
        
        # Create index for operation type queries
        await db.mutation_operation_logs.create_index(
            [("operation_type", 1), ("applied_flag", 1)],
            name="idx_mutation_type_applied"
        )
        print("✓ Created index: idx_mutation_type_applied")
        
        # =====================================================
        # Verify indexes
        # =====================================================
        fa_indexes = await db.financial_aggregates.index_information()
        mol_indexes = await db.mutation_operation_logs.index_information()
        
        print("\n=== Financial Aggregates Indexes ===")
        for name, info in fa_indexes.items():
            print(f"  {name}: {info['key']}")
        
        print("\n=== Mutation Operation Logs Indexes ===")
        for name, info in mol_indexes.items():
            print(f"  {name}: {info['key']}")
        
        # =====================================================
        # Migration metadata
        # =====================================================
        migration_record = {
            "migration_id": "001_financial_determinism",
            "description": "Financial Determinism Foundation - Phase 1",
            "tables_created": [
                "financial_aggregates",
                "mutation_operation_logs"
            ],
            "indexes_created": [
                "idx_aggregate_project_code_unique",
                "idx_aggregate_reconciled_at",
                "idx_aggregate_version",
                "idx_mutation_operation_id_unique",
                "idx_mutation_entity",
                "idx_mutation_created_at",
                "idx_mutation_type_applied"
            ],
            "executed_at": datetime.utcnow(),
            "status": "success"
        }
        
        await db.migrations.update_one(
            {"migration_id": "001_financial_determinism"},
            {"$set": migration_record},
            upsert=True
        )
        print("\n✓ Migration record saved")
        
        print("\n" + "="*50)
        print("MIGRATION COMPLETE: Financial Determinism Foundation")
        print("="*50)
        
        return {
            "status": "success",
            "collections": ["financial_aggregates", "mutation_operation_logs"],
            "indexes": 7
        }
        
    except Exception as e:
        print(f"\n✗ Migration failed: {str(e)}")
        raise
    finally:
        client.close()


if __name__ == "__main__":
    result = asyncio.run(run_migration())
    print(f"\nResult: {result}")
