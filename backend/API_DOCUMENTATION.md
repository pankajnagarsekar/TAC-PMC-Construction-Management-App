# Phase 1 Construction Management System - API Documentation

## 🏗️ System Overview

**Phase 1 Foundation** - Enterprise Construction Management System

This is a **locked architecture** system with deterministic financial calculations. Future phases (2-4) depend on this exact schema.

### Key Features:
- ✅ JWT-based authentication
- ✅ Role-based access control (Admin, Supervisor, Other)
- ✅ Organisation-level data isolation
- ✅ User-Project mapping for access control
- ✅ Transaction-safe financial recalculation
- ✅ Immutable audit logging
- ✅ UTC timezone for all operations

---

## 🔐 Authentication

### Register User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword",
  "role": "Supervisor",
  "dpr_generation_permission": false
}

Response: 201 Created
{
  "user_id": "...",
  "organisation_id": "...",
  "name": "John Doe",
  "email": "john@example.com",
  "role": "Supervisor",
  "active_status": true,
  "dpr_generation_permission": false,
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z"
}
```

### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "admin123"
}

Response: 200 OK
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "user": {
    "user_id": "...",
    "organisation_id": "...",
    "name": "System Administrator",
    "email": "admin@example.com",
    "role": "Admin",
    "active_status": true,
    "dpr_generation_permission": true,
    "created_at": "...",
    "updated_at": "..."
  }
}
```

**Use token in all subsequent requests:**
```bash
Authorization: Bearer <access_token>
```

---

## 👥 User Management

### Get All Users
```bash
GET /api/users
Authorization: Bearer <token>

Response: 200 OK
[
  {
    "user_id": "...",
    "organisation_id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "Supervisor",
    "active_status": true,
    "dpr_generation_permission": false,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

### Get User by ID
```bash
GET /api/users/{user_id}
Authorization: Bearer <token>
```

### Update User (Admin Only)
```bash
PUT /api/users/{user_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Updated",
  "role": "Admin",
  "active_status": true,
  "dpr_generation_permission": true
}
```

---

## 🏗️ Project Management

### Create Project (Admin Only)
```bash
POST /api/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_name": "City Tower Construction",
  "client_name": "ABC Developers",
  "start_date": "2025-01-01T00:00:00Z",
  "end_date": "2025-12-31T23:59:59Z",
  "dpr_enforcement_enabled": true,
  "project_retention_percentage": 5.0,
  "project_cgst_percentage": 9.0,
  "project_sgst_percentage": 9.0,
  "currency_code": "INR"
}

Response: 201 Created
{
  "project_id": "...",
  "organisation_id": "...",
  "project_name": "City Tower Construction",
  ...
}
```

### Get All Projects
```bash
GET /api/projects
Authorization: Bearer <token>

# Admin: sees all projects in organisation
# Others: sees only mapped projects
```

### Get Project by ID
```bash
GET /api/projects/{project_id}
Authorization: Bearer <token>
```

### Update Project (Admin Only)
```bash
PUT /api/projects/{project_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_name": "Updated Name",
  "project_retention_percentage": 10.0
}

# Note: Updating retention/GST triggers financial recalculation
```

---

## 🏷️ Code Master

### Create Code (Admin Only)
```bash
POST /api/codes
Authorization: Bearer <token>
Content-Type: application/json

{
  "code_short": "MEP",
  "code_name": "Mechanical, Electrical & Plumbing"
}

Response: 201 Created
{
  "code_id": "...",
  "code_short": "MEP",
  "code_name": "Mechanical, Electrical & Plumbing",
  "active_status": true,
  "created_at": "...",
  "updated_at": "..."
}
```

### Get All Codes
```bash
GET /api/codes?active_only=true
Authorization: Bearer <token>
```

### Update Code (Admin Only)
```bash
PUT /api/codes/{code_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "code_name": "Updated Name",
  "active_status": false
}
```

### Delete Code (Admin Only)
```bash
DELETE /api/codes/{code_id}
Authorization: Bearer <token>

# RULE: Cannot delete if referenced in budgets
# Must set active_status=false instead
```

---

## 💰 Budget Management

### Create Budget (Admin Only)
```bash
POST /api/budgets
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_id": "...",
  "code_id": "...",
  "approved_budget_amount": 1000000.00
}

# TRIGGERS: Financial recalculation for this project+code

Response: 201 Created
{
  "budget_id": "...",
  "project_id": "...",
  "code_id": "...",
  "approved_budget_amount": 1000000.00,
  "created_at": "...",
  "updated_at": "..."
}
```

### Get Budgets
```bash
GET /api/budgets?project_id=...
Authorization: Bearer <token>
```

### Update Budget (Admin Only)
```bash
PUT /api/budgets/{budget_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "approved_budget_amount": 1500000.00
}

# TRIGGERS: Financial recalculation
# Must be >= 0
# Audited automatically
```

---

## 📊 Derived Financial State

### Get Financial State
```bash
GET /api/financial-state?project_id=...&code_id=...
Authorization: Bearer <token>

Response: 200 OK
[
  {
    "state_id": "...",
    "project_id": "...",
    "code_id": "...",
    "committed_value": 0.0,
    "certified_value": 0.0,
    "paid_value": 0.0,
    "retention_held": 0.0,
    "balance_budget_remaining": 1000000.0,
    "balance_to_pay": 0.0,
    "over_commit_flag": false,
    "over_certification_flag": false,
    "over_payment_flag": false,
    "last_recalculated_at": "..."
  }
]

# Phase 1: All transaction values are zero (no WO/PC yet)
# balance_budget_remaining = approved_budget - committed_value
```

---

## 🔗 User-Project Mapping

### Create Mapping (Admin Only)
```bash
POST /api/mappings
Authorization: Bearer <token>
Content-Type: application/json

{
  "user_id": "...",
  "project_id": "...",
  "role_override": null,
  "read_access": true,
  "write_access": true
}

# RULE: User cannot access project without mapping
# Admin has automatic access to all projects
```

### Get Mappings
```bash
GET /api/mappings?user_id=...&project_id=...
Authorization: Bearer <token>
```

### Delete Mapping (Admin Only)
```bash
DELETE /api/mappings/{map_id}
Authorization: Bearer <token>
```

---

## 📝 Audit Logs

### Get Audit Logs (Admin Only)
```bash
GET /api/audit-logs?entity_type=PROJECT&limit=100
Authorization: Bearer <token>

Response: 200 OK
[
  {
    "audit_id": "...",
    "organisation_id": "...",
    "project_id": "...",
    "module_name": "PROJECT_MANAGEMENT",
    "entity_type": "PROJECT",
    "entity_id": "...",
    "action_type": "CREATE",
    "old_value_json": null,
    "new_value_json": {"project_name": "..."},
    "user_id": "...",
    "timestamp": "2025-01-15T10:00:00Z"
  }
]

# IMMUTABLE: INSERT only, no UPDATE/DELETE
# All state changes are logged
# UTC timestamps
```

---

## 🏥 Health Check

### Check API Health
```bash
GET /api/health

Response: 200 OK
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:00:00Z",
  "version": "1.0.0",
  "phase": "Phase 1 - Foundation"
}
```

---

## 🔒 Permission Rules

### Role Permissions:

**Admin:**
- Full read/write access
- Can modify global settings
- Can lock/unlock financial documents
- Can view audit logs
- Automatic access to all projects

**Supervisor:**
- Must have user_project_map entry
- Cannot edit financial documents
- Cannot generate DPR unless permission flag enabled
- Must mark attendance before actions (enforced in Phase 2+)

**Other:**
- No default write access
- Must have explicit mapping with write_access=true

### API Validation Flow:
1. Check JWT token validity
2. Check user active_status = TRUE
3. Check user_project_map exists (for project endpoints)
4. Check required permission based on role
5. Verify organisation_id match

---

## 🧮 Financial Recalculation

### Triggers:
- Budget creation
- Budget update
- Project retention/GST update (Phase 1 logic)

### Phase 1 Calculations:
```
committed_value = 0 (no Work Orders)
certified_value = 0 (no Payment Certificates)
paid_value = 0 (no Payments)
retention_held = 0

balance_budget_remaining = approved_budget - committed_value
balance_to_pay = certified_value - paid_value

over_commit_flag = committed_value > approved_budget
over_certification_flag = certified_value > committed_value
over_payment_flag = paid_value > certified_value
```

### Transaction Safety:
- All recalculations run inside MongoDB transaction
- Rollback on failure
- Audit entry created after commit

---

## 🚀 Getting Started

### 1. Run Seed Script
```bash
cd /app/backend
python seed.py
```

**Default Credentials:**
- Email: `admin@example.com`
- Password: `admin123`
- ⚠️ Change after first login!

### 2. Access API Documentation
```
http://localhost:8001/docs
```

### 3. Test Authentication
```bash
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'
```

### 4. Use Token
```bash
TOKEN="<your_token_here>"

curl -X GET http://localhost:8001/api/users \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📋 Seeded Data

After running seed.py:

✅ **1 Organisation:** "Default Organisation"
✅ **1 Admin User:** admin@example.com / admin123
✅ **Global Settings:** Currency = INR
✅ **5 Code Master Entries:**
   - CIV: Civil Works
   - ELC: Electrical Works
   - PLB: Plumbing Works
   - FIN: Finishing Works
   - SWP: Site Work and Preparation

---

## 🏗️ Architecture Notes

### LOCKED DESIGN:
- DO NOT modify schema structure
- DO NOT simplify financial formulas
- DO NOT merge entities
- DO NOT remove audit logging
- Future phases depend on this foundation

### Single Organisation Mode:
- Phase 1 operates under ONE organisation
- All queries filter by organisation_id
- Future phases will support multi-organisation

### Time Authority:
- Server time (UTC) is authoritative
- Device time ignored
- All timestamps use UTC

### Extensibility:
- Ready for Phase 2 (Work Orders, Payment Certificates)
- Ready for Phase 3 (DPR, Progress Tracking)
- Ready for Phase 4 (Reports, Offline Support)

---

## 📚 API Testing Examples

See `/app/backend/test_api.sh` for comprehensive curl examples.

---

## 🔧 Technical Stack

- **Framework:** FastAPI 0.110.1
- **Database:** MongoDB (Motor async driver)
- **Authentication:** JWT (PyJWT)
- **Password Hashing:** bcrypt
- **Validation:** Pydantic v2

---

## 📞 Support

For issues or questions about Phase 1 architecture, refer to the app description document.

**Remember:** This is a deterministic financial system. Architecture is locked for future phase compatibility.
