#!/bin/bash

# Phase 1 Construction Management System - Comprehensive API Test Script

BASE_URL="http://localhost:8001/api"
echo "🧪 Testing Phase 1 Construction Management System API"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to test endpoint
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local headers=$5
    
    echo -e "${YELLOW}Testing:${NC} $name"
    
    if [ -z "$data" ]; then
        response=$(curl -s -X $method "$BASE_URL$endpoint" $headers)
    else
        response=$(curl -s -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            $headers \
            -d "$data")
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        echo "Response: $response" | head -c 200
        echo ""
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

# 1. Health Check
echo "=== 1. HEALTH CHECK ==="
test_endpoint "Health Check" "GET" "/health"

# 2. Authentication
echo "=== 2. AUTHENTICATION ==="
test_endpoint "Login Admin" "POST" "/auth/login" \
    '{"email":"admin@example.com","password":"admin123"}'

# Extract token
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com","password":"admin123"}' | \
    python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

echo "🔑 Token obtained: ${TOKEN:0:50}..."
echo ""

AUTH_HEADER="-H \"Authorization: Bearer $TOKEN\""

# 3. Register New User
echo "=== 3. USER MANAGEMENT ==="
test_endpoint "Register Supervisor" "POST" "/auth/register" \
    '{"name":"Site Supervisor","email":"supervisor@example.com","password":"super123","role":"Supervisor"}'

test_endpoint "Get All Users" "GET" "/users" "" "$AUTH_HEADER"

# 4. Get Codes
echo "=== 4. CODE MASTER ==="
test_endpoint "Get All Codes" "GET" "/codes?active_only=true" "" "$AUTH_HEADER"

test_endpoint "Create New Code" "POST" "/codes" \
    '{"code_short":"MEP","code_name":"Mechanical, Electrical & Plumbing"}' \
    "$AUTH_HEADER"

# 5. Create Project
echo "=== 5. PROJECT MANAGEMENT ==="
test_endpoint "Create Project" "POST" "/projects" \
    '{"project_name":"City Tower Construction","client_name":"ABC Developers","start_date":"2025-01-01T00:00:00Z","end_date":"2025-12-31T23:59:59Z","dpr_enforcement_enabled":true,"project_retention_percentage":5.0,"project_cgst_percentage":9.0,"project_sgst_percentage":9.0,"currency_code":"INR"}' \
    "$AUTH_HEADER"

# Get project ID
PROJECT_ID=$(curl -s -X GET "$BASE_URL/projects" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data[0]['project_id'] if len(data) > 0 else '')")

echo "📊 Project ID: $PROJECT_ID"
echo ""

test_endpoint "Get All Projects" "GET" "/projects" "" "$AUTH_HEADER"

if [ ! -z "$PROJECT_ID" ]; then
    test_endpoint "Get Project by ID" "GET" "/projects/$PROJECT_ID" "" "$AUTH_HEADER"
fi

# 6. Create Budgets
echo "=== 6. BUDGET MANAGEMENT ==="

# Get code IDs
CODE_CIV=$(curl -s -X GET "$BASE_URL/codes" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys, json; codes=json.load(sys.stdin); print([c['code_id'] for c in codes if c['code_short']=='CIV'][0] if codes else '')")

CODE_ELC=$(curl -s -X GET "$BASE_URL/codes" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys, json; codes=json.load(sys.stdin); print([c['code_id'] for c in codes if c['code_short']=='ELC'][0] if codes else '')")

echo "🏷️  Code CIV: $CODE_CIV"
echo "🏷️  Code ELC: $CODE_ELC"
echo ""

if [ ! -z "$PROJECT_ID" ] && [ ! -z "$CODE_CIV" ]; then
    test_endpoint "Create Budget for CIV" "POST" "/budgets" \
        "{\"project_id\":\"$PROJECT_ID\",\"code_id\":\"$CODE_CIV\",\"approved_budget_amount\":1000000.00}" \
        "$AUTH_HEADER"
fi

if [ ! -z "$PROJECT_ID" ] && [ ! -z "$CODE_ELC" ]; then
    test_endpoint "Create Budget for ELC" "POST" "/budgets" \
        "{\"project_id\":\"$PROJECT_ID\",\"code_id\":\"$CODE_ELC\",\"approved_budget_amount\":500000.00}" \
        "$AUTH_HEADER"
fi

if [ ! -z "$PROJECT_ID" ]; then
    test_endpoint "Get Budgets for Project" "GET" "/budgets?project_id=$PROJECT_ID" "" "$AUTH_HEADER"
fi

# 7. Financial State
echo "=== 7. DERIVED FINANCIAL STATE ==="
if [ ! -z "$PROJECT_ID" ]; then
    test_endpoint "Get Financial State" "GET" "/financial-state?project_id=$PROJECT_ID" "" "$AUTH_HEADER"
fi

# 8. User-Project Mapping
echo "=== 8. USER-PROJECT MAPPING ==="

# Get supervisor ID
SUPERVISOR_ID=$(curl -s -X GET "$BASE_URL/users" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys, json; users=json.load(sys.stdin); print([u['user_id'] for u in users if u['email']=='supervisor@example.com'][0] if users else '')" 2>/dev/null || echo "")

echo "👤 Supervisor ID: $SUPERVISOR_ID"
echo ""

if [ ! -z "$PROJECT_ID" ] && [ ! -z "$SUPERVISOR_ID" ]; then
    test_endpoint "Create User-Project Mapping" "POST" "/mappings" \
        "{\"user_id\":\"$SUPERVISOR_ID\",\"project_id\":\"$PROJECT_ID\",\"read_access\":true,\"write_access\":true}" \
        "$AUTH_HEADER"
    
    test_endpoint "Get Mappings" "GET" "/mappings?project_id=$PROJECT_ID" "" "$AUTH_HEADER"
fi

# 9. Audit Logs
echo "=== 9. AUDIT LOGS ==="
test_endpoint "Get Audit Logs" "GET" "/audit-logs?limit=10" "" "$AUTH_HEADER"

# 10. Update Operations
echo "=== 10. UPDATE OPERATIONS ==="

# Get budget ID
BUDGET_ID=$(curl -s -X GET "$BASE_URL/budgets?project_id=$PROJECT_ID" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys, json; budgets=json.load(sys.stdin); print(budgets[0]['budget_id'] if len(budgets) > 0 else '')" 2>/dev/null || echo "")

echo "💰 Budget ID: $BUDGET_ID"
echo ""

if [ ! -z "$BUDGET_ID" ]; then
    test_endpoint "Update Budget (triggers recalculation)" "PUT" "/budgets/$BUDGET_ID" \
        '{"approved_budget_amount":1200000.00}' \
        "$AUTH_HEADER"
fi

if [ ! -z "$PROJECT_ID" ]; then
    test_endpoint "Update Project" "PUT" "/projects/$PROJECT_ID" \
        '{"project_retention_percentage":10.0}' \
        "$AUTH_HEADER"
fi

# Summary
echo ""
echo "=================================================="
echo "🧪 TEST SUMMARY"
echo "=================================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo "=================================================="
