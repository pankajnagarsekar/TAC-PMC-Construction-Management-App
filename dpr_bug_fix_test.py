#!/usr/bin/env python3
"""
DPR Bug Fix Testing Script

Tests the 3 specific scenarios mentioned in the review request:
1. Edit Draft DPR (404 Fix) - status comparison now uses .lower() to handle "Draft" vs "draft"
2. AI Caption Generation - should use EMERGENT provider, not MOCK
3. DPR Full Workflow - Create DPR → Add multiple images → Verify each image add works

API Base: Uses REACT_APP_BACKEND_URL from frontend/.env
Auth: POST /api/auth/login with {"email": "admin@example.com", "password": "admin123"}
"""

import asyncio
import aiohttp
import json
import base64
import os
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Load environment variables
def load_env_file(file_path: str) -> Dict[str, str]:
    """Load environment variables from .env file"""
    env_vars = {}
    try:
        with open(file_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key] = value
        return env_vars
    except FileNotFoundError:
        print(f"Warning: {file_path} not found")
        return {}

# Use localhost for testing since external URL is not accessible
BACKEND_URL = 'http://localhost:8001'

print(f"Using backend URL: {BACKEND_URL}")

class DPRBugFixTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session = None
        self.auth_token = None
        self.test_results = []
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def log_result(self, test_name: str, success: bool, message: str, details: Any = None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    async def login_admin(self) -> bool:
        """Login as admin user"""
        try:
            login_data = {
                "email": "admin@example.com",
                "password": "admin123"
            }
            
            async with self.session.post(
                f"{self.base_url}/api/auth/login",
                json=login_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    self.auth_token = data.get("access_token")
                    self.log_result("Admin Login", True, "Successfully logged in as admin")
                    return True
                else:
                    error_text = await response.text()
                    self.log_result("Admin Login", False, f"Login failed with status {response.status}", error_text)
                    return False
                    
        except Exception as e:
            self.log_result("Admin Login", False, f"Login error: {str(e)}")
            return False
    
    def get_auth_headers(self) -> Dict[str, str]:
        """Get authorization headers"""
        return {
            "Authorization": f"Bearer {self.auth_token}",
            "Content-Type": "application/json"
        }
    
    async def get_projects(self) -> Optional[str]:
        """Get first available project ID"""
        try:
            async with self.session.get(
                f"{self.base_url}/api/projects",
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    projects = await response.json()
                    if projects and len(projects) > 0:
                        project_id = projects[0].get("project_id")
                        self.log_result("Get Projects", True, f"Found project: {project_id}")
                        return project_id
                    else:
                        self.log_result("Get Projects", False, "No projects found")
                        return None
                else:
                    error_text = await response.text()
                    self.log_result("Get Projects", False, f"Failed to get projects: {response.status}", error_text)
                    return None
        except Exception as e:
            self.log_result("Get Projects", False, f"Error getting projects: {str(e)}")
            return None
    
    def create_test_image_base64(self) -> str:
        """Create a small test image in base64 format (simulating a construction photo)"""
        # Create a simple 1x1 pixel PNG in base64
        # This is a minimal valid PNG image
        png_data = base64.b64encode(
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\nIDATx\x9cc\xf8\x00\x00\x00\x01\x00\x01\x00\x00\x00\x00IEND\xaeB`\x82'
        ).decode('utf-8')
        return f"data:image/png;base64,{png_data}"
    
    async def test_1_edit_draft_dpr_404_fix(self, project_id: str) -> bool:
        """
        Test 1: Edit Draft DPR (404 Fix)
        - Create a new DPR via POST /api/v2/dpr
        - Then try to UPDATE it via PUT /api/v2/dpr/{dpr_id} with some progress_notes
        - Expected: Should return 200 success, NOT 400 error
        - The fix was: status comparison now uses .lower() to handle "Draft" vs "draft"
        """
        print("\n=== TEST 1: Edit Draft DPR (404 Fix) ===")
        
        try:
            # Step 1: Create a new DPR
            today = datetime.now().strftime("%Y-%m-%d")
            dpr_data = {
                "project_id": project_id,
                "dpr_date": today,
                "progress_notes": "Initial progress notes",
                "weather_conditions": "Sunny",
                "manpower_count": 10,
                "activities_completed": ["Foundation work"],
                "issues_encountered": "None"
            }
            
            async with self.session.post(
                f"{self.base_url}/api/v2/dpr",
                json=dpr_data,
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 201:
                    create_result = await response.json()
                    dpr_id = create_result.get("dpr_id")
                    self.log_result("Create DPR", True, f"DPR created with ID: {dpr_id}")
                else:
                    error_text = await response.text()
                    self.log_result("Create DPR", False, f"Failed to create DPR: {response.status}", error_text)
                    return False
            
            # Step 2: Try to UPDATE the DPR (this should work with the fix)
            update_data = {
                "progress_notes": "Updated progress notes - testing the fix",
                "weather_conditions": "Cloudy",
                "manpower_count": 12,
                "issues_encountered": "Minor delay due to material delivery"
            }
            
            async with self.session.put(
                f"{self.base_url}/api/v2/dpr/{dpr_id}",
                json=update_data,
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    update_result = await response.json()
                    self.log_result("Update Draft DPR", True, "Successfully updated draft DPR - 404 fix working!")
                    return True
                else:
                    error_text = await response.text()
                    self.log_result("Update Draft DPR", False, f"Failed to update DPR: {response.status} - Bug still exists!", error_text)
                    return False
                    
        except Exception as e:
            self.log_result("Edit Draft DPR Test", False, f"Test error: {str(e)}")
            return False
    
    async def test_2_ai_caption_generation(self) -> bool:
        """
        Test 2: AI Caption Generation
        - Call POST /api/v2/dpr/ai-caption with a sample base64 image
        - Use a small test image (can be a simple colored square encoded as base64)
        - Expected: Should return ai_caption, confidence, and alternatives
        - Verify the EMERGENT provider is being used (not MOCK)
        """
        print("\n=== TEST 2: AI Caption Generation ===")
        
        try:
            # Create test image data
            test_image = self.create_test_image_base64()
            
            caption_request = {
                "image_data": test_image
            }
            
            async with self.session.post(
                f"{self.base_url}/api/v2/dpr/ai-caption",
                json=caption_request,
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    
                    # Check required fields
                    required_fields = ["ai_caption", "confidence", "alternatives"]
                    missing_fields = [field for field in required_fields if field not in result]
                    
                    if missing_fields:
                        self.log_result("AI Caption Generation", False, f"Missing fields: {missing_fields}", result)
                        return False
                    
                    # Check if EMERGENT provider is being used (not MOCK)
                    note = result.get("note", "")
                    if "Mock caption" in note or "API key not configured" in note:
                        self.log_result("AI Caption Generation", False, "MOCK provider being used instead of EMERGENT", result)
                        return False
                    elif "Fallback caption" in note:
                        self.log_result("AI Caption Generation", False, "Fallback caption - EMERGENT provider may have issues", result)
                        return False
                    else:
                        self.log_result("AI Caption Generation", True, f"EMERGENT provider working! Caption: {result['ai_caption']}")
                        return True
                        
                else:
                    error_text = await response.text()
                    self.log_result("AI Caption Generation", False, f"API call failed: {response.status}", error_text)
                    return False
                    
        except Exception as e:
            self.log_result("AI Caption Generation Test", False, f"Test error: {str(e)}")
            return False
    
    async def test_3_dpr_full_workflow(self, project_id: str) -> bool:
        """
        Test 3: DPR Full Workflow
        - Create DPR → Add multiple images → Verify each image add works
        - This tests the photo adding functionality (crash fix was frontend-side)
        """
        print("\n=== TEST 3: DPR Full Workflow ===")
        
        try:
            # Step 1: Create a new DPR
            today = datetime.now().strftime("%Y-%m-%d")
            dpr_data = {
                "project_id": project_id,
                "dpr_date": today,
                "progress_notes": "Full workflow test",
                "weather_conditions": "Clear",
                "manpower_count": 15,
                "activities_completed": ["Excavation", "Foundation"],
                "issues_encountered": "None"
            }
            
            async with self.session.post(
                f"{self.base_url}/api/v2/dpr",
                json=dpr_data,
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 201:
                    create_result = await response.json()
                    dpr_id = create_result.get("dpr_id")
                    self.log_result("Create DPR for Workflow", True, f"DPR created: {dpr_id}")
                else:
                    error_text = await response.text()
                    self.log_result("Create DPR for Workflow", False, f"Failed: {response.status}", error_text)
                    return False
            
            # Step 2: Add multiple images (minimum 4 required)
            test_image = self.create_test_image_base64()
            images_added = 0
            
            for i in range(4):  # Add 4 images as required
                image_data = {
                    "dpr_id": dpr_id,
                    "image_data": test_image,
                    "caption": f"Test construction photo {i+1}",
                    "activity_code": f"ACT{i+1:02d}"
                }
                
                async with self.session.post(
                    f"{self.base_url}/api/v2/dpr/{dpr_id}/images",
                    json=image_data,
                    headers=self.get_auth_headers()
                ) as response:
                    if response.status == 201:
                        image_result = await response.json()
                        images_added += 1
                        self.log_result(f"Add Image {i+1}", True, f"Image added: {image_result.get('image_id')}")
                    else:
                        error_text = await response.text()
                        self.log_result(f"Add Image {i+1}", False, f"Failed: {response.status}", error_text)
                        return False
            
            # Step 3: Verify DPR has all images
            async with self.session.get(
                f"{self.base_url}/api/v2/dpr/{dpr_id}",
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    dpr_details = await response.json()
                    image_count = dpr_details.get("image_count", 0)
                    
                    if image_count == 4:
                        self.log_result("Verify Image Count", True, f"All 4 images successfully added to DPR")
                        
                        # Step 4: Try to generate PDF (optional - tests full workflow)
                        async with self.session.post(
                            f"{self.base_url}/api/v2/dpr/{dpr_id}/generate-pdf",
                            headers=self.get_auth_headers()
                        ) as pdf_response:
                            if pdf_response.status == 200:
                                pdf_result = await pdf_response.json()
                                self.log_result("Generate PDF", True, f"PDF generated: {pdf_result.get('file_name')}")
                                return True
                            else:
                                pdf_error = await pdf_response.text()
                                self.log_result("Generate PDF", False, f"PDF generation failed: {pdf_response.status}", pdf_error)
                                # Still consider workflow successful if images were added
                                return True
                    else:
                        self.log_result("Verify Image Count", False, f"Expected 4 images, got {image_count}")
                        return False
                else:
                    error_text = await response.text()
                    self.log_result("Verify DPR Details", False, f"Failed to get DPR: {response.status}", error_text)
                    return False
                    
        except Exception as e:
            self.log_result("DPR Full Workflow Test", False, f"Test error: {str(e)}")
            return False
    
    async def run_all_tests(self):
        """Run all DPR bug fix tests"""
        print("🚀 Starting DPR Bug Fix Testing...")
        print(f"Backend URL: {self.base_url}")
        
        # Login first
        if not await self.login_admin():
            print("❌ Cannot proceed without admin login")
            return
        
        # Get project ID
        project_id = await self.get_projects()
        if not project_id:
            print("❌ Cannot proceed without a project")
            return
        
        # Run the 3 specific tests
        test1_result = await self.test_1_edit_draft_dpr_404_fix(project_id)
        test2_result = await self.test_2_ai_caption_generation()
        test3_result = await self.test_3_dpr_full_workflow(project_id)
        
        # Summary
        print("\n" + "="*60)
        print("📊 DPR BUG FIX TEST SUMMARY")
        print("="*60)
        
        total_tests = 3
        passed_tests = sum([test1_result, test2_result, test3_result])
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        print("\nDetailed Results:")
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['test']}: {result['message']}")
        
        if passed_tests == total_tests:
            print("\n🎉 ALL DPR BUG FIXES ARE WORKING CORRECTLY!")
        else:
            print(f"\n⚠️  {total_tests - passed_tests} bug fix(es) still need attention")
        
        return passed_tests == total_tests

async def main():
    """Main test execution"""
    async with DPRBugFixTester() as tester:
        success = await tester.run_all_tests()
        return success

if __name__ == "__main__":
    try:
        result = asyncio.run(main())
        exit(0 if result else 1)
    except KeyboardInterrupt:
        print("\n⏹️  Testing interrupted by user")
        exit(1)
    except Exception as e:
        print(f"\n💥 Unexpected error: {str(e)}")
        exit(1)