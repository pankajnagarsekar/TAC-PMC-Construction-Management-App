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

### Feb 20, 2026 (Current Session - Part 2)
- [x] **PDF Filename Fix** - Changed format from "MMM DD, YYYY" to "MM DD, YYYY" per user requirement
- [x] **M10: Admin DPR Image Edit** - Added collapsible photo frames with editable captions for Admin DPR detail screen
- [x] **Image Caption API** - Added PUT /api/v2/dpr/{dpr_id}/images/{image_id} endpoint to update captions
- [x] **Supervisor DPR Collapsible Photos** - Photos now collapse after adding caption for better UX
- [x] **Worker Log Collapsible Entries** - Vendor entries collapse after completion with "Done" button
- [x] **C3: Supervisor Profile Cleanup** - Removed unused buttons, kept only Password Change and Attendance History
- [x] **Checkout Button on Dashboard** - Renamed logout to "Checkout" and moved to dashboard header with red button

### Feb 20, 2026 (Current Session - Part 1)
- [x] **P0 FIX: STT Transcription Error** - Fixed `'str' object has no attribute 'file_contents'` by using `UserMessage` object instead of plain string for `LlmChat.send_message()`. Corrected import to use `from emergentintegrations.llm.chat import LlmChat, UserMessage`
- [x] **P0 FIX: Direct PDF Download** - Changed DPR submission to directly download PDF on web (using blob + download link) and share on mobile (using expo-file-system + expo-sharing) instead of showing "saved to reports"
- [x] **Verified: Dashboard Workflow** - Check-in Required shown first with other options disabled, matching user requirements

### Feb 19, 2026 (Previous Session)
- [x] **P0 FIX: Supervisor Check-in Button** - Fixed duplicate code causing syntax error, replaced `Alert.alert` with `window.alert` for web compatibility
- [x] **P0 FIX: Project Assignment Bug** - Fixed ObjectId conversion in GET /projects endpoint so supervisors can see assigned projects
- [x] **Database Seeding Enhancement** - Added supervisor user, sample project, and vendors to seed script

### Earlier Completed Work
- [x] **M1: Simplified Supervisor Dashboard** - Step-by-step workflow (Check-in → Project → Actions)
- [x] **M2 & M3: Check-in Flow & Worker Log** - UI/UX flow for check-in and worker log entry
- [x] **M4: Remove AI Caption** - Simplified DPR to manual text input
- [x] **M5: Voice-to-Text Module** - OpenAI Whisper integration
- [x] **M6: PDF Generation (Page 1)** - Project info, summary, worker logs
- [x] **M7: PDF Page 2+** - User tested and working
- [x] **M8: PDF Filename Format** - "ProjectCode - MM DD, YYYY.pdf"
- [x] **M9: Generate + Notify** - PDF download and admin notifications
- [x] **Admin Notification System** - Notification bell and list

---

## Pending/Upcoming Tasks

### P1 - High Priority
- [ ] **Admin DPR Re-export PDF** - After editing captions, regenerate PDF

### P2 - Medium Priority
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
