// API SERVICE
// Centralized API calls with authentication

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  LoginRequest,
  LoginResponse,
  User,
  Project,
  FinancialState,
  WorkOrder,
  PaymentCertificate,
  Vendor,
  ProgressEntry,
  Attendance,
  Issue,
  PettyCash,
  DPR,
} from '../types/api';

// Get base URL from environment
const getBaseUrl = (): string => {
  // For web, use relative paths (same origin)
  if (typeof window !== 'undefined' && Platform.OS === 'web') {
    console.log('Using relative paths for web');
    return '';  // Use relative paths
  }
  // For native apps, use the backend URL from env
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://finance-integrity-2.preview.emergentagent.com';
  console.log('Using backend URL:', backendUrl);
  return backendUrl;
};

const BASE_URL = getBaseUrl();
console.log('BASE_URL set to:', BASE_URL);

// Token storage keys
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user_data';

// Secure storage helpers (with web fallback)
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

// API Error class
export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Generic fetch wrapper
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
  requiresAuth = true
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (requiresAuth) {
    const token = await storage.getItem(ACCESS_TOKEN_KEY);
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 - try refresh token
  if (response.status === 401 && requiresAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Retry with new token
      const newToken = await storage.getItem(ACCESS_TOKEN_KEY);
      (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
      
      const retryResponse = await fetch(url, {
        ...options,
        headers,
      });
      
      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({}));
        throw new ApiError(error.detail || 'Request failed', retryResponse.status, error);
      }
      
      return retryResponse.json();
    } else {
      // Refresh failed - clear tokens
      await clearAuthData();
      throw new ApiError('Session expired', 401);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(error.detail || 'Request failed', response.status, error);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Token refresh
async function refreshAccessToken(): Promise<boolean> {
  try {
    const refreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;

    const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return false;

    const data: LoginResponse = await response.json();
    await storage.setItem(ACCESS_TOKEN_KEY, data.access_token);
    await storage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    await storage.setItem(USER_KEY, JSON.stringify(data.user));

    return true;
  } catch {
    return false;
  }
}

// Clear auth data
async function clearAuthData(): Promise<void> {
  await storage.removeItem(ACCESS_TOKEN_KEY);
  await storage.removeItem(REFRESH_TOKEN_KEY);
  await storage.removeItem(USER_KEY);
}

// ============================================
// AUTH API
// ============================================
export const authApi = {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const data = await fetchApi<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }, false);

    // Store tokens
    await storage.setItem(ACCESS_TOKEN_KEY, data.access_token);
    await storage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    await storage.setItem(USER_KEY, JSON.stringify(data.user));

    return data;
  },

  async logout(): Promise<void> {
    await clearAuthData();
  },

  async getCurrentUser(): Promise<User | null> {
    const userData = await storage.getItem(USER_KEY);
    if (!userData) return null;
    return JSON.parse(userData);
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await storage.getItem(ACCESS_TOKEN_KEY);
    return !!token;
  },

  async getStoredToken(): Promise<string | null> {
    return storage.getItem(ACCESS_TOKEN_KEY);
  },
};

// ============================================
// PROJECTS API
// ============================================
export const projectsApi = {
  async getAll(): Promise<Project[]> {
    return fetchApi<Project[]>('/api/projects');
  },

  async getById(id: string): Promise<Project> {
    return fetchApi<Project>(`/api/projects/${id}`);
  },
};

// ============================================
// FINANCIAL API
// ============================================
export const financialApi = {
  async getState(projectId: string, codeId?: string): Promise<FinancialState[]> {
    const params = new URLSearchParams({ project_id: projectId });
    if (codeId) params.append('code_id', codeId);
    return fetchApi<FinancialState[]>(`/api/financial-state?${params}`);
  },
};

// ============================================
// WORK ORDERS API (Phase 2)
// ============================================
export const workOrdersApi = {
  async getAll(projectId?: string, status?: string): Promise<WorkOrder[]> {
    const params = new URLSearchParams();
    if (projectId) params.append('project_id', projectId);
    if (status) params.append('status_filter', status);
    return fetchApi<WorkOrder[]>(`/api/v2/work-orders?${params}`);
  },
};

// ============================================
// PAYMENT CERTIFICATES API (Phase 2)
// ============================================
export const paymentCertificatesApi = {
  async getAll(projectId?: string, status?: string): Promise<PaymentCertificate[]> {
    const params = new URLSearchParams();
    if (projectId) params.append('project_id', projectId);
    if (status) params.append('status_filter', status);
    return fetchApi<PaymentCertificate[]>(`/api/v2/payment-certificates?${params}`);
  },
};

// ============================================
// VENDORS API (Phase 2)
// ============================================
export const vendorsApi = {
  async getAll(activeOnly = true): Promise<Vendor[]> {
    const params = new URLSearchParams({ active_only: String(activeOnly) });
    return fetchApi<Vendor[]>(`/api/v2/vendors?${params}`);
  },
};

// ============================================
// USERS API
// ============================================
export const usersApi = {
  async getAll(): Promise<User[]> {
    return fetchApi<User[]>('/api/users');
  },

  async getById(id: string): Promise<User> {
    return fetchApi<User>(`/api/users/${id}`);
  },
};

// ============================================
// CODES API
// ============================================
export const codesApi = {
  async getAll(activeOnly = true): Promise<any[]> {
    const params = new URLSearchParams({ active_only: String(activeOnly) });
    return fetchApi<any[]>(`/api/codes?${params}`);
  },
};

// ============================================
// BUDGETS API
// ============================================
export const budgetsApi = {
  async getAll(projectId?: string): Promise<any[]> {
    const params = projectId ? new URLSearchParams({ project_id: projectId }) : '';
    return fetchApi<any[]>(`/api/budgets${params ? '?' + params : ''}`);
  },
};

export default {
  auth: authApi,
  projects: projectsApi,
  financial: financialApi,
  workOrders: workOrdersApi,
  paymentCertificates: paymentCertificatesApi,
  vendors: vendorsApi,
  users: usersApi,
  codes: codesApi,
  budgets: budgetsApi,
};
