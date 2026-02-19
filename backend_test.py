#!/usr/bin/env python3
"""
Backend API Testing for Decimal128 Serialization Fix
Testing Phase 2 Wave 3 Decimal128 serialization issues

Test Credentials:
- Admin: admin@example.com / admin123

Endpoints to Test:
1. Work Orders List: GET /api/v2/work-orders
2. Payment Certificates List: GET /api/v2/payment-certificates  
3. Budget Management: GET /api/budgets
4. Project Detail: GET /api/projects/{project_id}
5. DPR Endpoints: GET /api/v2/dpr and POST /api/v2/dpr/ai-caption
"""

import asyncio
import aiohttp
import json
import os
from datetime import datetime
from typing import Dict, Any, Optional

# Get backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://dpr-voice-log.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

class BackendTester:
    def __init__(self):
        self.session = None
        self.auth_token = None
        self.user_info = None
        self.test_results = []
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def log_result(self, test_name: str, success: bool, details: str, response_data: Any = None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.utcnow().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {details}")
        
    async def authenticate(self, email: str = "admin@example.com", password: str = "admin123"):
        """Authenticate and get JWT token"""
        try:
            login_data = {
                "email": email,
                "password": password
            }
            
            async with self.session.post(f"{API_BASE}/auth/login", json=login_data) as response:
                if response.status == 200:
                    data = await response.json()
                    self.auth_token = data.get("access_token")
                    self.user_info = data.get("user")
                    self.log_result("Authentication", True, f"Successfully authenticated as {email}")
                    return True
                else:
                    error_text = await response.text()
                    self.log_result("Authentication", False, f"Login failed: {response.status} - {error_text}")
                    return False
                    
        except Exception as e:
            self.log_result("Authentication", False, f"Authentication error: {str(e)}")
            return False
    
    def get_headers(self):
        """Get headers with auth token"""
        if not self.auth_token:
            return {}
        return {"Authorization": f"Bearer {self.auth_token}"}
    
    async def test_endpoint(self, method: str, endpoint: str, test_name: str, 
                          expected_status: int = 200, data: Dict = None, 
                          check_decimal_serialization: bool = True):
        """Test a single endpoint"""
        try:
            url = f"{API_BASE}{endpoint}"
            headers = self.get_headers()
            
            if method.upper() == "GET":
                async with self.session.get(url, headers=headers) as response:
                    return await self._process_response(response, test_name, expected_status, check_decimal_serialization)
            elif method.upper() == "POST":
                async with self.session.post(url, headers=headers, json=data) as response:
                    return await self._process_response(response, test_name, expected_status, check_decimal_serialization)
            elif method.upper() == "PUT":
                async with self.session.put(url, headers=headers, json=data) as response:
                    return await self._process_response(response, test_name, expected_status, check_decimal_serialization)
                    
        except Exception as e:
            self.log_result(test_name, False, f"Request error: {str(e)}")
            return None
    
    async def _process_response(self, response, test_name: str, expected_status: int, check_decimal_serialization: bool):
        """Process HTTP response"""
        try:
            # Check status code
            if response.status != expected_status:
                error_text = await response.text()
                self.log_result(test_name, False, 
                              f"Unexpected status {response.status} (expected {expected_status}): {error_text}")
                return None
            
            # Try to parse JSON
            try:
                response_data = await response.json()
            except Exception as json_error:
                response_text = await response.text()
                self.log_result(test_name, False, 
                              f"JSON parsing failed: {str(json_error)}. Response: {response_text[:500]}")
                return None
            
            # Check for Decimal128 serialization issues
            if check_decimal_serialization:
                decimal_check = self._check_decimal_serialization(response_data)
                if not decimal_check["success"]:
                    self.log_result(test_name, False, 
                                  f"Decimal128 serialization issue: {decimal_check['error']}")
                    return None
            
            # Success
            self.log_result(test_name, True, 
                          f"Status {response.status}, valid JSON response with proper decimal serialization")
            return response_data
            
        except Exception as e:
            self.log_result(test_name, False, f"Response processing error: {str(e)}")
            return None
    
    def _check_decimal_serialization(self, data: Any, path: str = "root") -> Dict[str, Any]:
        """Recursively check for Decimal128 serialization issues"""
        try:
            if isinstance(data, dict):
                for key, value in data.items():
                    # Check if this looks like a Decimal128 object
                    if isinstance(value, dict) and "$numberDecimal" in value:
                        return {
                            "success": False,
                            "error": f"Found unserialised Decimal128 at {path}.{key}: {value}"
                        }
                    
                    # Check for monetary field names that should be numbers
                    monetary_fields = [
                        "amount", "rate", "quantity", "total", "value", "budget", "cost", "price",
                        "retention", "cgst", "sgst", "net_payable", "gross_amount", "tax_amount",
                        "approved_budget_amount", "committed_value", "certified_value", "paid_value",
                        "current_bill_amount", "cumulative_certified", "retention_held"
                    ]
                    
                    # Only check if the key contains monetary terms, not if it's an ID field
                    if any(field in key.lower() for field in monetary_fields) and not key.lower().endswith('_id'):
                        if not isinstance(value, (int, float, type(None))):
                            return {
                                "success": False,
                                "error": f"Monetary field {path}.{key} is not a number: {type(value)} = {value}"
                            }
                    
                    # Recursively check nested objects
                    if isinstance(value, (dict, list)):
                        nested_check = self._check_decimal_serialization(value, f"{path}.{key}")
                        if not nested_check["success"]:
                            return nested_check
                            
            elif isinstance(data, list):
                for i, item in enumerate(data):
                    if isinstance(item, (dict, list)):
                        nested_check = self._check_decimal_serialization(item, f"{path}[{i}]")
                        if not nested_check["success"]:
                            return nested_check
            
            return {"success": True}
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Error checking decimal serialization at {path}: {str(e)}"
            }
    
    async def run_decimal128_tests(self):
        """Run all Decimal128 serialization tests"""
        print("🔍 Starting Decimal128 Serialization Tests")
        print("=" * 60)
        
        # Authenticate first
        if not await self.authenticate():
            print("❌ Authentication failed - cannot proceed with tests")
            return
        
        print(f"✅ Authenticated as: {self.user_info.get('email')} ({self.user_info.get('role')})")
        print()
        
        # Test 1: Work Orders List
        print("📋 Testing Work Orders List...")
        await self.test_endpoint("GET", "/v2/work-orders", "Work Orders List")
        
        # Test 2: Payment Certificates List  
        print("📋 Testing Payment Certificates List...")
        await self.test_endpoint("GET", "/v2/payment-certificates", "Payment Certificates List")
        
        # Test 3: Budget Management
        print("📋 Testing Budget Management...")
        await self.test_endpoint("GET", "/budgets", "Budget Management")
        
        # Test 4: Get Projects List first
        print("📋 Testing Projects List...")
        projects_data = await self.test_endpoint("GET", "/projects", "Projects List")
        
        # Test 5: Project Detail (if we have projects)
        if projects_data and isinstance(projects_data, list) and len(projects_data) > 0:
            project_id = projects_data[0].get("project_id")
            if project_id:
                print(f"📋 Testing Project Detail for ID: {project_id}...")
                await self.test_endpoint("GET", f"/projects/{project_id}", "Project Detail")
            else:
                self.log_result("Project Detail", False, "No project_id found in projects list")
        else:
            self.log_result("Project Detail", False, "No projects available to test project detail endpoint")
        
        # Test 6: DPR List
        print("📋 Testing DPR List...")
        await self.test_endpoint("GET", "/v2/dpr", "DPR List")
        
        # Test 7: DPR AI Caption (POST endpoint)
        print("📋 Testing DPR AI Caption...")
        ai_caption_data = {
            "image_data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        }
        await self.test_endpoint("POST", "/v2/dpr/ai-caption", "DPR AI Caption", data=ai_caption_data)
        
        # Test 8: Financial State (if we have projects)
        if projects_data and isinstance(projects_data, list) and len(projects_data) > 0:
            project_id = projects_data[0].get("project_id")
            if project_id:
                print(f"📋 Testing Financial State for project: {project_id}...")
                await self.test_endpoint("GET", f"/financial-state?project_id={project_id}", "Financial State")
        
        # Test 9: Hardened Financial State (v2)
        if projects_data and isinstance(projects_data, list) and len(projects_data) > 0:
            project_id = projects_data[0].get("project_id")
            if project_id:
                print(f"📋 Testing Hardened Financial State for project: {project_id}...")
                await self.test_endpoint("GET", f"/v2/financial-state/{project_id}", "Hardened Financial State")
        
        # Test 10: Snapshots List (Wave 3)
        print("📋 Testing Snapshots List...")
        await self.test_endpoint("GET", "/v2/snapshots", "Snapshots List")
        
        # Test 11: Wave 3 Health Check
        print("📋 Testing Wave 3 Health Check...")
        await self.test_endpoint("GET", "/v2/wave3/health", "Wave 3 Health Check")
        
        # Test 12: Hardened Health Check
        print("📋 Testing Hardened Health Check...")
        await self.test_endpoint("GET", "/v2/health", "Hardened Health Check")
        
        print()
        print("=" * 60)
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"📊 TEST SUMMARY")
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%" if total_tests > 0 else "0%")
        
        if failed_tests > 0:
            print("\n🚨 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        print("\n🔍 DECIMAL128 SERIALIZATION STATUS:")
        decimal_issues = [r for r in self.test_results if not r["success"] and "decimal" in r["details"].lower()]
        if decimal_issues:
            print("❌ Decimal128 serialization issues found:")
            for issue in decimal_issues:
                print(f"  - {issue['test']}: {issue['details']}")
        else:
            print("✅ No Decimal128 serialization issues detected in successful tests")


async def main():
    """Main test runner"""
    print("🚀 Backend API Testing - Decimal128 Serialization Fix Verification")
    print(f"🌐 Backend URL: {BACKEND_URL}")
    print(f"🔗 API Base: {API_BASE}")
    print()
    
    async with BackendTester() as tester:
        await tester.run_decimal128_tests()


if __name__ == "__main__":
    asyncio.run(main())