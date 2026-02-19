"""
Seed script for Phase 1 Construction Management System.

Creates:
- 1 Organisation
- 1 Admin user (credentials: admin@example.com / admin123)
- 1 Supervisor user (credentials: supervisor@example.com / supervisor123)
- 1 Sample Project assigned to Supervisor
- 3 Sample Vendors
- Default Global Settings (currency: INR)
- 5 Code Master entries: CIV, ELC, PLB, FIN, SWP
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import os
from pathlib import Path
from dotenv import load_dotenv
import sys

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent))

from auth import hash_password

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
db_name = os.environ['DB_NAME']

async def seed_database():
    """Seed the database with initial data"""
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("🌱 Starting database seeding...")
    
    try:
        # ============================================
        # 1. CREATE ORGANISATION
        # ============================================
        print("📊 Creating organisation...")
        
        # Check if organisation already exists
        existing_org = await db.organisations.find_one({})
        
        if existing_org:
            print("   ⚠️  Organisation already exists. Skipping...")
            organisation_id = str(existing_org["_id"])
        else:
            org_data = {
                "organisation_name": "Default Organisation",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            result = await db.organisations.insert_one(org_data)
            organisation_id = str(result.inserted_id)
            print(f"   ✅ Organisation created: {organisation_id}")
        
        # ============================================
        # 2. CREATE GLOBAL SETTINGS
        # ============================================
        print("⚙️  Creating global settings...")
        
        existing_settings = await db.global_settings.find_one({"organisation_id": organisation_id})
        
        if existing_settings:
            print("   ⚠️  Global settings already exist. Skipping...")
        else:
            settings_data = {
                "organisation_id": organisation_id,
                "default_currency": "INR",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            await db.global_settings.insert_one(settings_data)
            print("   ✅ Global settings created (Currency: INR)")
        
        # ============================================
        # 3. CREATE ADMIN USER
        # ============================================
        print("👤 Creating admin user...")
        
        admin_email = "admin@example.com"
        admin_password = "admin123"
        
        existing_admin = await db.users.find_one({"email": admin_email})
        
        if existing_admin:
            print("   ⚠️  Admin user already exists. Skipping...")
            admin_id = str(existing_admin["_id"])
        else:
            hashed_pw = hash_password(admin_password)
            
            admin_data = {
                "organisation_id": organisation_id,
                "name": "System Administrator",
                "email": admin_email,
                "hashed_password": hashed_pw,
                "role": "Admin",
                "active_status": True,
                "dpr_generation_permission": True,
                "assigned_projects": [],
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            result = await db.users.insert_one(admin_data)
            admin_id = str(result.inserted_id)
            print(f"   ✅ Admin user created")
            print(f"      📧 Email: {admin_email}")
            print(f"      🔑 Password: {admin_password}")
            print(f"      ⚠️  CHANGE PASSWORD AFTER FIRST LOGIN!")
        
        # ============================================
        # 3b. CREATE SAMPLE PROJECT
        # ============================================
        print("🏗️  Creating sample project...")
        
        existing_project = await db.projects.find_one({"project_code": "PROJ001"})
        
        if existing_project:
            print("   ⚠️  Sample project already exists. Skipping...")
            project_id = str(existing_project["_id"])
        else:
            project_data = {
                "organisation_id": organisation_id,
                "project_code": "PROJ001",
                "project_name": "Sample Construction Project",
                "location": "Test Location, City",
                "start_date": datetime.utcnow(),
                "status": "Active",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            result = await db.projects.insert_one(project_data)
            project_id = str(result.inserted_id)
            print(f"   ✅ Sample project created: PROJ001 - Sample Construction Project")

        # ============================================
        # 3c. CREATE SUPERVISOR USER
        # ============================================
        print("👷 Creating supervisor user...")
        
        supervisor_email = "supervisor@example.com"
        supervisor_password = "supervisor123"
        
        existing_supervisor = await db.users.find_one({"email": supervisor_email})
        
        if existing_supervisor:
            print("   ⚠️  Supervisor user already exists. Skipping...")
        else:
            hashed_pw = hash_password(supervisor_password)
            
            supervisor_data = {
                "organisation_id": organisation_id,
                "name": "Test Supervisor",
                "email": supervisor_email,
                "hashed_password": hashed_pw,
                "role": "Supervisor",
                "active_status": True,
                "dpr_generation_permission": True,
                "assigned_projects": [project_id],
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            result = await db.users.insert_one(supervisor_data)
            supervisor_id = str(result.inserted_id)
            print(f"   ✅ Supervisor user created")
            print(f"      📧 Email: {supervisor_email}")
            print(f"      🔑 Password: {supervisor_password}")
            print(f"      🏗️  Assigned to: PROJ001")

        # ============================================
        # 3d. CREATE SAMPLE VENDORS
        # ============================================
        print("🏭 Creating sample vendors...")
        
        vendors = [
            {"vendor_name": "ABC Construction Co.", "vendor_type": "Civil"},
            {"vendor_name": "PowerLine Electricals", "vendor_type": "Electrical"},
            {"vendor_name": "AquaFlow Plumbing", "vendor_type": "Plumbing"},
        ]
        
        for vendor in vendors:
            existing_vendor = await db.vendors.find_one({"vendor_name": vendor["vendor_name"]})
            
            if existing_vendor:
                print(f"   ⚠️  Vendor {vendor['vendor_name']} already exists. Skipping...")
            else:
                vendor_data = {
                    "organisation_id": organisation_id,
                    "vendor_name": vendor["vendor_name"],
                    "vendor_type": vendor["vendor_type"],
                    "active_status": True,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
                
                await db.vendors.insert_one(vendor_data)
                print(f"   ✅ Vendor created: {vendor['vendor_name']}")
        
        # ============================================
        # 4. CREATE CODE MASTER ENTRIES
        # ============================================
        print("🏷️  Creating Code Master entries...")
        
        codes = [
            {"code_short": "CIV", "code_name": "Civil Works"},
            {"code_short": "ELC", "code_name": "Electrical Works"},
            {"code_short": "PLB", "code_name": "Plumbing Works"},
            {"code_short": "FIN", "code_name": "Finishing Works"},
            {"code_short": "SWP", "code_name": "Site Work and Preparation"}
        ]
        
        created_codes = []
        
        for code in codes:
            existing_code = await db.code_master.find_one({"code_short": code["code_short"]})
            
            if existing_code:
                print(f"   ⚠️  Code {code['code_short']} already exists. Skipping...")
                created_codes.append(str(existing_code["_id"]))
            else:
                code_data = {
                    "code_short": code["code_short"],
                    "code_name": code["code_name"],
                    "active_status": True,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
                
                result = await db.code_master.insert_one(code_data)
                created_codes.append(str(result.inserted_id))
                print(f"   ✅ Code created: {code['code_short']} - {code['code_name']}")
        
        # ============================================
        # 5. CREATE INDEXES FOR PERFORMANCE
        # ============================================
        print("📇 Creating database indexes...")
        
        # Users indexes
        await db.users.create_index("email", unique=True)
        await db.users.create_index("organisation_id")
        
        # Projects indexes
        await db.projects.create_index("organisation_id")
        
        # Code master indexes
        await db.code_master.create_index("code_short", unique=True)
        
        # Budgets indexes
        await db.project_budgets.create_index([("project_id", 1), ("code_id", 1)], unique=True)
        
        # Derived financial state indexes
        await db.derived_financial_state.create_index([("project_id", 1), ("code_id", 1)], unique=True)
        
        # User project map indexes
        await db.user_project_map.create_index([("user_id", 1), ("project_id", 1)], unique=True)
        
        # Audit logs indexes
        await db.audit_logs.create_index([("organisation_id", 1), ("timestamp", -1)])
        await db.audit_logs.create_index([("entity_type", 1), ("entity_id", 1)])
        
        print("   ✅ Indexes created")
        
        # ============================================
        # SUMMARY
        # ============================================
        print("\n" + "="*60)
        print("✨ DATABASE SEEDING COMPLETE ✨")
        print("="*60)
        print(f"\n📊 Organisation ID: {organisation_id}")
        print(f"👤 Admin Email: {admin_email}")
        print(f"🔑 Admin Password: {admin_password}")
        print(f"👷 Supervisor Email: {supervisor_email}")
        print(f"🔑 Supervisor Password: {supervisor_password}")
        print(f"🏗️  Sample Project: PROJ001")
        print(f"💰 Default Currency: INR")
        print(f"🏷️  Code Master Entries: {len(created_codes)}")
        print(f"🏭 Vendors: 3")
        print("\n⚠️  SECURITY: Change passwords after first login!")
        print("\n🚀 Phase 1 Foundation Ready")
        print("   - JWT Authentication enabled")
        print("   - Permission enforcement active")
        print("   - Audit logging operational")
        print("   - Financial recalculation engine ready")
        print("\n📖 API Documentation: http://localhost:8001/docs")
        print("="*60)
        
    except Exception as e:
        print(f"\n❌ Error during seeding: {str(e)}")
        raise
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(seed_database())
