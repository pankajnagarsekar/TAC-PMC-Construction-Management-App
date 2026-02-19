# SiteMaster - Construction Management System

## Original Problem Statement
Build a comprehensive Construction Management System (SiteMaster) for supervisors and administrators to manage construction projects, daily progress reports (DPR), and worker attendance.

### Simplified Supervisor Workflow (from User Requirements - Msg #242)
1. **Check-in:** Must be done first by taking a selfie with GPS capture. All other actions are disabled until complete.
2. **Project Selection:** Enabled only after check-in.
3. **Workers Log & Create DPR:** Enabled only after a project is selected.

### Workers Daily Log Module
- Vendor Name (autocomplete from vendor table)
- No of workers present (numeric)
- Purpose of work (text)
- Multiple vendor entries per day

### DPR Creation
- Manual captions for photos (AI caption removed)
- Voice-to-text summary using OpenAI Whisper
- Translation to English

### PDF Export Format
- Filename: "Project code - MM DD, YYYY.pdf"
- Page 1: Project details + voice summary + worker attendance table
- Page 2+: One photo with caption per page

### Admin Functionality
- View/edit DPR captions and regenerate PDF
- Close DPR for the day
- Notifications for new DPR submissions

---

## Architecture

### Frontend (Expo/React Native Web)
- `/app/frontend/app/(admin)/` - Admin screens
- `/app/frontend/app/(supervisor)/` - Supervisor screens
- `/app/frontend/contexts/` - Auth and Project contexts
- `/app/frontend/services/api.ts` - API client

### Backend (FastAPI + MongoDB)
- `/app/backend/server.py` - Main API routes
- `/app/backend/wave3_routes.py` - DPR and speech-to-text routes
- `/app/backend/core/pdf_service.py` - PDF generation
- `/app/backend/core/ai_service.py` - AI integration (Whisper)
- `/app/backend/seed.py` - Database seeding

### Key Collections
- `users` - User accounts with `assigned_projects[]`
- `projects` - Project information
- `vendors` - Vendor list
- `worker_logs` - Daily worker attendance
- `notifications` - Admin notifications

---

## What's Been Implemented

### Feb 19, 2026 (Current Session)
- [x] **P0 FIX: Supervisor Check-in Button** - Fixed duplicate code causing syntax error, replaced `Alert.alert` with `window.alert` for web compatibility
- [x] **P0 FIX: Project Assignment Bug** - Fixed ObjectId conversion in GET /projects endpoint so supervisors can see assigned projects
- [x] **Database Seeding Enhancement** - Added supervisor user, sample project, and vendors to seed script

### Previous Session Completed Work
- [x] **M1: Simplified Supervisor Dashboard** - Step-by-step workflow (Check-in → Project → Actions)
- [x] **M2 & M3: Check-in Flow & Worker Log** - UI/UX flow for check-in and worker log entry
- [x] **M4: Remove AI Caption** - Simplified DPR to manual text input
- [x] **M5: Voice-to-Text Module** - OpenAI Whisper integration
- [x] **M6: PDF Generation (Page 1)** - Project info, summary, worker logs
- [x] **M8: PDF Filename Format** - "PROJ001 - Feb 19, 2026.pdf"
- [x] **M9: Generate + Notify** - PDF download and admin notifications
- [x] **Admin Notification System** - Notification bell and list

---

## Pending/Upcoming Tasks

### P1 - High Priority
- [ ] **M7: PDF Page 2+** - Add photo pages (one photo + caption per page)
- [ ] **M10: Admin DPR Edit** - View/edit DPR and regenerate PDF

### P2 - Medium Priority
- [ ] **C3:** Fix/verify Profile screen buttons
- [ ] **D1/D2:** Create Admin UI for editing Help/Support and Terms of Service

### P3 - Backlog
- [ ] **F3:** Dashboard widget for daily workers count
- [ ] **F4:** PDF export for Workers Report screen

---

## Test Credentials
- **Admin:** admin@example.com / admin123
- **Supervisor:** supervisor@example.com / supervisor123

## Integration Details
- **OpenAI Whisper** - Speech-to-text for DPR summary
- **Emergent LLM Key** - Used for AI integrations
