// API CONTRACT - FROZEN
// DO NOT MODIFY BACKEND TO MATCH THIS
// ADAPT UI TO EXISTING BACKEND RESPONSES

// ============================================
// AUTH
// ============================================
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface User {
  user_id: string;
  organisation_id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Supervisor' | 'Other';
  active_status: boolean;
  dpr_generation_permission: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// ORGANISATION
// ============================================
export interface Organisation {
  organisation_id: string;
  organisation_name: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// PROJECTS
// ============================================
export interface Project {
  project_id: string;
  organisation_id: string;
  project_name: string;
  client_name: string;
  start_date: string;
  end_date?: string;
  dpr_enforcement_enabled: boolean;
  project_retention_percentage?: number;
  project_cgst_percentage?: number;
  project_sgst_percentage?: number;
  currency_code: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  project_name: string;
  client_name: string;
  start_date: string;
  end_date?: string;
  dpr_enforcement_enabled?: boolean;
  project_retention_percentage?: number;
  project_cgst_percentage?: number;
  project_sgst_percentage?: number;
  currency_code?: string;
}

// ============================================
// CODES
// ============================================
export interface Code {
  code_id: string;
  code_short: string;
  code_name: string;
  active_status: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCodeRequest {
  code_short: string;
  code_name: string;
}

// ============================================
// BUDGET PER CODE
// ============================================
export interface BudgetPerCode {
  budget_id: string;
  project_id: string;
  code_id: string;
  approved_budget_amount: number;
  created_at: string;
  updated_at: string;
}

export interface CreateBudgetRequest {
  project_id: string;
  code_id: string;
  approved_budget_amount: number;
}

export interface UpdateBudgetRequest {
  approved_budget_amount: number;
}

// ============================================
// FINANCIAL STATE (Derived/Computed)
// ============================================
export interface FinancialState {
  state_id: string;
  project_id: string;
  code_id: string;
  committed_value: number;
  certified_value: number;
  paid_value: number;
  retention_held: number;
  balance_budget_remaining: number;
  balance_to_pay: number;
  over_commit_flag: boolean;
  over_certification_flag: boolean;
  over_payment_flag: boolean;
  last_recalculated_at: string;
}

// ============================================
// VENDORS
// ============================================
export interface Vendor {
  vendor_id: string;
  organisation_id: string;
  vendor_name: string;
  vendor_code: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  active_status: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateVendorRequest {
  vendor_name: string;
  vendor_code: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
}

// ============================================
// WORK ORDERS
// ============================================
export interface WorkOrder {
  wo_id: string;
  organisation_id: string;
  project_id: string;
  code_id: string;
  vendor_id: string;
  document_number: string;
  prefix: string;
  sequence_number: number;
  issue_date: string;
  rate: number;
  quantity: number;
  base_amount: number;
  retention_percentage: number;
  retention_amount: number;
  net_wo_value: number;
  status: 'Draft' | 'Issued' | 'Revised';
  locked_flag: boolean;
  version_number: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkOrderRequest {
  project_id: string;
  code_id: string;
  vendor_id: string;
  prefix?: string;
  issue_date: string;
  rate: number;
  quantity: number;
  retention_percentage?: number;
}

export interface ReviseWorkOrderRequest {
  rate?: number;
  quantity?: number;
  retention_percentage?: number;
}

// ============================================
// PAYMENT CERTIFICATES
// ============================================
export interface PaymentCertificate {
  pc_id: string;
  organisation_id: string;
  project_id: string;
  code_id: string;
  vendor_id: string;
  document_number: string;
  prefix: string;
  sequence_number: number;
  bill_date: string;
  current_bill_amount: number;
  cumulative_previous_certified: number;
  total_cumulative_certified: number;
  retention_percentage: number;
  retention_current: number;
  retention_cumulative: number;
  taxable_amount: number;
  cgst_percentage: number;
  sgst_percentage: number;
  cgst_amount: number;
  sgst_amount: number;
  net_payable: number;
  total_paid_cumulative: number;
  status: 'Draft' | 'Certified' | 'Partially Paid' | 'Fully Paid';
  locked_flag: boolean;
  version_number: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentCertificateRequest {
  project_id: string;
  code_id: string;
  vendor_id: string;
  prefix?: string;
  bill_date: string;
  current_bill_amount: number;
  retention_percentage?: number;
}

export interface RevisePaymentCertificateRequest {
  current_bill_amount?: number;
  retention_percentage?: number;
}

// ============================================
// PAYMENTS
// ============================================
export interface Payment {
  payment_id: string;
  pc_id: string;
  project_id: string;
  code_id: string;
  vendor_id: string;
  payment_amount: number;
  payment_date: string;
  payment_reference: string;
  created_at: string;
}

export interface CreatePaymentRequest {
  pc_id: string;
  payment_amount: number;
  payment_date: string;
  payment_reference: string;
}

// ============================================
// RETENTION RELEASE
// ============================================
export interface RetentionRelease {
  release_id: string;
  project_id: string;
  code_id: string;
  vendor_id: string;
  release_amount: number;
  release_date: string;
  created_at: string;
}

export interface CreateRetentionReleaseRequest {
  project_id: string;
  code_id: string;
  vendor_id: string;
  release_amount: number;
  release_date: string;
}

// ============================================
// PROGRESS TRACKING
// ============================================
export interface ProgressEntry {
  progress_id: string;
  project_id: string;
  code_id: string;
  supervisor_id: string;
  progress_date: string;
  previous_percentage: number;
  new_percentage: number;
  delta_percentage: number;
  created_at: string;
}

export interface CreateProgressRequest {
  project_id: string;
  code_id: string;
  new_percentage: number;
}

// ============================================
// PLANNED PROGRESS
// ============================================
export interface PlannedProgress {
  planned_id: string;
  project_id: string;
  code_id?: string;
  date: string;
  planned_percentage: number;
  created_at: string;
}

export interface CreatePlannedProgressRequest {
  project_id: string;
  code_id?: string;
  date: string;
  planned_percentage: number;
}

// ============================================
// DELAY ANALYSIS (Computed)
// ============================================
export interface DelayAnalysis {
  project_id: string;
  code_id: string;
  actual_percentage: number;
  planned_percentage: number;
  delay_flag: boolean;
  delay_difference: number;
  analysis_date: string;
}

// ============================================
// ATTENDANCE
// ============================================
export interface Attendance {
  attendance_id: string;
  project_id: string;
  supervisor_id: string;
  attendance_date: string;
  check_in_timestamp: string;
  selfie_image_id: string;
  gps_lat?: number;
  gps_long?: number;
  verified_by_admin: boolean;
  created_at: string;
}

export interface CreateAttendanceRequest {
  project_id: string;
  selfie_image_base64: string;
  gps_lat?: number;
  gps_long?: number;
}

// ============================================
// ISSUES
// ============================================
export interface Issue {
  issue_id: string;
  project_id: string;
  code_id: string;
  raised_by: string;
  title: string;
  description: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  assigned_to?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateIssueRequest {
  project_id: string;
  code_id: string;
  title: string;
  description: string;
  assigned_to?: string;
}

export interface UpdateIssueRequest {
  status?: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  assigned_to?: string;
  description?: string;
}

// ============================================
// VOICE LOGS
// ============================================
export interface VoiceLog {
  voice_log_id: string;
  project_id: string;
  code_id: string;
  supervisor_id: string;
  audio_file_id: string;
  audio_base64: string;
  transcribed_text?: string;
  transcription_failed: boolean;
  created_at: string;
}

export interface CreateVoiceLogRequest {
  project_id: string;
  code_id: string;
  audio_base64: string;
}

// ============================================
// PETTY CASH
// ============================================
export interface PettyCash {
  pettycash_id: string;
  project_id: string;
  code_id: string;
  supervisor_id: string;
  amount: number;
  bill_image_id: string;
  description: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approved_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePettyCashRequest {
  project_id: string;
  code_id: string;
  amount: number;
  bill_image_base64: string;
  description: string;
}

// ============================================
// CSA (Contract Schedule of Amounts)
// ============================================
export interface CSA {
  csa_id: string;
  project_id: string;
  code_id: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCSARequest {
  project_id: string;
  code_id: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
}

// ============================================
// DPR (Daily Progress Report)
// ============================================
export interface DPR {
  dpr_id: string;
  project_id: string;
  supervisor_id?: string;
  dpr_date: string;
  file_name: string;
  file_size_kb: number;
  drive_file_id?: string;
  drive_link?: string;
  version_number: number;
  locked_flag: boolean;
  created_at: string;
}

export interface GenerateDPRRequest {
  project_id: string;
  supervisor_id?: string;
}

// ============================================
// IMAGES
// ============================================
export interface Image {
  image_id: string;
  project_id: string;
  code_id: string;
  supervisor_id: string;
  image_base64: string;
  upload_timestamp: string;
  aspect_ratio_validated: boolean;
  compressed_flag: boolean;
  created_at: string;
}

export interface CreateImageRequest {
  project_id: string;
  code_id: string;
  image_base64: string;
}

// ============================================
// TIMELINE EVENT
// ============================================
export interface TimelineEvent {
  event_id: string;
  project_id: string;
  event_type: 'WO_CREATED' | 'WO_ISSUED' | 'WO_REVISED' | 'PC_CREATED' | 'PC_CERTIFIED' | 'PAYMENT_MADE' | 'RETENTION_RELEASED' | 'PROGRESS_UPDATED' | 'ISSUE_CREATED' | 'ISSUE_RESOLVED' | 'DPR_GENERATED';
  entity_id: string;
  entity_type: 'WorkOrder' | 'PaymentCertificate' | 'Payment' | 'RetentionRelease' | 'Progress' | 'Issue' | 'DPR';
  description: string;
  actor_id: string;
  actor_name: string;
  amount?: number;
  created_at: string;
}

// ============================================
// SNAPSHOT (Immutable Point-in-Time Records)
// ============================================
export interface Snapshot {
  snapshot_id: string;
  project_id: string;
  snapshot_type: 'FINANCIAL' | 'PROGRESS' | 'DPR';
  snapshot_date: string;
  data: SnapshotFinancialData | SnapshotProgressData;
  created_by: string;
  created_at: string;
}

export interface SnapshotFinancialData {
  approved_budget: number;
  committed_value: number;
  certified_value: number;
  paid_value: number;
  retention_held: number;
  outstanding_liability: number;
  over_commit_flag: boolean;
}

export interface SnapshotProgressData {
  physical_progress: number;
  financial_progress: number;
  delay_flag: boolean;
  delay_percentage: number;
}

// ============================================
// ALERT
// ============================================
export interface Alert {
  alert_id: string;
  project_id: string;
  alert_type: 'OVER_COMMIT' | 'OVER_CERTIFICATION' | 'OVER_PAYMENT' | 'BUDGET_EXCEEDED' | 'DELAY_WARNING' | 'DPR_MISSING' | 'ATTENDANCE_MISSING';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  message: string;
  entity_id?: string;
  entity_type?: string;
  resolved: boolean;
  resolved_at?: string;
  resolved_by?: string;
  created_at: string;
}

// ============================================
// DASHBOARD AGGREGATES
// ============================================
export interface AdminDashboardData {
  approved_budget: number;
  committed_value: number;
  certified_value: number;
  paid_value: number;
  retention_held: number;
  outstanding_liability: number;
  over_commit_indicator: boolean;
  physical_progress_percentage: number;
  financial_progress_percentage: number;
  delay_indicator: boolean;
  active_alerts: Alert[];
  total_projects: number;
  active_projects: number;
  pending_work_orders: number;
  pending_payment_certificates: number;
}

export interface SupervisorDashboardData {
  attendance_status: 'CHECKED_IN' | 'NOT_CHECKED_IN';
  check_in_time?: string;
  image_count_today: number;
  physical_progress_percentage: number;
  assigned_project: Project | null;
  open_issues_count: number;
  pending_voice_logs: number;
}

// ============================================
// OCR (Invoice Scan)
// ============================================
export interface OCRResult {
  extracted_vendor_name?: string;
  extracted_amount?: number;
  extracted_date?: string;
  extracted_invoice_number?: string;
  confidence_score: number;
  raw_text: string;
}

export interface OCRRequest {
  image_base64: string;
}

// ============================================
// AUDIT LOG
// ============================================
export interface AuditLog {
  audit_id: string;
  organisation_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

// ============================================
// API RESPONSE WRAPPERS
// ============================================
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiErrorResponse {
  detail: string;
  error_code?: string;
  field_errors?: Record<string, string[]>;
}
