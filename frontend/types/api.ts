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

// ============================================
// FINANCIAL STATE
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
// BUDGET
// ============================================
export interface Budget {
  budget_id: string;
  project_id: string;
  code_id: string;
  approved_budget_amount: number;
  created_at: string;
  updated_at: string;
}

export interface Code {
  code_id: string;
  code_short: string;
  code_name: string;
  active_status: boolean;
  created_at: string;
  updated_at: string;
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

// ============================================
// PROGRESS
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
// DPR
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
