#!/usr/bin/env python3
"""
PHASE 2 WAVE 1 FINANCIAL CORE HARDENING - COMPREHENSIVE TEST SUITE

Tests all critical scenarios for the hardened financial engine:
1. Health Check & Transaction Support
2. Vendor Creation (prerequisite)
3. Work Order Lifecycle Test
4. Payment Certificate Lifecycle Test
5. Decimal Precision Verification
6. Financial Invariant Test (Over-certification)
7. Payment Recording Test
8. Retention Release Test

Base URL: https://backend-hardening-3.preview.emergentagent.com/api
Admin credentials: admin@example.com / admin123
"""

import requests
import json
from datetime import datetime, timedelta
from decimal import Decimal
import sys
import time

# Configuration
BASE_URL = "https://backend-hardening-3.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        
    def log_pass(self, test_name):
        print(f"✅ PASS: {test_name}")
        self.passed += 1
        
    def log_fail(self, test_name, error):
        print(f"❌ FAIL: {test_name} - {error}")
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY: {self.passed}/{total} PASSED")
        print(f"{'='*60}")
        if self.errors:
            print("FAILURES:")
            for error in self.errors:
                print(f"  - {error}")
        return self.failed == 0

class Phase2TestSuite:
    def __init__(self):
        self.results = TestResults()
        self.session = requests.Session()
        self.admin_token = None
        self.test_data = {}
        
    def make_request(self, method, endpoint, **kwargs):
        """Make HTTP request with proper error handling"""
        url = f"{BASE_URL}{endpoint}"
        
        # Add auth header if token available
        if self.admin_token:
            if 'headers' not in kwargs:
                kwargs['headers'] = {}
            kwargs['headers']['Authorization'] = f"Bearer {self.admin_token}"
        
        try:
            response = self.session.request(method, url, **kwargs)
            return response
        except Exception as e:
            print(f"Request failed: {method} {url} - {str(e)}")
            return None
    
    def test_1_health_check_transaction_support(self):
        """Test 1: Health Check & Transaction Support"""
        print("\n🔍 TEST 1: Health Check & Transaction Support")
        
        try:
            # Test v2 health endpoint
            response = self.make_request('GET', '/v2/health')
            
            if not response or response.status_code != 200:
                self.results.log_fail("Health Check", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            
            # Verify required fields
            required_fields = ['status', 'timestamp', 'version', 'phase', 'features']
            for field in required_fields:
                if field not in data:
                    self.results.log_fail("Health Check", f"Missing field: {field}")
                    return
            
            # Verify transaction support
            features = data.get('features', {})
            if not features.get('transaction_support'):
                self.results.log_fail("Health Check", "Transaction support not enabled")
                return
            
            # Verify all 5 hardening features
            expected_features = [
                'decimal_precision',
                'transaction_support', 
                'invariant_enforcement',
                'duplicate_protection',
                'atomic_numbering'
            ]
            
            for feature in expected_features:
                if not features.get(feature):
                    self.results.log_fail("Health Check", f"Feature not enabled: {feature}")
                    return
            
            self.results.log_pass("Health Check - All 5 features enabled with transaction support")
            
        except Exception as e:
            self.results.log_fail("Health Check", f"Exception: {str(e)}")
    
    def test_2_admin_login(self):
        """Test 2: Admin Authentication"""
        print("\n🔍 TEST 2: Admin Authentication")
        
        try:
            login_data = {
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            }
            
            response = self.make_request('POST', '/auth/login', json=login_data)
            
            if not response or response.status_code != 200:
                self.results.log_fail("Admin Login", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            
            if 'access_token' not in data:
                self.results.log_fail("Admin Login", "No access token in response")
                return
            
            self.admin_token = data['access_token']
            self.results.log_pass("Admin Login - Token obtained")
            
        except Exception as e:
            self.results.log_fail("Admin Login", f"Exception: {str(e)}")
    
    def test_3_vendor_creation(self):
        """Test 3: Vendor Creation (prerequisite)"""
        print("\n🔍 TEST 3: Vendor Creation")
        
        try:
            vendor_data = {
                "vendor_name": "Test Vendor Corp",
                "vendor_code": "V001",
                "contact_person": "John Doe",
                "email": "john@testvendor.com",
                "phone": "+1234567890"
            }
            
            response = self.make_request('POST', '/v2/vendors', json=vendor_data)
            
            if not response or response.status_code != 201:
                self.results.log_fail("Vendor Creation", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            
            if 'vendor_id' not in data:
                self.results.log_fail("Vendor Creation", "No vendor_id in response")
                return
            
            self.test_data['vendor_id'] = data['vendor_id']
            self.results.log_pass("Vendor Creation - V001 created successfully")
            
        except Exception as e:
            self.results.log_fail("Vendor Creation", f"Exception: {str(e)}")
    
    def test_4_create_project_and_code(self):
        """Test 4: Create Project and Code (prerequisites)"""
        print("\n🔍 TEST 4: Create Project and Code")
        
        try:
            # Create project
            project_data = {
                "project_name": "Phase 2 Test Project",
                "client_name": "Test Client Corp",
                "start_date": datetime.utcnow().isoformat(),
                "project_retention_percentage": 10.0,
                "project_cgst_percentage": 9.0,
                "project_sgst_percentage": 9.0
            }
            
            response = self.make_request('POST', '/projects', json=project_data)
            
            if not response or response.status_code != 201:
                self.results.log_fail("Project Creation", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            self.test_data['project_id'] = data['project_id']
            
            # Create code
            code_data = {
                "code_short": "TEST001",
                "code_name": "Test Code for Financial Hardening"
            }
            
            response = self.make_request('POST', '/codes', json=code_data)
            
            if not response or response.status_code != 201:
                self.results.log_fail("Code Creation", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            self.test_data['code_id'] = data['code_id']
            
            # Create budget
            budget_data = {
                "project_id": self.test_data['project_id'],
                "code_id": self.test_data['code_id'],
                "approved_budget_amount": 100.0  # Small budget for over-certification test
            }
            
            response = self.make_request('POST', '/budgets', json=budget_data)
            
            if not response or response.status_code != 201:
                self.results.log_fail("Budget Creation", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            self.test_data['budget_id'] = data['budget_id']
            
            self.results.log_pass("Project, Code, and Budget Creation - All prerequisites created")
            
        except Exception as e:
            self.results.log_fail("Prerequisites Creation", f"Exception: {str(e)}")
    
    def test_5_work_order_lifecycle(self):
        """Test 5: Work Order Lifecycle Test"""
        print("\n🔍 TEST 5: Work Order Lifecycle Test")
        
        try:
            # Create draft WO
            wo_data = {
                "project_id": self.test_data['project_id'],
                "code_id": self.test_data['code_id'],
                "vendor_id": self.test_data['vendor_id'],
                "prefix": "WO",
                "issue_date": datetime.utcnow().isoformat(),
                "rate": 10.333,  # Test decimal precision
                "quantity": 3,
                "retention_percentage": 10.0
            }
            
            response = self.make_request('POST', '/v2/work-orders', json=wo_data)
            
            if not response or response.status_code != 201:
                self.results.log_fail("WO Creation", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            wo_id = data['wo_id']
            
            # Verify decimal precision (10.333 * 3 = 30.999, should round to 31.00)
            expected_base_amount = 31.00  # 10.333 * 3 rounded
            if abs(data['base_amount'] - expected_base_amount) > 0.01:
                self.results.log_fail("WO Decimal Precision", f"Expected {expected_base_amount}, got {data['base_amount']}")
                return
            
            # Verify draft status
            if data['status'] != 'Draft':
                self.results.log_fail("WO Draft Status", f"Expected Draft, got {data['status']}")
                return
            
            if data['document_number'] != 'DRAFT':
                self.results.log_fail("WO Draft Number", f"Expected DRAFT, got {data['document_number']}")
                return
            
            # Issue the WO
            response = self.make_request('POST', f'/v2/work-orders/{wo_id}/issue')
            
            if not response or response.status_code != 200:
                self.results.log_fail("WO Issue", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            
            # Verify atomic document number assigned
            if not data['document_number'].startswith('WO-'):
                self.results.log_fail("WO Atomic Numbering", f"Expected WO-XXXXXX, got {data['document_number']}")
                return
            
            if data['status'] != 'Issued':
                self.results.log_fail("WO Issue Status", f"Expected Issued, got {data['status']}")
                return
            
            self.test_data['wo_id'] = wo_id
            self.results.log_pass("Work Order Lifecycle - Draft created, issued with atomic numbering")
            
        except Exception as e:
            self.results.log_fail("Work Order Lifecycle", f"Exception: {str(e)}")
    
    def test_6_payment_certificate_lifecycle(self):
        """Test 6: Payment Certificate Lifecycle Test"""
        print("\n🔍 TEST 6: Payment Certificate Lifecycle Test")
        
        try:
            # Create draft PC
            pc_data = {
                "project_id": self.test_data['project_id'],
                "code_id": self.test_data['code_id'],
                "vendor_id": self.test_data['vendor_id'],
                "prefix": "PC",
                "bill_date": datetime.utcnow().isoformat(),
                "current_bill_amount": 25.0,
                "retention_percentage": 10.0
            }
            
            response = self.make_request('POST', '/v2/payment-certificates', json=pc_data)
            
            if not response or response.status_code != 201:
                self.results.log_fail("PC Creation", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            pc_id = data['pc_id']
            
            # Verify draft status
            if data['status'] != 'Draft':
                self.results.log_fail("PC Draft Status", f"Expected Draft, got {data['status']}")
                return
            
            # Certify the PC with invoice number
            invoice_number = f"INV-{int(time.time())}"
            response = self.make_request('POST', f'/v2/payment-certificates/{pc_id}/certify', 
                                       params={'invoice_number': invoice_number})
            
            if not response or response.status_code != 200:
                self.results.log_fail("PC Certification", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            
            # Verify atomic document number assigned
            if not data['document_number'].startswith('PC-'):
                self.results.log_fail("PC Atomic Numbering", f"Expected PC-XXXXXX, got {data['document_number']}")
                return
            
            if data['status'] != 'Certified':
                self.results.log_fail("PC Certification Status", f"Expected Certified, got {data['status']}")
                return
            
            self.test_data['pc_id'] = pc_id
            self.test_data['invoice_number'] = invoice_number
            
            self.results.log_pass("Payment Certificate Lifecycle - Draft created, certified with atomic numbering")
            
        except Exception as e:
            self.results.log_fail("Payment Certificate Lifecycle", f"Exception: {str(e)}")
    
    def test_7_duplicate_invoice_protection(self):
        """Test 7: Duplicate Invoice Protection"""
        print("\n🔍 TEST 7: Duplicate Invoice Protection")
        
        try:
            # Create another PC with same invoice number
            pc_data = {
                "project_id": self.test_data['project_id'],
                "code_id": self.test_data['code_id'],
                "vendor_id": self.test_data['vendor_id'],
                "prefix": "PC",
                "bill_date": datetime.utcnow().isoformat(),
                "current_bill_amount": 15.0,
                "retention_percentage": 10.0
            }
            
            response = self.make_request('POST', '/v2/payment-certificates', json=pc_data)
            
            if not response or response.status_code != 201:
                self.results.log_fail("Duplicate PC Creation", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            duplicate_pc_id = data['pc_id']
            
            # Try to certify with same invoice number - should FAIL
            response = self.make_request('POST', f'/v2/payment-certificates/{duplicate_pc_id}/certify',
                                       params={'invoice_number': self.test_data['invoice_number']})
            
            if response and response.status_code == 400:
                error_data = response.json()
                if 'duplicate' in error_data.get('detail', '').lower():
                    self.results.log_pass("Duplicate Invoice Protection - Correctly blocked duplicate invoice")
                else:
                    self.results.log_fail("Duplicate Invoice Protection", f"Wrong error message: {error_data.get('detail')}")
            else:
                self.results.log_fail("Duplicate Invoice Protection", f"Expected 400 error, got {response.status_code if response else 'No response'}")
            
        except Exception as e:
            self.results.log_fail("Duplicate Invoice Protection", f"Exception: {str(e)}")
    
    def test_8_financial_invariant_over_certification(self):
        """Test 8: Financial Invariant Test (Over-certification)"""
        print("\n🔍 TEST 8: Financial Invariant Test (Over-certification)")
        
        try:
            # Create PC with amount greater than budget (budget is 100, try 200)
            pc_data = {
                "project_id": self.test_data['project_id'],
                "code_id": self.test_data['code_id'],
                "vendor_id": self.test_data['vendor_id'],
                "prefix": "PC",
                "bill_date": datetime.utcnow().isoformat(),
                "current_bill_amount": 200.0,  # Exceeds budget of 100
                "retention_percentage": 10.0
            }
            
            response = self.make_request('POST', '/v2/payment-certificates', json=pc_data)
            
            if not response or response.status_code != 201:
                self.results.log_fail("Over-cert PC Creation", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            over_cert_pc_id = data['pc_id']
            
            # Try to certify - should FAIL due to invariant violation
            response = self.make_request('POST', f'/v2/payment-certificates/{over_cert_pc_id}/certify')
            
            if response and response.status_code == 400:
                error_data = response.json()
                if 'invariant' in error_data.get('detail', '').lower():
                    self.results.log_pass("Financial Invariant - Correctly blocked over-certification")
                else:
                    self.results.log_fail("Financial Invariant", f"Wrong error message: {error_data.get('detail')}")
            else:
                self.results.log_fail("Financial Invariant", f"Expected 400 error, got {response.status_code if response else 'No response'}")
            
        except Exception as e:
            self.results.log_fail("Financial Invariant", f"Exception: {str(e)}")
    
    def test_9_payment_recording(self):
        """Test 9: Payment Recording Test"""
        print("\n🔍 TEST 9: Payment Recording Test")
        
        try:
            # Get the certified PC details first
            response = self.make_request('GET', f'/v2/payment-certificates/{self.test_data["pc_id"]}')
            
            if not response or response.status_code != 200:
                self.results.log_fail("Get PC for Payment", f"Status: {response.status_code if response else 'No response'}")
                return
            
            pc_data = response.json()
            net_payable = pc_data.get('net_payable', 0)
            
            # Record valid payment
            payment_data = {
                "pc_id": self.test_data['pc_id'],
                "payment_amount": net_payable * 0.5,  # Pay 50%
                "payment_date": datetime.utcnow().isoformat(),
                "payment_reference": "TEST-PAY-001"
            }
            
            response = self.make_request('POST', '/v2/payments', json=payment_data)
            
            if not response or response.status_code != 201:
                self.results.log_fail("Payment Recording", f"Status: {response.status_code if response else 'No response'}")
                return
            
            data = response.json()
            payment_id = data['payment_id']
            
            # Try to overpay - should FAIL
            overpay_data = {
                "pc_id": self.test_data['pc_id'],
                "payment_amount": net_payable,  # This would exceed remaining amount
                "payment_date": datetime.utcnow().isoformat(),
                "payment_reference": "TEST-OVERPAY-001"
            }
            
            response = self.make_request('POST', '/v2/payments', json=overpay_data)
            
            if response and response.status_code == 400:
                error_data = response.json()
                if 'exceed' in error_data.get('detail', '').lower():
                    self.results.log_pass("Payment Recording - Valid payment recorded, overpayment blocked")
                else:
                    self.results.log_fail("Payment Recording", f"Wrong overpay error: {error_data.get('detail')}")
            else:
                self.results.log_fail("Payment Recording", f"Expected 400 for overpay, got {response.status_code if response else 'No response'}")
            
        except Exception as e:
            self.results.log_fail("Payment Recording", f"Exception: {str(e)}")
    
    def test_10_retention_release(self):
        """Test 10: Retention Release Test"""
        print("\n🔍 TEST 10: Retention Release Test")
        
        try:
            # Get current financial state to see retention held
            response = self.make_request('GET', f'/v2/financial-state/{self.test_data["project_id"]}',
                                       params={'code_id': self.test_data['code_id']})
            
            if not response or response.status_code != 200:
                self.results.log_fail("Get Financial State", f"Status: {response.status_code if response else 'No response'}")
                return
            
            states = response.json()
            if not states:
                self.results.log_fail("Get Financial State", "No financial state found")
                return
            
            retention_held = states[0].get('retention_held', 0)
            
            if retention_held <= 0:
                self.results.log_fail("Retention Release", f"No retention to release: {retention_held}")
                return
            
            # Try to release more than held - should FAIL
            over_release_data = {
                "project_id": self.test_data['project_id'],
                "code_id": self.test_data['code_id'],
                "vendor_id": self.test_data['vendor_id'],
                "release_amount": retention_held + 10.0,  # More than available
                "release_date": datetime.utcnow().isoformat()
            }
            
            response = self.make_request('POST', '/v2/retention-releases', json=over_release_data)
            
            if response and response.status_code == 400:
                error_data = response.json()
                if 'exceed' in error_data.get('detail', '').lower():
                    self.results.log_pass("Retention Release - Correctly blocked over-release")
                else:
                    self.results.log_fail("Retention Release", f"Wrong error message: {error_data.get('detail')}")
            else:
                self.results.log_fail("Retention Release", f"Expected 400 error, got {response.status_code if response else 'No response'}")
            
            # Valid release
            valid_release_data = {
                "project_id": self.test_data['project_id'],
                "code_id": self.test_data['code_id'],
                "vendor_id": self.test_data['vendor_id'],
                "release_amount": retention_held * 0.5,  # Release 50%
                "release_date": datetime.utcnow().isoformat()
            }
            
            response = self.make_request('POST', '/v2/retention-releases', json=valid_release_data)
            
            if response and response.status_code == 201:
                self.results.log_pass("Retention Release - Valid release processed successfully")
            else:
                self.results.log_fail("Retention Release", f"Valid release failed: {response.status_code if response else 'No response'}")
            
        except Exception as e:
            self.results.log_fail("Retention Release", f"Exception: {str(e)}")
    
    def run_all_tests(self):
        """Run all Phase 2 Wave 1 tests"""
        print("🚀 STARTING PHASE 2 WAVE 1 FINANCIAL CORE HARDENING TESTS")
        print(f"Base URL: {BASE_URL}")
        print(f"Admin: {ADMIN_EMAIL}")
        
        # Run tests in sequence
        self.test_1_health_check_transaction_support()
        self.test_2_admin_login()
        
        if not self.admin_token:
            print("❌ Cannot continue without admin token")
            return False
        
        self.test_3_vendor_creation()
        self.test_4_create_project_and_code()
        self.test_5_work_order_lifecycle()
        self.test_6_payment_certificate_lifecycle()
        self.test_7_duplicate_invoice_protection()
        self.test_8_financial_invariant_over_certification()
        self.test_9_payment_recording()
        self.test_10_retention_release()
        
        return self.results.summary()

def main():
    """Main test execution"""
    suite = Phase2TestSuite()
    success = suite.run_all_tests()
    
    if success:
        print("\n🎉 ALL TESTS PASSED - Phase 2 Wave 1 Financial Core Hardening is working correctly!")
        sys.exit(0)
    else:
        print("\n💥 SOME TESTS FAILED - Check the failures above")
        sys.exit(1)

if __name__ == "__main__":
    main()