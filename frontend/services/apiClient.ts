// API CLIENT WRAPPER
// Centralized API client with JWT injection, error handling, typed responses

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  LoginRequest,
  LoginResponse,
  User,
  Project,
  CreateProjectRequest,
  Code,
  CreateCodeRequest,
  BudgetPerCode,
  CreateBudgetRequest,
  UpdateBudgetRequest,
  FinancialState,
  Vendor,
  CreateVendorRequest,
  WorkOrder,
  CreateWorkOrderRequest,
  ReviseWorkOrderRequest,
  PaymentCertificate,
  CreatePaymentCertificateRequest,
  RevisePaymentCertificateRequest,
  Payment,
  CreatePaymentRequest,
  RetentionRelease,
  CreateRetentionReleaseRequest,
  ProgressEntry,
  CreateProgressRequest,
  PlannedProgress,
  CreatePlannedProgressRequest,
  DelayAnalysis,
  Attendance,
  CreateAttendanceRequest,
  Issue,
  CreateIssueRequest,
  UpdateIssueRequest,
  VoiceLog,
  CreateVoiceLogRequest,
  PettyCash,
  CreatePettyCashRequest,
  CSA,
  CreateCSARequest,
  DPR,
  GenerateDPRRequest,
  Image,
  CreateImageRequest,
  TimelineEvent,
  Snapshot,
  Alert,
  AdminDashboardData,
  SupervisorDashboardData,
  OCRResult,
  OCRRequest,
  AuditLog,
  ApiErrorResponse,
} from '../types/api';

// ============================================
// CONFIGURATION
// ============================================
const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://backend-hardening-3.preview.emergentagent.com';

const TOKEN_KEYS = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token',
  USER: 'user_data',
} as const;

// ============================================
// STORAGE ABSTRACTION
// ============================================
const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

// ============================================
// ERROR CLASS
// ============================================
export class ApiError extends Error {
  status: number;
  data: ApiErrorResponse;

  constructor(message: string, status: number, data?: ApiErrorResponse) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data || { detail: message };
  }
}

// ============================================
// CORE FETCH WRAPPER
// ============================================
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  requiresAuth = true
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Inject JWT token
  if (requiresAuth) {
    const token = await storage.get(TOKEN_KEYS.ACCESS);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, { ...options, headers });

  // Handle 401 - attempt token refresh
  if (response.status === 401 && requiresAuth) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      const newToken = await storage.get(TOKEN_KEYS.ACCESS);
      headers['Authorization'] = `Bearer ${newToken}`;
      const retryResponse = await fetch(url, { ...options, headers });
      
      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ detail: 'Request failed' }));
        throw new ApiError(error.detail, retryResponse.status, error);
      }
      return retryResponse.json();
    } else {
      await clearTokens();
      throw new ApiError('Session expired', 401);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new ApiError(error.detail || 'Request failed', response.status, error);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

async function attemptTokenRefresh(): Promise<boolean> {
  try {
    const refreshToken = await storage.get(TOKEN_KEYS.REFRESH);
    if (!refreshToken) return false;

    const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return false;

    const data: LoginResponse = await response.json();
    await storage.set(TOKEN_KEYS.ACCESS, data.access_token);
    await storage.set(TOKEN_KEYS.REFRESH, data.refresh_token);
    await storage.set(TOKEN_KEYS.USER, JSON.stringify(data.user));
    return true;
  } catch {
    return false;
  }
}

async function clearTokens(): Promise<void> {
  await storage.remove(TOKEN_KEYS.ACCESS);
  await storage.remove(TOKEN_KEYS.REFRESH);
  await storage.remove(TOKEN_KEYS.USER);
}

// ============================================
// AUTH API
// ============================================
export const authApi = {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const data = await request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }, false);
    await storage.set(TOKEN_KEYS.ACCESS, data.access_token);
    await storage.set(TOKEN_KEYS.REFRESH, data.refresh_token);
    await storage.set(TOKEN_KEYS.USER, JSON.stringify(data.user));
    return data;
  },
  async logout(): Promise<void> {
    await clearTokens();
  },
  async getCurrentUser(): Promise<User | null> {
    const userData = await storage.get(TOKEN_KEYS.USER);
    return userData ? JSON.parse(userData) : null;
  },
  async isAuthenticated(): Promise<boolean> {
    const token = await storage.get(TOKEN_KEYS.ACCESS);
    return !!token;
  },
  async getToken(): Promise<string | null> {
    return storage.get(TOKEN_KEYS.ACCESS);
  },
};

// ============================================
// PROJECTS API
// ============================================
export const projectsApi = {
  getAll: (): Promise<Project[]> => request('/api/projects'),
  getById: (id: string): Promise<Project> => request(`/api/projects/${id}`),
  create: (data: CreateProjectRequest): Promise<Project> => request('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CreateProjectRequest>): Promise<Project> => request(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ============================================
// CODES API
// ============================================
export const codesApi = {
  getAll: (activeOnly = true): Promise<Code[]> => request(`/api/codes?active_only=${activeOnly}`),
  getById: (id: string): Promise<Code> => request(`/api/codes/${id}`),
  create: (data: CreateCodeRequest): Promise<Code> => request('/api/codes', { method: 'POST', body: JSON.stringify(data) }),
};

// ============================================
// BUDGETS API
// ============================================
export const budgetsApi = {
  getAll: (projectId?: string): Promise<BudgetPerCode[]> => request(`/api/budgets${projectId ? `?project_id=${projectId}` : ''}`),
  getById: (id: string): Promise<BudgetPerCode> => request(`/api/budgets/${id}`),
  create: (data: CreateBudgetRequest): Promise<BudgetPerCode> => request('/api/budgets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: UpdateBudgetRequest): Promise<BudgetPerCode> => request(`/api/budgets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ============================================
// FINANCIAL STATE API
// ============================================
export const financialApi = {
  getState: (projectId: string, codeId?: string): Promise<FinancialState[]> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (codeId) params.append('code_id', codeId);
    return request(`/api/financial-state?${params}`);
  },
};

// ============================================
// VENDORS API
// ============================================
export const vendorsApi = {
  getAll: (activeOnly = true): Promise<Vendor[]> => request(`/api/phase2/vendors?active_only=${activeOnly}`),
  getById: (id: string): Promise<Vendor> => request(`/api/phase2/vendors/${id}`),
  create: (data: CreateVendorRequest): Promise<Vendor> => request('/api/phase2/vendors', { method: 'POST', body: JSON.stringify(data) }),
};

// ============================================
// WORK ORDERS API
// ============================================
export const workOrdersApi = {
  getAll: (projectId: string, status?: string): Promise<WorkOrder[]> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (status) params.append('status', status);
    return request(`/api/phase2/work-orders?${params}`);
  },
  getById: (id: string): Promise<WorkOrder> => request(`/api/phase2/work-orders/${id}`),
  create: (data: CreateWorkOrderRequest): Promise<WorkOrder> => request('/api/phase2/work-orders', { method: 'POST', body: JSON.stringify(data) }),
  issue: (id: string): Promise<WorkOrder> => request(`/api/phase2/work-orders/${id}/issue`, { method: 'POST' }),
  revise: (id: string, data: ReviseWorkOrderRequest): Promise<WorkOrder> => request(`/api/phase2/work-orders/${id}/revise`, { method: 'POST', body: JSON.stringify(data) }),
};

// ============================================
// PAYMENT CERTIFICATES API
// ============================================
export const paymentCertificatesApi = {
  getAll: (projectId: string, status?: string): Promise<PaymentCertificate[]> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (status) params.append('status', status);
    return request(`/api/phase2/payment-certificates?${params}`);
  },
  getById: (id: string): Promise<PaymentCertificate> => request(`/api/phase2/payment-certificates/${id}`),
  create: (data: CreatePaymentCertificateRequest): Promise<PaymentCertificate> => request('/api/phase2/payment-certificates', { method: 'POST', body: JSON.stringify(data) }),
  certify: (id: string): Promise<PaymentCertificate> => request(`/api/phase2/payment-certificates/${id}/certify`, { method: 'POST' }),
  revise: (id: string, data: RevisePaymentCertificateRequest): Promise<PaymentCertificate> => request(`/api/phase2/payment-certificates/${id}/revise`, { method: 'POST', body: JSON.stringify(data) }),
};

// ============================================
// PAYMENTS API
// ============================================
export const paymentsApi = {
  getByPC: (pcId: string): Promise<Payment[]> => request(`/api/phase2/payment-certificates/${pcId}/payments`),
  create: (data: CreatePaymentRequest): Promise<Payment> => request('/api/phase2/payments', { method: 'POST', body: JSON.stringify(data) }),
};

// ============================================
// RETENTION RELEASES API
// ============================================
export const retentionApi = {
  getAll: (projectId: string): Promise<RetentionRelease[]> => request(`/api/phase2/retention-releases?project_id=${projectId}`),
  create: (data: CreateRetentionReleaseRequest): Promise<RetentionRelease> => request('/api/phase2/retention-releases', { method: 'POST', body: JSON.stringify(data) }),
};

// ============================================
// PROGRESS API
// ============================================
export const progressApi = {
  getAll: (projectId: string, codeId?: string): Promise<ProgressEntry[]> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (codeId) params.append('code_id', codeId);
    return request(`/api/progress?${params}`);
  },
  create: (data: CreateProgressRequest): Promise<ProgressEntry> => request('/api/progress', { method: 'POST', body: JSON.stringify(data) }),
  getLatest: (projectId: string, codeId: string): Promise<ProgressEntry> => request(`/api/progress/latest?project_id=${projectId}&code_id=${codeId}`),
};

// ============================================
// PLANNED PROGRESS API
// ============================================
export const plannedProgressApi = {
  getAll: (projectId: string, codeId?: string): Promise<PlannedProgress[]> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (codeId) params.append('code_id', codeId);
    return request(`/api/planned-progress?${params}`);
  },
  create: (data: CreatePlannedProgressRequest): Promise<PlannedProgress> => request('/api/planned-progress', { method: 'POST', body: JSON.stringify(data) }),
};

// ============================================
// DELAY ANALYSIS API
// ============================================
export const delayApi = {
  analyze: (projectId: string, codeId?: string): Promise<DelayAnalysis[]> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (codeId) params.append('code_id', codeId);
    return request(`/api/delay-analysis?${params}`);
  },
};

// ============================================
// ATTENDANCE API
// ============================================
export const attendanceApi = {
  getAll: (projectId: string, supervisorId?: string): Promise<Attendance[]> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (supervisorId) params.append('supervisor_id', supervisorId);
    return request(`/api/attendance?${params}`);
  },
  checkIn: (data: CreateAttendanceRequest): Promise<Attendance> => request('/api/attendance', { method: 'POST', body: JSON.stringify(data) }),
  getToday: (projectId: string, supervisorId: string): Promise<Attendance | null> => request(`/api/attendance/today?project_id=${projectId}&supervisor_id=${supervisorId}`),
};

// ============================================
// ISSUES API
// ============================================
export const issuesApi = {
  getAll: (projectId: string, status?: string): Promise<Issue[]> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (status) params.append('status', status);
    return request(`/api/issues?${params}`);
  },
  getById: (id: string): Promise<Issue> => request(`/api/issues/${id}`),
  create: (data: CreateIssueRequest): Promise<Issue> => request('/api/issues', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: UpdateIssueRequest): Promise<Issue> => request(`/api/issues/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ============================================
// VOICE LOGS API
// ============================================
export const voiceLogsApi = {
  getAll: (projectId: string): Promise<VoiceLog[]> => request(`/api/voice-logs?project_id=${projectId}`),
  create: (data: CreateVoiceLogRequest): Promise<VoiceLog> => request('/api/voice-logs', { method: 'POST', body: JSON.stringify(data) }),
};

// ============================================
// PETTY CASH API
// ============================================
export const pettyCashApi = {
  getAll: (projectId: string, status?: string): Promise<PettyCash[]> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (status) params.append('status', status);
    return request(`/api/petty-cash?${params}`);
  },
  create: (data: CreatePettyCashRequest): Promise<PettyCash> => request('/api/petty-cash', { method: 'POST', body: JSON.stringify(data) }),
  approve: (id: string): Promise<PettyCash> => request(`/api/petty-cash/${id}/approve`, { method: 'POST' }),
  reject: (id: string, reason?: string): Promise<PettyCash> => request(`/api/petty-cash/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
};

// ============================================
// CSA API
// ============================================
export const csaApi = {
  getAll: (projectId: string): Promise<CSA[]> => request(`/api/csa?project_id=${projectId}`),
  create: (data: CreateCSARequest): Promise<CSA> => request('/api/csa', { method: 'POST', body: JSON.stringify(data) }),
};

// ============================================
// DPR API
// ============================================
export const dprApi = {
  getAll: (projectId: string): Promise<DPR[]> => request(`/api/dpr?project_id=${projectId}`),
  generate: (data: GenerateDPRRequest): Promise<DPR> => request('/api/dpr/generate', { method: 'POST', body: JSON.stringify(data) }),
  getById: (id: string): Promise<DPR> => request(`/api/dpr/${id}`),
};

// ============================================
// IMAGES API
// ============================================
export const imagesApi = {
  getAll: (projectId: string, codeId?: string): Promise<Image[]> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (codeId) params.append('code_id', codeId);
    return request(`/api/images?${params}`);
  },
  upload: (data: CreateImageRequest): Promise<Image> => request('/api/images', { method: 'POST', body: JSON.stringify(data) }),
  getToday: (projectId: string, supervisorId: string): Promise<Image[]> => request(`/api/images/today?project_id=${projectId}&supervisor_id=${supervisorId}`),
};

// ============================================
// TIMELINE API
// ============================================
export const timelineApi = {
  getAll: (projectId: string, limit = 50): Promise<TimelineEvent[]> => request(`/api/timeline?project_id=${projectId}&limit=${limit}`),
};

// ============================================
// SNAPSHOTS API
// ============================================
export const snapshotsApi = {
  getAll: (projectId: string, type?: string): Promise<Snapshot[]> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (type) params.append('type', type);
    return request(`/api/snapshots?${params}`);
  },
  getById: (id: string): Promise<Snapshot> => request(`/api/snapshots/${id}`),
};

// ============================================
// ALERTS API
// ============================================
export const alertsApi = {
  getAll: (projectId?: string, resolved = false): Promise<Alert[]> => {
    const params = new URLSearchParams({ resolved: String(resolved) });
    if (projectId) params.append('project_id', projectId);
    return request(`/api/alerts?${params}`);
  },
  resolve: (id: string): Promise<Alert> => request(`/api/alerts/${id}/resolve`, { method: 'POST' }),
};

// ============================================
// DASHBOARD API
// ============================================
export const dashboardApi = {
  getAdminDashboard: (projectId?: string): Promise<AdminDashboardData> => {
    const params = projectId ? `?project_id=${projectId}` : '';
    return request(`/api/dashboard/admin${params}`);
  },
  getSupervisorDashboard: (projectId: string): Promise<SupervisorDashboardData> => request(`/api/dashboard/supervisor?project_id=${projectId}`),
};

// ============================================
// OCR API
// ============================================
export const ocrApi = {
  scanInvoice: (data: OCRRequest): Promise<OCRResult> => request('/api/ocr/scan', { method: 'POST', body: JSON.stringify(data) }),
};

// ============================================
// USERS API
// ============================================
export const usersApi = {
  getAll: (): Promise<User[]> => request('/api/users'),
  getById: (id: string): Promise<User> => request(`/api/users/${id}`),
};

// ============================================
// AUDIT LOGS API
// ============================================
export const auditLogsApi = {
  getAll: (entityType?: string, entityId?: string, limit = 100): Promise<AuditLog[]> => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (entityType) params.append('entity_type', entityType);
    if (entityId) params.append('entity_id', entityId);
    return request(`/api/audit-logs?${params}`);
  },
};

// ============================================
// DEFAULT EXPORT
// ============================================
export default {
  auth: authApi,
  projects: projectsApi,
  codes: codesApi,
  budgets: budgetsApi,
  financial: financialApi,
  vendors: vendorsApi,
  workOrders: workOrdersApi,
  paymentCertificates: paymentCertificatesApi,
  payments: paymentsApi,
  retention: retentionApi,
  progress: progressApi,
  plannedProgress: plannedProgressApi,
  delay: delayApi,
  attendance: attendanceApi,
  issues: issuesApi,
  voiceLogs: voiceLogsApi,
  pettyCash: pettyCashApi,
  csa: csaApi,
  dpr: dprApi,
  images: imagesApi,
  timeline: timelineApi,
  snapshots: snapshotsApi,
  alerts: alertsApi,
  dashboard: dashboardApi,
  ocr: ocrApi,
  users: usersApi,
  auditLogs: auditLogsApi,
};
