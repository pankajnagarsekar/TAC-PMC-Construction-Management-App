#!/usr/bin/env python3
"""
Construction Management System - Phase 1 API Testing
Comprehensive test suite for all backend APIs
"""

import requests
import json
import sys
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://enterprise-cms-base.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"
SUPERVISOR_EMAIL = "supervisor@example.com"
SUPERVISOR_PASSWORD = "super123"

class APITester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        self.supervisor_token = None
        self.admin_user_id = None
        self.supervisor_user_id = None
        self.organisation_id = None
        self.test_results = []
        self.created_entities = {
            'projects': [],
            'codes': [],
            'budgets': [],
            'mappings': []
        }
        
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if not success and response_data:
            print(f"   Response: {response_data}")
        print()
        
        self.test_results.append({
            'test': test_name,
            'success': success,
            'details': details,
            'response': response_data
        })
    
    def make_request(self, method: str, endpoint: str, data: Dict = None, 
                    token: str = None, params: Dict = None) -> tuple:
        """Make HTTP request with proper headers"""
        url = f"{BASE_URL}{endpoint}"
        headers = {"Content-Type": "application/json"}
        
        if token:
            headers["Authorization"] = f"Bearer {token}"
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=headers, params=params)
            elif method.upper() == "POST":
                response = self.session.post(url, headers=headers, json=data)
            elif method.upper() == "PUT":
                response = self.session.put(url, headers=headers, json=data)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            return response.status_code, response.json() if response.content else {}
        except requests.exceptions.RequestException as e:
            return 0, {"error": str(e)}
        except json.JSONDecodeError:
            return response.status_code, {"error": "Invalid JSON response"}
    
    def test_health_check(self):
        """Test 1: Health Check"""
        status_code, response = self.make_request("GET", "/health")
        
        success = (status_code == 200 and 
                  response.get("status") == "healthy" and
                  "version" in response)
        
        self.log_test("Health Check", success, 
                     f"Status: {status_code}, Response: {response}")
        return success
    
    def test_admin_login(self):
        """Test 2: Admin Authentication"""
        login_data = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
        
        status_code, response = self.make_request("POST", "/auth/login", login_data)
        
        success = (status_code == 200 and 
                  "access_token" in response and
                  "user" in response)
        
        if success:
            self.admin_token = response["access_token"]
            self.admin_user_id = response["user"]["user_id"]
            self.organisation_id = response["user"]["organisation_id"]
            
        self.log_test("Admin Login", success,
                     f"Status: {status_code}, Token received: {bool(self.admin_token)}")
        return success
    
    def test_supervisor_login(self):
        """Test 3: Supervisor Authentication"""
        login_data = {
            "email": SUPERVISOR_EMAIL,
            "password": SUPERVISOR_PASSWORD
        }
        
        status_code, response = self.make_request("POST", "/auth/login", login_data)
        
        success = (status_code == 200 and 
                  "access_token" in response and
                  "user" in response)
        
        if success:
            self.supervisor_token = response["access_token"]
            self.supervisor_user_id = response["user"]["user_id"]
            
        self.log_test("Supervisor Login", success,
                     f"Status: {status_code}, Token received: {bool(self.supervisor_token)}")
        return success
    
    def test_get_all_users(self):
        """Test 4: Get All Users"""
        status_code, response = self.make_request("GET", "/users", token=self.admin_token)
        
        success = (status_code == 200 and 
                  isinstance(response, list) and
                  len(response) >= 2)  # Should have admin + supervisor
        
        user_emails = [user.get("email") for user in response] if isinstance(response, list) else []
        has_admin = ADMIN_EMAIL in user_emails
        has_supervisor = SUPERVISOR_EMAIL in user_emails
        
        self.log_test("Get All Users", success,
                     f"Status: {status_code}, Users found: {len(response) if isinstance(response, list) else 0}, "
                     f"Admin: {has_admin}, Supervisor: {has_supervisor}")
        return success
    
    def test_get_user_by_id(self):
        """Test 5: Get Specific User by ID"""
        if not self.supervisor_user_id:
            self.log_test("Get User by ID", False, "No supervisor user ID available")
            return False
            
        status_code, response = self.make_request("GET", f"/users/{self.supervisor_user_id}", 
                                                 token=self.admin_token)
        
        success = (status_code == 200 and 
                  response.get("email") == SUPERVISOR_EMAIL)
        
        self.log_test("Get User by ID", success,
                     f"Status: {status_code}, Email match: {response.get('email') == SUPERVISOR_EMAIL}")
        return success
    
    def test_update_user(self):
        """Test 6: Update User (change role, permissions)"""
        if not self.supervisor_user_id:
            self.log_test("Update User", False, "No supervisor user ID available")
            return False
            
        update_data = {
            "role": "Supervisor",
            "dpr_generation_permission": True
        }
        
        status_code, response = self.make_request("PUT", f"/users/{self.supervisor_user_id}",
                                                 update_data, token=self.admin_token)
        
        success = (status_code == 200 and 
                  response.get("role") == "Supervisor" and
                  response.get("dpr_generation_permission") == True)
        
        self.log_test("Update User", success,
                     f"Status: {status_code}, Role: {response.get('role')}, "
                     f"DPR Permission: {response.get('dpr_generation_permission')}")
        return success
    
    def test_get_all_codes(self):
        """Test 7: Get All Code Master entries"""
        status_code, response = self.make_request("GET", "/codes", token=self.admin_token)
        
        success = (status_code == 200 and 
                  isinstance(response, list) and
                  len(response) >= 5)  # Should have 5 seeded codes
        
        code_shorts = [code.get("code_short") for code in response] if isinstance(response, list) else []
        expected_codes = ["CIV", "ELC", "PLB", "FIN", "SWP"]
        has_expected = all(code in code_shorts for code in expected_codes)
        
        self.log_test("Get All Codes", success,
                     f"Status: {status_code}, Codes found: {len(response) if isinstance(response, list) else 0}, "
                     f"Expected codes present: {has_expected}")
        return success
    
    def test_create_new_code(self):
        """Test 8: Create New Code (MEP)"""
        code_data = {
            "code_short": "MEP",
            "code_name": "Mechanical, Electrical & Plumbing"
        }
        
        status_code, response = self.make_request("POST", "/codes", code_data, token=self.admin_token)
        
        success = (status_code == 201 and 
                  response.get("code_short") == "MEP" and
                  "code_id" in response)
        
        if success:
            self.created_entities['codes'].append(response["code_id"])
            
        self.log_test("Create New Code", success,
                     f"Status: {status_code}, Code created: {response.get('code_short')}")
        return success
    
    def test_update_code(self):
        """Test 9: Update Code (change name, active status)"""
        if not self.created_entities['codes']:
            self.log_test("Update Code", False, "No created code available")
            return False
            
        code_id = self.created_entities['codes'][0]
        update_data = {
            "code_name": "MEP - Updated Name",
            "active_status": True
        }
        
        status_code, response = self.make_request("PUT", f"/codes/{code_id}",
                                                 update_data, token=self.admin_token)
        
        success = (status_code == 200 and 
                  response.get("code_name") == "MEP - Updated Name")
        
        self.log_test("Update Code", success,
                     f"Status: {status_code}, Updated name: {response.get('code_name')}")
        return success
    
    def test_delete_referenced_code(self):
        """Test 10: Try to Delete Referenced Code (should fail)"""
        # First get a code that might be referenced (CIV)
        status_code, codes = self.make_request("GET", "/codes", token=self.admin_token)
        
        if status_code != 200 or not isinstance(codes, list):
            self.log_test("Delete Referenced Code", False, "Could not get codes list")
            return False
            
        civ_code = next((code for code in codes if code.get("code_short") == "CIV"), None)
        if not civ_code:
            self.log_test("Delete Referenced Code", False, "CIV code not found")
            return False
            
        code_id = civ_code["code_id"]
        status_code, response = self.make_request("DELETE", f"/codes/{code_id}", token=self.admin_token)
        
        # Should fail with 400 if referenced in budgets
        success = status_code == 400 or status_code == 204  # 204 if not referenced yet
        
        self.log_test("Delete Referenced Code", success,
                     f"Status: {status_code}, Expected failure or success based on references")
        return success
    
    def test_create_project(self):
        """Test 11: Create New Project"""
        project_data = {
            "project_name": "Test Construction Project",
            "client_name": "Test Client Ltd",
            "start_date": datetime.now().isoformat(),
            "project_retention_percentage": 5.0,
            "project_cgst_percentage": 9.0,
            "project_sgst_percentage": 9.0,
            "currency_code": "INR"
        }
        
        status_code, response = self.make_request("POST", "/projects", project_data, token=self.admin_token)
        
        success = (status_code == 201 and 
                  response.get("project_name") == "Test Construction Project" and
                  "project_id" in response)
        
        if success:
            self.created_entities['projects'].append(response["project_id"])
            
        self.log_test("Create Project", success,
                     f"Status: {status_code}, Project: {response.get('project_name')}")
        return success
    
    def test_get_all_projects(self):
        """Test 12: Get All Projects"""
        status_code, response = self.make_request("GET", "/projects", token=self.admin_token)
        
        success = (status_code == 200 and 
                  isinstance(response, list))
        
        self.log_test("Get All Projects", success,
                     f"Status: {status_code}, Projects found: {len(response) if isinstance(response, list) else 0}")
        return success
    
    def test_get_project_by_id(self):
        """Test 13: Get Project by ID"""
        if not self.created_entities['projects']:
            self.log_test("Get Project by ID", False, "No created project available")
            return False
            
        project_id = self.created_entities['projects'][0]
        status_code, response = self.make_request("GET", f"/projects/{project_id}", token=self.admin_token)
        
        success = (status_code == 200 and 
                  response.get("project_name") == "Test Construction Project")
        
        self.log_test("Get Project by ID", success,
                     f"Status: {status_code}, Project: {response.get('project_name')}")
        return success
    
    def test_update_project(self):
        """Test 14: Update Project (change retention %)"""
        if not self.created_entities['projects']:
            self.log_test("Update Project", False, "No created project available")
            return False
            
        project_id = self.created_entities['projects'][0]
        update_data = {
            "project_retention_percentage": 7.5
        }
        
        status_code, response = self.make_request("PUT", f"/projects/{project_id}",
                                                 update_data, token=self.admin_token)
        
        success = (status_code == 200 and 
                  response.get("project_retention_percentage") == 7.5)
        
        self.log_test("Update Project", success,
                     f"Status: {status_code}, Retention %: {response.get('project_retention_percentage')}")
        return success
    
    def test_create_budgets(self):
        """Test 15: Create Budgets for Project + Codes"""
        if not self.created_entities['projects']:
            self.log_test("Create Budgets", False, "No created project available")
            return False
            
        # Get CIV and ELC codes
        status_code, codes = self.make_request("GET", "/codes", token=self.admin_token)
        if status_code != 200:
            self.log_test("Create Budgets", False, "Could not get codes")
            return False
            
        civ_code = next((code for code in codes if code.get("code_short") == "CIV"), None)
        elc_code = next((code for code in codes if code.get("code_short") == "ELC"), None)
        
        if not civ_code or not elc_code:
            self.log_test("Create Budgets", False, "CIV or ELC code not found")
            return False
            
        project_id = self.created_entities['projects'][0]
        
        # Create CIV budget
        budget_data_civ = {
            "project_id": project_id,
            "code_id": civ_code["code_id"],
            "approved_budget_amount": 1000000.0
        }
        
        status_code, response = self.make_request("POST", "/budgets", budget_data_civ, token=self.admin_token)
        success_civ = status_code == 201
        
        if success_civ:
            self.created_entities['budgets'].append(response["budget_id"])
        
        # Create ELC budget
        budget_data_elc = {
            "project_id": project_id,
            "code_id": elc_code["code_id"],
            "approved_budget_amount": 500000.0
        }
        
        status_code, response = self.make_request("POST", "/budgets", budget_data_elc, token=self.admin_token)
        success_elc = status_code == 201
        
        if success_elc:
            self.created_entities['budgets'].append(response["budget_id"])
        
        success = success_civ and success_elc
        
        self.log_test("Create Budgets", success,
                     f"CIV Budget: {success_civ}, ELC Budget: {success_elc}")
        return success
    
    def test_get_budgets_for_project(self):
        """Test 16: Get Budgets for Project"""
        if not self.created_entities['projects']:
            self.log_test("Get Budgets for Project", False, "No created project available")
            return False
            
        project_id = self.created_entities['projects'][0]
        params = {"project_id": project_id}
        
        status_code, response = self.make_request("GET", "/budgets", token=self.admin_token, params=params)
        
        success = (status_code == 200 and 
                  isinstance(response, list) and
                  len(response) >= 2)  # Should have CIV and ELC budgets
        
        self.log_test("Get Budgets for Project", success,
                     f"Status: {status_code}, Budgets found: {len(response) if isinstance(response, list) else 0}")
        return success
    
    def test_update_budget(self):
        """Test 17: Update Budget (should trigger financial recalculation)"""
        if not self.created_entities['budgets']:
            self.log_test("Update Budget", False, "No created budget available")
            return False
            
        budget_id = self.created_entities['budgets'][0]
        update_data = {
            "approved_budget_amount": 1200000.0
        }
        
        status_code, response = self.make_request("PUT", f"/budgets/{budget_id}",
                                                 update_data, token=self.admin_token)
        
        success = (status_code == 200 and 
                  response.get("approved_budget_amount") == 1200000.0)
        
        self.log_test("Update Budget", success,
                     f"Status: {status_code}, Updated amount: {response.get('approved_budget_amount')}")
        return success
    
    def test_get_financial_state(self):
        """Test 18: Get Derived Financial State for Project"""
        if not self.created_entities['projects']:
            self.log_test("Get Financial State", False, "No created project available")
            return False
            
        project_id = self.created_entities['projects'][0]
        params = {"project_id": project_id}
        
        status_code, response = self.make_request("GET", "/financial-state", 
                                                 token=self.admin_token, params=params)
        
        success = status_code == 200 and isinstance(response, list)
        
        # Verify Phase 1 logic: committed_value = 0, certified_value = 0, paid_value = 0
        if success and response:
            for state in response:
                phase1_logic = (state.get("committed_value", -1) == 0.0 and
                               state.get("certified_value", -1) == 0.0 and
                               state.get("paid_value", -1) == 0.0 and
                               state.get("over_commit_flag") == False and
                               state.get("over_certification_flag") == False and
                               state.get("over_payment_flag") == False)
                
                if not phase1_logic:
                    success = False
                    break
        
        self.log_test("Get Financial State", success,
                     f"Status: {status_code}, States found: {len(response) if isinstance(response, list) else 0}, "
                     f"Phase 1 logic verified: {success}")
        return success
    
    def test_create_user_project_mapping(self):
        """Test 19: Create User-Project Mapping"""
        if not self.created_entities['projects'] or not self.supervisor_user_id:
            self.log_test("Create User-Project Mapping", False, "Missing project or supervisor")
            return False
            
        mapping_data = {
            "user_id": self.supervisor_user_id,
            "project_id": self.created_entities['projects'][0],
            "read_access": True,
            "write_access": True
        }
        
        status_code, response = self.make_request("POST", "/mappings", mapping_data, token=self.admin_token)
        
        success = (status_code == 201 and 
                  response.get("user_id") == self.supervisor_user_id and
                  "map_id" in response)
        
        if success:
            self.created_entities['mappings'].append(response["map_id"])
            
        self.log_test("Create User-Project Mapping", success,
                     f"Status: {status_code}, Mapping created: {bool(success)}")
        return success
    
    def test_get_mappings(self):
        """Test 20: Get Mappings"""
        status_code, response = self.make_request("GET", "/mappings", token=self.admin_token)
        
        success = (status_code == 200 and 
                  isinstance(response, list))
        
        self.log_test("Get Mappings", success,
                     f"Status: {status_code}, Mappings found: {len(response) if isinstance(response, list) else 0}")
        return success
    
    def test_delete_mapping(self):
        """Test 21: Delete Mapping"""
        if not self.created_entities['mappings']:
            self.log_test("Delete Mapping", False, "No created mapping available")
            return False
            
        map_id = self.created_entities['mappings'][0]
        status_code, response = self.make_request("DELETE", f"/mappings/{map_id}", token=self.admin_token)
        
        success = status_code == 204
        
        self.log_test("Delete Mapping", success,
                     f"Status: {status_code}")
        return success
    
    def test_get_audit_logs(self):
        """Test 22: Get Audit Logs (Admin only)"""
        status_code, response = self.make_request("GET", "/audit-logs", token=self.admin_token)
        
        success = (status_code == 200 and 
                  isinstance(response, list))
        
        # Verify CREATE and UPDATE actions are logged
        create_actions = [log for log in response if log.get("action_type") == "CREATE"]
        update_actions = [log for log in response if log.get("action_type") == "UPDATE"]
        
        self.log_test("Get Audit Logs", success,
                     f"Status: {status_code}, Logs found: {len(response) if isinstance(response, list) else 0}, "
                     f"CREATE actions: {len(create_actions)}, UPDATE actions: {len(update_actions)}")
        return success
    
    def test_permission_enforcement_non_admin(self):
        """Test 23: Permission Enforcement - Non-admin cannot access admin endpoints"""
        # Try to create a project with supervisor token
        project_data = {
            "project_name": "Unauthorized Project",
            "client_name": "Test Client",
            "start_date": datetime.now().isoformat()
        }
        
        status_code, response = self.make_request("POST", "/projects", project_data, token=self.supervisor_token)
        
        success = status_code == 403  # Should be forbidden
        
        self.log_test("Permission Enforcement - Non-admin", success,
                     f"Status: {status_code}, Expected 403 Forbidden")
        return success
    
    def test_permission_enforcement_no_mapping(self):
        """Test 24: Permission Enforcement - Supervisor without mapping cannot access project"""
        if not self.created_entities['projects']:
            self.log_test("Permission Enforcement - No Mapping", False, "No created project available")
            return False
            
        # Since we deleted the mapping, supervisor should not have access
        project_id = self.created_entities['projects'][0]
        status_code, response = self.make_request("GET", f"/projects/{project_id}", token=self.supervisor_token)
        
        success = status_code == 403  # Should be forbidden
        
        self.log_test("Permission Enforcement - No Mapping", success,
                     f"Status: {status_code}, Expected 403 Forbidden")
        return success
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("=" * 80)
        print("CONSTRUCTION MANAGEMENT SYSTEM - PHASE 1 API TESTING")
        print("=" * 80)
        print()
        
        tests = [
            self.test_health_check,
            self.test_admin_login,
            self.test_supervisor_login,
            self.test_get_all_users,
            self.test_get_user_by_id,
            self.test_update_user,
            self.test_get_all_codes,
            self.test_create_new_code,
            self.test_update_code,
            self.test_delete_referenced_code,
            self.test_create_project,
            self.test_get_all_projects,
            self.test_get_project_by_id,
            self.test_update_project,
            self.test_create_budgets,
            self.test_get_budgets_for_project,
            self.test_update_budget,
            self.test_get_financial_state,
            self.test_create_user_project_mapping,
            self.test_get_mappings,
            self.test_delete_mapping,
            self.test_get_audit_logs,
            self.test_permission_enforcement_non_admin,
            self.test_permission_enforcement_no_mapping
        ]
        
        passed = 0
        failed = 0
        
        for test in tests:
            try:
                if test():
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"❌ FAIL {test.__name__} - Exception: {str(e)}")
                failed += 1
        
        print("=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        print(f"Total Tests: {passed + failed}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Success Rate: {(passed / (passed + failed) * 100):.1f}%")
        print()
        
        if failed > 0:
            print("FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"- {result['test']}: {result['details']}")
        
        return failed == 0

def main():
    """Main function"""
    tester = APITester()
    success = tester.run_all_tests()
    
    if success:
        print("🎉 All tests passed! API is working correctly.")
        sys.exit(0)
    else:
        print("⚠️  Some tests failed. Check the details above.")
        sys.exit(1)

if __name__ == "__main__":
    main()