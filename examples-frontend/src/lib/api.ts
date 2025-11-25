import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { getCookie, setCookie, clearAuthCookies } from './cookies';
import { toastStore } from './toast-store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable cookies
});

// ============================================
// REFRESH TOKEN MUTEX - Prevents race conditions
// ============================================
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

function onRefreshFailed() {
  refreshSubscribers = [];
}

// Interceptor pour ajouter le token automatiquement depuis les cookies
api.interceptors.request.use((config) => {
  const token = getCookie('access_token');
  // Only add token if it's a valid value (not null, undefined string, or empty)
  if (token && token !== 'undefined' && token !== 'null' && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Helper function to extract error message from API response
function getErrorMessage(error: any): string {
  if (error.response?.data?.error) {
    return error.response.data.error;
  }
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error.message) {
    return error.message;
  }
  return 'Une erreur est survenue';
}

// Interceptor pour gérer le refresh token automatique et les erreurs
// Utilise un MUTEX pour éviter les race conditions lors de refreshs concurrents
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean; headers?: Record<string, string> };

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Skip toast for refresh token requests to avoid infinite loops
    const isRefreshRequest = originalRequest.url?.includes('/auth/refresh');
    const isLoginRequest = originalRequest.url?.includes('/auth/login');
    const isRegisterRequest = originalRequest.url?.includes('/auth/register');

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Skip refresh for login/register requests
      if (isLoginRequest || isRegisterRequest) {
        const errorMessage = getErrorMessage(error);
        toastStore.show(errorMessage, 'error');
        return Promise.reject(error);
      }

      const refreshToken = getCookie('refresh_token');

      // No valid refresh token available
      if (!refreshToken || refreshToken === 'undefined' || refreshToken === 'null') {
        clearAuthCookies();
        return Promise.reject(error);
      }

      // MUTEX: If already refreshing, wait for the refresh to complete
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            resolve(api(originalRequest));
          });
          // If refresh fails, reject all waiting requests
          setTimeout(() => {
            if (refreshSubscribers.length > 0) {
              reject(error);
            }
          }, 10000); // 10s timeout
        });
      }

      // Mark as refreshing and retry
      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        }, {
          withCredentials: true,
        });

        const { access_token, refresh_token: new_refresh_token } = response.data;

        // Store new tokens in cookies
        setCookie('access_token', access_token, 1); // 1 day
        setCookie('refresh_token', new_refresh_token, 7); // 7 days

        // Notify all waiting requests
        isRefreshing = false;
        onTokenRefreshed(access_token);

        // Retry original request with new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }
        return api(originalRequest);

      } catch (refreshError) {
        // Refresh failed, clear everything
        isRefreshing = false;
        onRefreshFailed();
        clearAuthCookies();
        return Promise.reject(refreshError);
      }
    }

    // Show toast for errors (except for refresh requests to avoid infinite loops)
    if (!isRefreshRequest) {
      const errorMessage = getErrorMessage(error);
      toastStore.show(errorMessage, 'error');
    }

    return Promise.reject(error);
  }
);

// API Types
export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  twoFactorEnabled?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: User;
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

// Auth API
export const authApi = {
  register: (email: string, password: string, name: string) =>
    api.post<{ user: User }>('/auth/register', { email, password, name }),

  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),

  getCurrentUser: () =>
    api.get<User>('/auth/me'),

  logout: () =>
    api.post('/auth/logout'),

  refreshToken: (refreshToken: string) =>
    api.post<LoginResponse>('/auth/refresh', { refreshToken }),

  revokeAll: () =>
    api.post<{ message: string; count: number }>('/auth/revoke-all'),
};

// Session API
export const sessionApi = {
  getSessions: async () => {
    const response = await api.get<{ sessions: Session[] }>('/auth/sessions');
    return response.data.sessions;
  },

  revokeSession: (sessionId: string) =>
    api.delete<{ message: string }>(`/auth/sessions/${sessionId}`),

  revokeAllOtherSessions: () =>
    api.delete<{ message: string }>('/auth/sessions/others'),
};

// 2FA API
export const twoFactorApi = {
  setup: async () => {
    const response = await api.post<TwoFactorSetup>('/auth/2fa/setup');
    return response.data;
  },

  // Validate TOTP code after initial setup (activates 2FA)
  validate: (code: string) =>
    api.post<{ message: string; enabled: boolean }>('/auth/2fa/validate', { code }),

  // Verify TOTP code during login
  verify: (code: string) =>
    api.post<{ message: string; success: boolean }>('/auth/2fa/verify', { code }),

  disable: (code: string) =>
    api.post<{ message: string; enabled: boolean }>('/auth/2fa/disable', { code }),

  regenerateBackupCodes: (code: string) =>
    api.post<{ message: string; backupCodes: string[] }>('/auth/2fa/backup-codes/regenerate', { code }),

  getStatus: () =>
    api.get<TwoFactorStatus>('/auth/2fa/status'),
};

// Email Verification API
export const emailApi = {
  sendVerification: () =>
    api.post<{ message: string; expiresIn: number }>('/auth/email/send-verification'),

  verify: (token: string) =>
    api.post<{ message: string; verified: boolean }>('/auth/email/verify', { token }),

  getStatus: () =>
    api.get<{ verified: boolean; email: string }>('/auth/email/verification-status'),
};

// Password Reset API
export const passwordApi = {
  forgot: (email: string) =>
    api.post<{ message: string; expiresIn?: number }>('/auth/password/forgot', { email }),

  reset: (token: string, newPassword: string) =>
    api.post<{ message: string; success: boolean }>('/auth/password/reset', { token, newPassword }),

  verifyToken: (token: string) =>
    api.post<{ valid: boolean; email?: string }>('/auth/password/verify-token', { token }),
};

// Magic Link API
export const magicLinkApi = {
  send: (email: string) =>
    api.post<{ message: string; expiresIn: number }>('/auth/magic-link/send', { email }),

  verify: (token: string) =>
    api.post<LoginResponse>('/auth/magic-link/verify', { token }),

  verifyGet: (token: string) =>
    api.get<LoginResponse>(`/auth/magic-link/verify/${token}`),
};

// OAuth API
export const oauthApi = {
  getAuthUrl: (provider: string) =>
    api.get<{ url: string; state?: string }>(`/auth/oauth/${provider}`),

  // Callback est géré par le backend directement
};

// Guest Session API
export const guestSessionApi = {
  create: (metadata?: Record<string, unknown>) =>
    api.post<{ guest_token: string; expires_at: string; created_at: string }>('/auth/guest/create', { metadata }),

  get: (token: string) =>
    api.get<GuestSession>(`/auth/guest/${token}`),

  convert: (guestToken: string, email: string, password?: string, name?: string) =>
    api.post<{
      message: string;
      user: { id: string; email: string; name: string };
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    }>('/auth/guest/convert', { guest_token: guestToken, email, password, name }),

  delete: (token: string) =>
    api.delete<{ message: string }>(`/auth/guest/${token}`),
};
