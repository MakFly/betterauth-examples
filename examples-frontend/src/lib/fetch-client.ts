/**
 * Native Fetch API Client
 *
 * Features:
 * - No external dependencies (replaces axios)
 * - Automatic token injection from cookies
 * - Automatic 401 handling with token refresh
 * - Request queue integration (waits during refresh)
 * - Toast notifications for errors
 * - Full TypeScript support
 */

import { getCookie, clearAuthCookies } from './cookies';
import { toastStore } from './toast-store';
import {
  refreshTokens,
  isRefreshInProgress,
  getRefreshPromise,
  requestQueue,
} from './token-refresh';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const API_AUTH_PREFIX = import.meta.env.VITE_API_AUTH_PREFIX || '/api/v1';

// ============================================
// TYPES
// ============================================

interface FetchOptions extends Omit<RequestInit, 'body'> {
  _retry?: boolean;
  body?: unknown;
  skipAuth?: boolean;
  skipToast?: boolean;
}

interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

class FetchError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.data = data;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getErrorMessage(data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    // Backend format: { success: false, error: { code: "...", message: "..." } }
    if (obj.error && typeof obj.error === 'object') {
      const errorObj = obj.error as Record<string, unknown>;
      if (typeof errorObj.message === 'string') return errorObj.message;
      if (typeof errorObj.code === 'string') return errorObj.code;
    }
    // Direct format
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.message === 'string') return obj.message;
  }
  return 'Une erreur est survenue';
}

function isValidToken(token: string | null | undefined): token is string {
  return !!token && token !== 'undefined' && token !== 'null';
}

// ============================================
// CORE FETCH FUNCTION
// ============================================

async function fetchWithAuth<T>(
  url: string,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  const {
    _retry = false,
    body,
    skipAuth = false,
    skipToast = false,
    headers: customHeaders,
    ...fetchOptions
  } = options;

  // Determine if this is a special auth request
  const isRefreshRequest = url.includes('/auth/refresh');
  const isLoginRequest = url.includes('/auth/login');
  const isRegisterRequest = url.includes('/auth/register');
  const isAuthRequest = isRefreshRequest || isLoginRequest || isRegisterRequest;

  // Wait if request queue is paused (during token refresh)
  // Skip waiting for the refresh request itself to avoid deadlock
  if (!isRefreshRequest) {
    try {
      await requestQueue.waitIfPaused();
    } catch {
      // Queue was rejected (refresh failed)
      throw new FetchError('Session expired', 401, { error: 'Session expired' });
    }
  }

  // Build headers
  const headers = new Headers(customHeaders);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Add authorization header
  if (!skipAuth) {
    const token = getCookie('access_token');
    if (isValidToken(token)) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  // Build full URL
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  // Make the request
  const response = await fetch(fullUrl, {
    ...fetchOptions,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  // Parse response
  let data: unknown;
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  // Handle 401 Unauthorized
  if (response.status === 401 && !_retry && !isAuthRequest) {
    const refreshToken = getCookie('refresh_token');

    if (!isValidToken(refreshToken)) {
      clearAuthCookies();
      throw new FetchError('No valid session', 401, data);
    }

    // Wait for ongoing refresh or start new one
    let result;
    if (isRefreshInProgress()) {
      const existingPromise = getRefreshPromise();
      if (existingPromise) {
        result = await existingPromise;
      }
    } else {
      result = await refreshTokens();
    }

    if (result?.success && result.accessToken) {
      // Retry with new token
      return fetchWithAuth<T>(url, { ...options, _retry: true });
    }

    // Refresh failed
    throw new FetchError('Session expired', 401, data);
  }

  // Handle other errors
  if (!response.ok) {
    const errorMessage = getErrorMessage(data);

    // Show toast for errors (except for special requests)
    if (!skipToast && !isRefreshRequest) {
      toastStore.show(errorMessage, 'error');
    }

    throw new FetchError(errorMessage, response.status, data);
  }

  return {
    data: data as T,
    status: response.status,
    headers: response.headers,
  };
}

// ============================================
// API CLIENT
// ============================================

export const api = {
  get: <T>(url: string, options?: FetchOptions) =>
    fetchWithAuth<T>(url, { ...options, method: 'GET' }),

  post: <T>(url: string, body?: unknown, options?: FetchOptions) =>
    fetchWithAuth<T>(url, { ...options, method: 'POST', body }),

  put: <T>(url: string, body?: unknown, options?: FetchOptions) =>
    fetchWithAuth<T>(url, { ...options, method: 'PUT', body }),

  patch: <T>(url: string, body?: unknown, options?: FetchOptions) =>
    fetchWithAuth<T>(url, { ...options, method: 'PATCH', body }),

  delete: <T>(url: string, options?: FetchOptions) =>
    fetchWithAuth<T>(url, { ...options, method: 'DELETE' }),
};

// ============================================
// API TYPES (same as before for compatibility)
// ============================================

export interface User {
  id: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // Backend format fields
  profile?: {
    name: string;
    avatar?: string;
    initials?: string;
  };
  status?: {
    emailVerified: boolean;
    has2FA: boolean;
  };
  timestamps?: {
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * Normalize backend user format to frontend format
 */
function normalizeUser(backendUser: User): User {
  // If already in frontend format, return as is
  if (backendUser.name && backendUser.emailVerified !== undefined) {
    return backendUser;
  }

  // Convert from backend format
  return {
    id: backendUser.id,
    email: backendUser.email,
    name: backendUser.profile?.name || backendUser.name || '',
    emailVerified: backendUser.status?.emailVerified || backendUser.emailVerified || false,
    twoFactorEnabled: backendUser.status?.has2FA || backendUser.twoFactorEnabled || false,
    createdAt: backendUser.timestamps?.createdAt || backendUser.createdAt || '',
    updatedAt: backendUser.timestamps?.updatedAt || backendUser.updatedAt,
  };
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: User;
  requires2fa?: boolean;
  message?: string;
}

// Backend API response format
interface BackendAuthResponse {
  success: boolean;
  data?: {
    auth?: {
      accessToken: string;
      refreshToken: string;
      tokenType: string;
      expiresIn: number;
      expiresAt?: string;
    };
    user?: User;
    requires2FA?: boolean;
  };
  error?: {
    code: string;
    message: string;
    status: number;
    details?: Record<string, unknown>;
  };
}

/**
 * Normalize backend response format to frontend format
 */
function normalizeAuthResponse(backendResponse: BackendAuthResponse | LoginResponse): LoginResponse {
  // If it's already in the expected format, return as is
  if ('access_token' in backendResponse && 'refresh_token' in backendResponse) {
    return backendResponse as LoginResponse;
  }

  // Handle backend format: { success: true, data: { auth: {...}, user: {...} } }
  if (backendResponse.success && backendResponse.data) {
    const { auth, user, requires2FA } = backendResponse.data;

    if (auth && user) {
      return {
        access_token: auth.accessToken,
        refresh_token: auth.refreshToken,
        expires_in: auth.expiresIn,
        token_type: auth.tokenType || 'Bearer',
        user: normalizeUser(user),
        requires2fa: requires2FA,
      };
    }

    // Handle 2FA required response
    if (requires2FA && user) {
      return {
        access_token: '',
        refresh_token: '',
        expires_in: 0,
        token_type: 'Bearer',
        user: normalizeUser(user),
        requires2fa: true,
      };
    }
  }

  // Fallback: try to extract from error or return empty
  throw new Error(backendResponse.error?.message || 'Invalid response format');
}

export interface Session {
  id: string;
  device: string;
  browser: string;
  os: string;
  ip: string;
  location: string;
  current: boolean;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  manualEntryKey: string;
  backupCodes: string[];
}

export interface GuestSession {
  id?: string;
  guest_token: string;
  device_info?: string;
  ip_address?: string;
  created_at: string;
  expires_at: string;
  metadata?: Record<string, unknown>;
}

export interface TwoFactorStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

// ============================================
// API ENDPOINTS
// ============================================

// Auth API
export const authApi = {
  register: async (email: string, password: string, name: string) => {
    const response = await api.post<BackendAuthResponse>(`${API_AUTH_PREFIX}/auth/register`, { email, password, name });
    return normalizeAuthResponse(response.data);
  },

  login: async (email: string, password: string) => {
    const response = await api.post<BackendAuthResponse>(`${API_AUTH_PREFIX}/auth/login`, { email, password });
    return normalizeAuthResponse(response.data);
  },

  login2fa: async (email: string, password: string, code: string) => {
    const response = await api.post<BackendAuthResponse>(`${API_AUTH_PREFIX}/auth/login/2fa`, { email, password, code });
    return normalizeAuthResponse(response.data);
  },

  getCurrentUser: async () => {
    const response = await api.get<{ success: boolean; data: { user: User } }>(`${API_AUTH_PREFIX}/auth/me`);
    // Backend returns { success: true, data: { user: {...} } }
    return normalizeUser(response.data.data.user);
  },

  logout: () =>
    api.post<{ message: string }>(`${API_AUTH_PREFIX}/auth/logout`),

  refreshToken: async (refreshToken: string) => {
    const response = await api.post<BackendAuthResponse>(`${API_AUTH_PREFIX}/auth/refresh`, { refreshToken });
    return normalizeAuthResponse(response.data);
  },

  revokeAll: () =>
    api.post<{ message: string; count: number }>(`${API_AUTH_PREFIX}/auth/revoke-all`),
};

// Session API
export const sessionApi = {
  getSessions: async () => {
    const response = await api.get<{ sessions: Session[] }>(`${API_AUTH_PREFIX}/auth/sessions`);
    return response.data.sessions;
  },

  revokeSession: (sessionId: string) =>
    api.delete<{ message: string }>(`${API_AUTH_PREFIX}/auth/sessions/${sessionId}`),

  revokeAllOtherSessions: () =>
    api.delete<{ message: string }>(`${API_AUTH_PREFIX}/auth/sessions/others`),
};

// 2FA API
export const twoFactorApi = {
  setup: async () => {
    const response = await api.post<TwoFactorSetup>(`${API_AUTH_PREFIX}/auth/2fa/setup`);
    return response.data;
  },

  validate: (code: string) =>
    api.post<{ message: string; enabled: boolean }>(`${API_AUTH_PREFIX}/auth/2fa/validate`, { code }),

  verify: (code: string) =>
    api.post<{ message: string; success: boolean }>(`${API_AUTH_PREFIX}/auth/2fa/verify`, { code }),

  disable: (code: string) =>
    api.post<{ message: string; enabled: boolean }>(`${API_AUTH_PREFIX}/auth/2fa/disable`, { code }),

  regenerateBackupCodes: (code: string) =>
    api.post<{ message: string; backupCodes: string[] }>(`${API_AUTH_PREFIX}/auth/2fa/backup-codes/regenerate`, { code }),

  getStatus: () =>
    api.get<TwoFactorStatus>(`${API_AUTH_PREFIX}/auth/2fa/status`),
};

// Email Verification API
export const emailApi = {
  sendVerification: () =>
    api.post<{ message: string; expiresIn: number }>(`${API_AUTH_PREFIX}/auth/email/send-verification`),

  verify: (token: string) =>
    api.post<{ message: string; verified: boolean }>(`${API_AUTH_PREFIX}/auth/email/verify`, { token }),

  getStatus: () =>
    api.get<{ verified: boolean; email: string }>(`${API_AUTH_PREFIX}/auth/email/verification-status`),
};

// Password Reset API
export const passwordApi = {
  forgot: (email: string) =>
    api.post<{ message: string; expiresIn?: number }>(`${API_AUTH_PREFIX}/auth/password/forgot`, { email }),

  reset: (token: string, newPassword: string) =>
    api.post<{ message: string; success: boolean }>(`${API_AUTH_PREFIX}/auth/password/reset`, { token, newPassword }),

  verifyToken: (token: string) =>
    api.post<{ valid: boolean; email?: string }>(`${API_AUTH_PREFIX}/auth/password/verify-token`, { token }),
};

// Magic Link API
export const magicLinkApi = {
  send: (email: string) =>
    api.post<{ message: string; expiresIn: number }>(`${API_AUTH_PREFIX}/auth/magic-link/send`, { email }),

  verify: (token: string) =>
    api.post<LoginResponse>(`${API_AUTH_PREFIX}/auth/magic-link/verify`, { token }),

  verifyGet: (token: string) =>
    api.get<LoginResponse>(`${API_AUTH_PREFIX}/auth/magic-link/verify/${token}`),
};

// OAuth API
export const oauthApi = {
  getAuthUrl: (provider: string) =>
    api.get<{ url: string; state?: string }>(`${API_AUTH_PREFIX}/auth/oauth/${provider}`),
};

// Guest Session API
export const guestSessionApi = {
  create: (metadata?: Record<string, unknown>) =>
    api.post<{ guest_token: string; expires_at: string; created_at: string }>(`${API_AUTH_PREFIX}/auth/guest/create`, { metadata }),

  get: (token: string) =>
    api.get<GuestSession>(`${API_AUTH_PREFIX}/auth/guest/${token}`),

  convert: (guestToken: string, email: string, password?: string, name?: string) =>
    api.post<{
      message: string;
      user: { id: string; email: string; name: string };
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    }>(`${API_AUTH_PREFIX}/auth/guest/convert`, { guest_token: guestToken, email, password, name }),

  delete: (token: string) =>
    api.delete<{ message: string }>(`${API_AUTH_PREFIX}/auth/guest/${token}`),
};
