#!/usr/bin/env python3
"""
PHASE 2 WAVE 2 - LIFECYCLE & STRUCTURAL INTEGRITY LOCK TESTING

Tests all 7 scenarios from the review request:
1. Attempt edit on locked WO → should be blocked
2. Unlock WO without reason → should be blocked  
3. Attempt delete on certified PC → should be blocked
4. Submit progress without attendance → should be blocked
5. Generate DPR with 3 images → should be blocked
6. Set weightages to 90 total → should be blocked
7. Modify WO → version snapshot created
"""

import asyncio
import aiohttp
import json
import os
from datetime import datetime, date
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://backend-hardening-3.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"
API_V2_BASE = f"{BASE_URL}/api/v2"

# Test credentials
ADMIN_CREDENTIALS = {
    "email": "admin@example.com",
    "password": "admin123"
}

SUPERVISOR_CREDENTIALS = {
    "email": "supervisor@example.com", 
    "password": "super123"
}

class Wave2Tester:
    def __init__(self):
        self.session = None
        self.admin_token = None
        self.supervisor_token = None
        self.test_results = {}
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def authenticate(self):
        """Authenticate admin and supervisor users"""
        print("🔐 Authenticating users...")
        
        # Admin login
        async with self.session.post(f"{API_BASE}/auth/login", json=ADMIN_CREDENTIALS) as resp:
            if resp.status == 200:
                data = await resp.json()
                self.admin_token = data["access_token"]
                print("✅ Admin authenticated")
            else:
                error = await resp.text()
                print(f"❌ Admin auth failed: {error}")
                return False
        
        # Supervisor login
        async with self.session.post(f"{API_BASE}/auth/login", json=SUPERVISOR_CREDENTIALS) as resp:
            if resp.status == 200:
                data = await resp.json()
                self.supervisor_token = data["access_token"]
                print("✅ Supervisor authenticated")
            else:
                error = await resp.text()
                print(f"❌ Supervisor auth failed: {error}")
                return False
                
        return True
    
    def get_headers(self, token: str) -> Dict[str, str]:
        """Get authorization headers"""
        return {"Authorization": f"Bearer {token}"}
    
    async def setup_test_data(self):
        """Setup test data: vendor, project, work order, payment certificate"""
        print("\n📋 Setting up test data...")
        
        # Create vendor
        vendor_code = f"TV-W2-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        vendor_data = {
            "vendor_name": "Test Vendor Wave2",
            "vendor_code": vendor_code,
            "contact_person": "John Doe",
            "email": "john@testvendor.com",
            "phone": "1234567890"
        }
        
        async with self.session.post(
            f"{API_V2_BASE}/vendors",
            json=vendor_data,
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 201:
                vendor = await resp.json()
                self.vendor_id = vendor["vendor_id"]
                print(f"✅ Created vendor: {self.vendor_id}")
            else:
                error = await resp.text()
                print(f"❌ Vendor creation failed: {error}")
                return False
        
        # Get existing project (should exist from previous tests)
        async with self.session.get(
            f"{API_BASE}/projects",
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 200:
                projects = await resp.json()
                if projects:
                    self.project_id = projects[0]["project_id"]
                    print(f"✅ Using project: {self.project_id}")
                else:
                    print("❌ No projects found")
                    return False
            else:
                error = await resp.text()
                print(f"❌ Project fetch failed: {error}")
                return False
        
        # Get existing codes
        async with self.session.get(
            f"{API_BASE}/codes",
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 200:
                codes = await resp.json()
                if codes:
                    self.code_id = codes[0]["code_id"]
                    print(f"✅ Using code: {self.code_id}")
                else:
                    print("❌ No codes found")
                    return False
            else:
                error = await resp.text()
                print(f"❌ Code fetch failed: {error}")
                return False
        
        # Create work order
        wo_data = {
            "project_id": self.project_id,
            "code_id": self.code_id,
            "vendor_id": self.vendor_id,
            "issue_date": datetime.now().isoformat(),
            "rate": 100.50,
            "quantity": 10
        }
        
        async with self.session.post(
            f"{API_V2_BASE}/work-orders",
            json=wo_data,
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 201:
                wo = await resp.json()
                self.wo_id = wo["wo_id"]
                print(f"✅ Created work order: {self.wo_id}")
            else:
                error = await resp.text()
                print(f"❌ Work order creation failed: {error}")
                return False
        
        # Issue the work order (this should lock it)
        issue_data = {
            "issue_date": datetime.now().date().isoformat()
        }
        
        async with self.session.post(
            f"{API_V2_BASE}/work-orders/{self.wo_id}/issue",
            json=issue_data,
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 200:
                print(f"✅ Issued work order (should be locked now)")
            else:
                error = await resp.text()
                print(f"❌ Work order issue failed: {error}")
                return False
        
        # Create payment certificate
        pc_data = {
            "project_id": self.project_id,
            "code_id": self.code_id,
            "vendor_id": self.vendor_id,
            "bill_date": datetime.now().isoformat(),
            "current_bill_amount": 500.25
        }
        
        async with self.session.post(
            f"{API_V2_BASE}/payment-certificates",
            json=pc_data,
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 201:
                pc = await resp.json()
                self.pc_id = pc["pc_id"]
                print(f"✅ Created payment certificate: {self.pc_id}")
            else:
                error = await resp.text()
                print(f"❌ Payment certificate creation failed: {error}")
                return False
        
        # Certify the payment certificate
        certify_data = {
            "certify_date": datetime.now().date().isoformat(),
            "invoice_number": f"INV-W2-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        }
        
        async with self.session.post(
            f"{API_V2_BASE}/payment-certificates/{self.pc_id}/certify",
            json=certify_data,
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 200:
                print(f"✅ Certified payment certificate")
            else:
                error = await resp.text()
                print(f"❌ Payment certificate certification failed: {error}")
                return False
        
        return True
    
    async def test_scenario_1_locked_wo_edit(self):
        """Test 1: Attempt edit on locked WO → should be blocked"""
        print("\n🧪 Test 1: Attempt edit on locked WO")
        
        # Try to revise the locked work order
        revise_data = {
            "rate": 200.00
        }
        
        async with self.session.post(
            f"{API_V2_BASE}/work-orders/{self.wo_id}/revise",
            json=revise_data,
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 400:
                error_data = await resp.json()
                error_detail = error_data.get("detail", "")
                if isinstance(error_detail, list):
                    error_detail = str(error_detail)
                if "locked" in error_detail.lower():
                    print("✅ PASS: Edit blocked on locked WO")
                    self.test_results["scenario_1"] = "PASS"
                    return True
                else:
                    print(f"❌ FAIL: Wrong error message: {error_data}")
                    self.test_results["scenario_1"] = "FAIL"
                    return False
            else:
                error_text = await resp.text()
                print(f"❌ FAIL: Expected 400, got {resp.status}: {error_text}")
                self.test_results["scenario_1"] = "FAIL"
                return False
    
    async def test_scenario_2_unlock_without_reason(self):
        """Test 2: Unlock WO without reason → should be blocked"""
        print("\n🧪 Test 2: Unlock WO without reason")
        
        # Try to unlock without reason
        unlock_data = {"reason": ""}
        
        async with self.session.post(
            f"{API_V2_BASE}/lifecycle/work-orders/{self.wo_id}/unlock",
            json=unlock_data,
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status in [400, 422]:
                error_data = await resp.json()
                error_detail = error_data.get("detail", "")
                if isinstance(error_detail, list):
                    error_detail = str(error_detail)
                if "reason" in error_detail.lower():
                    print("✅ PASS: Unlock blocked without reason")
                    self.test_results["scenario_2"] = "PASS"
                    return True
                else:
                    print(f"❌ FAIL: Wrong error message: {error_data}")
                    self.test_results["scenario_2"] = "FAIL"
                    return False
            else:
                error_text = await resp.text()
                print(f"❌ FAIL: Expected 400/422, got {resp.status}: {error_text}")
                self.test_results["scenario_2"] = "FAIL"
                return False
    
    async def test_scenario_3_delete_certified_pc(self):
        """Test 3: Attempt delete on certified PC → should be blocked"""
        print("\n🧪 Test 3: Attempt delete on certified PC")
        
        async with self.session.delete(
            f"{API_V2_BASE}/lifecycle/payment-certificates/{self.pc_id}",
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 405:
                error_data = await resp.json()
                if "disable" in error_data.get("detail", "").lower():
                    print("✅ PASS: Hard delete blocked, directed to soft disable")
                    self.test_results["scenario_3"] = "PASS"
                    return True
                else:
                    print(f"❌ FAIL: Wrong error message: {error_data}")
                    self.test_results["scenario_3"] = "FAIL"
                    return False
            else:
                print(f"❌ FAIL: Expected 405, got {resp.status}")
                self.test_results["scenario_3"] = "FAIL"
                return False
    
    async def test_scenario_4_progress_without_attendance(self):
        """Test 4: Submit progress without attendance → should be blocked"""
        print("\n🧪 Test 4: Submit progress without attendance")
        
        # Try to upload DPR image without marking attendance
        image_data = {
            "project_id": self.project_id,
            "image_url": "https://example.com/test-image.jpg",
            "width": 600,
            "height": 800,  # Portrait orientation
            "metadata": {"test": True}
        }
        
        async with self.session.post(
            f"{API_V2_BASE}/dpr/images",
            json=image_data,
            headers=self.get_headers(self.supervisor_token)
        ) as resp:
            if resp.status == 400:
                error_data = await resp.json()
                if "attendance" in error_data.get("detail", "").lower():
                    print("✅ PASS: Progress blocked without attendance")
                    self.test_results["scenario_4"] = "PASS"
                    return True
                else:
                    print(f"❌ FAIL: Wrong error message: {error_data}")
                    self.test_results["scenario_4"] = "FAIL"
                    return False
            else:
                print(f"❌ FAIL: Expected 400, got {resp.status}")
                self.test_results["scenario_4"] = "FAIL"
                return False
    
    async def test_scenario_5_dpr_with_insufficient_images(self):
        """Test 5: Generate DPR with 3 images → should be blocked"""
        print("\n🧪 Test 5: Generate DPR with only 3 images")
        
        # First mark attendance
        attendance_data = {
            "project_id": self.project_id,
            "attendance_date": datetime.now().date().isoformat()
        }
        
        async with self.session.post(
            f"{API_V2_BASE}/attendance",
            json=attendance_data,
            headers=self.get_headers(self.supervisor_token)
        ) as resp:
            if resp.status == 201:
                print("✅ Attendance marked")
            else:
                error = await resp.text()
                print(f"❌ Attendance marking failed: {error}")
                self.test_results["scenario_5"] = "FAIL"
                return False
        
        # Upload only 3 images (need 4 minimum)
        for i in range(3):
            image_data = {
                "project_id": self.project_id,
                "image_url": f"https://example.com/test-image-{i+1}.jpg",
                "width": 600,
                "height": 800,  # Portrait orientation
                "metadata": {"test": True, "image_number": i+1}
            }
            
            async with self.session.post(
                f"{API_V2_BASE}/dpr/images",
                json=image_data,
                headers=self.get_headers(self.supervisor_token)
            ) as resp:
                if resp.status == 201:
                    print(f"✅ Uploaded image {i+1}")
                else:
                    error = await resp.text()
                    print(f"❌ Image {i+1} upload failed: {error}")
                    self.test_results["scenario_5"] = "FAIL"
                    return False
        
        # Try to generate DPR with only 3 images
        dpr_data = {
            "project_id": self.project_id,
            "dpr_date": datetime.now().date().isoformat()
        }
        
        async with self.session.post(
            f"{API_V2_BASE}/dpr/generate",
            json=dpr_data,
            headers=self.get_headers(self.supervisor_token)
        ) as resp:
            if resp.status == 400:
                error_data = await resp.json()
                if "image" in error_data.get("detail", "").lower() and "4" in error_data.get("detail", ""):
                    print("✅ PASS: DPR generation blocked with insufficient images")
                    self.test_results["scenario_5"] = "PASS"
                    return True
                else:
                    print(f"❌ FAIL: Wrong error message: {error_data}")
                    self.test_results["scenario_5"] = "FAIL"
                    return False
            else:
                print(f"❌ FAIL: Expected 400, got {resp.status}")
                self.test_results["scenario_5"] = "FAIL"
                return False
    
    async def test_scenario_6_invalid_weightages(self):
        """Test 6: Set weightages to 90 total → should be blocked"""
        print("\n🧪 Test 6: Set weightages summing to 90")
        
        # Get project codes first
        async with self.session.get(
            f"{API_BASE}/codes",
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 200:
                codes = await resp.json()
                if len(codes) >= 2:
                    code_ids = [code["code_id"] for code in codes[:2]]
                else:
                    print("❌ Need at least 2 codes for weightage test")
                    self.test_results["scenario_6"] = "FAIL"
                    return False
            else:
                error = await resp.text()
                print(f"❌ Failed to get codes: {error}")
                self.test_results["scenario_6"] = "FAIL"
                return False
        
        # Set weightages that sum to 90 (should be 100)
        weightage_data = {
            "project_id": self.project_id,
            "weightages": {
                code_ids[0]: 50.0,
                code_ids[1]: 40.0  # Total = 90, not 100
            }
        }
        
        async with self.session.post(
            f"{API_V2_BASE}/weightages",
            json=weightage_data,
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 400:
                error_data = await resp.json()
                if "100" in error_data.get("detail", "") or "weightage" in error_data.get("detail", "").lower():
                    print("✅ PASS: Invalid weightages blocked")
                    self.test_results["scenario_6"] = "PASS"
                    return True
                else:
                    print(f"❌ FAIL: Wrong error message: {error_data}")
                    self.test_results["scenario_6"] = "FAIL"
                    return False
            else:
                print(f"❌ FAIL: Expected 400, got {resp.status}")
                self.test_results["scenario_6"] = "FAIL"
                return False
    
    async def test_scenario_7_version_snapshot(self):
        """Test 7: Modify WO → version snapshot created"""
        print("\n🧪 Test 7: Modify WO and check version snapshot")
        
        # First unlock the work order with valid reason
        unlock_data = {"reason": "Testing version snapshot creation"}
        
        async with self.session.post(
            f"{API_V2_BASE}/lifecycle/work-orders/{self.wo_id}/unlock",
            json=unlock_data,
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 200:
                print("✅ Work order unlocked")
            else:
                error = await resp.text()
                print(f"❌ Unlock failed: {error}")
                self.test_results["scenario_7"] = "FAIL"
                return False
        
        # Get version history before modification
        async with self.session.get(
            f"{API_V2_BASE}/lifecycle/work-orders/{self.wo_id}/versions",
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 200:
                versions_before = await resp.json()
                version_count_before = len(versions_before.get("versions", []))
                print(f"✅ Versions before: {version_count_before}")
            else:
                error = await resp.text()
                print(f"❌ Failed to get versions before: {error}")
                self.test_results["scenario_7"] = "FAIL"
                return False
        
        # Modify the work order
        revise_data = {
            "rate": 150.75
        }
        
        async with self.session.post(
            f"{API_V2_BASE}/work-orders/{self.wo_id}/revise",
            json=revise_data,
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 200:
                print("✅ Work order modified")
            else:
                error = await resp.text()
                print(f"❌ Modification failed: {error}")
                self.test_results["scenario_7"] = "FAIL"
                return False
        
        # Get version history after modification
        async with self.session.get(
            f"{API_V2_BASE}/lifecycle/work-orders/{self.wo_id}/versions",
            headers=self.get_headers(self.admin_token)
        ) as resp:
            if resp.status == 200:
                versions_after = await resp.json()
                version_count_after = len(versions_after.get("versions", []))
                print(f"✅ Versions after: {version_count_after}")
                
                if version_count_after > version_count_before:
                    print("✅ PASS: Version snapshot created")
                    self.test_results["scenario_7"] = "PASS"
                    return True
                else:
                    print("❌ FAIL: No new version snapshot created")
                    self.test_results["scenario_7"] = "FAIL"
                    return False
            else:
                error = await resp.text()
                print(f"❌ Failed to get versions after: {error}")
                self.test_results["scenario_7"] = "FAIL"
                return False
    
    async def run_all_tests(self):
        """Run all test scenarios"""
        print("🚀 Starting Phase 2 Wave 2 Testing")
        print("=" * 50)
        
        # Authenticate
        if not await self.authenticate():
            return False
        
        # Setup test data
        if not await self.setup_test_data():
            return False
        
        # Run all test scenarios
        await self.test_scenario_1_locked_wo_edit()
        await self.test_scenario_2_unlock_without_reason()
        await self.test_scenario_3_delete_certified_pc()
        await self.test_scenario_4_progress_without_attendance()
        await self.test_scenario_5_dpr_with_insufficient_images()
        await self.test_scenario_6_invalid_weightages()
        await self.test_scenario_7_version_snapshot()
        
        # Print summary
        print("\n" + "=" * 50)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 50)
        
        passed = 0
        total = len(self.test_results)
        
        for scenario, result in self.test_results.items():
            status_icon = "✅" if result == "PASS" else "❌"
            print(f"{status_icon} {scenario}: {result}")
            if result == "PASS":
                passed += 1
        
        print(f"\n🎯 Overall: {passed}/{total} tests passed")
        
        return passed == total

async def main():
    """Main test runner"""
    async with Wave2Tester() as tester:
        success = await tester.run_all_tests()
        return success

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)