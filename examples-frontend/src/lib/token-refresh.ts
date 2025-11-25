/**
 * Centralized Token Refresh Service
 *
 * Features:
 * - Mutex pattern prevents concurrent refresh attempts
 * - Request queue pauses all requests during refresh
 * - Cross-tab synchronization via localStorage events
 * - Event bus integration for component coordination
 * - No external dependencies (uses native fetch)
 */

import { getCookie, setCookie, clearAuthCookies } from './cookies';
import { authEvents } from './auth-events';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const API_AUTH_PREFIX = import.meta.env.VITE_API_AUTH_PREFIX || '/api/v1';

// ============================================
// TYPES
// ============================================

export interface RefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

// Storage keys for token tracking
export const TOKEN_ISSUED_AT_KEY = 'token_issued_at';
export const TOKEN_LIFETIME_KEY = 'token_lifetime';
export const REFRESH_TOKEN_ISSUED_AT_KEY = 'refresh_token_issued_at';
const REFRESH_TOKEN_LIFETIME = 2592000; // 30 days in seconds

// ============================================
// REQUEST QUEUE
// Pauses all requests during token refresh
// ============================================

class RequestQueue {
  private waitingRequests: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  private _isPaused = false;

  get isPaused(): boolean {
    return this._isPaused;
  }

  get pendingCount(): number {
    return this.waitingRequests.length;
  }

  pause(): void {
    this._isPaused = true;
    console.log('[RequestQueue] Paused - queuing new requests');
  }

  resume(): void {
    this._isPaused = false;
    console.log(`[RequestQueue] Resumed - releasing ${this.waitingRequests.length} queued requests`);

    // Release all waiting requests
    while (this.waitingRequests.length > 0) {
      const request = this.waitingRequests.shift();
      request?.resolve();
    }
  }

  rejectAll(error: Error): void {
    console.log(`[RequestQueue] Rejecting ${this.waitingRequests.length} queued requests`);

    while (this.waitingRequests.length > 0) {
      const request = this.waitingRequests.shift();
      request?.reject(error);
    }
    this._isPaused = false;
  }

  /**
   * Wait if the queue is paused
   * Returns immediately if not paused
   */
  async waitIfPaused(): Promise<void> {
    if (!this._isPaused) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.waitingRequests.push({ resolve, reject });
    });
  }
}

export const requestQueue = new RequestQueue();

// ============================================
// REFRESH STATE
// ============================================

let isRefreshing = false;
let refreshPromise: Promise<RefreshResult> | null = null;

// ============================================
// CROSS-TAB SYNCHRONIZATION
// ============================================

/**
 * Check if another tab has recently refreshed the token
 * Prevents duplicate refresh requests across tabs
 */
function wasRecentlyRefreshed(): boolean {
  const lastRefresh = localStorage.getItem(TOKEN_ISSUED_AT_KEY);
  if (!lastRefresh) return false;

  const elapsed = Date.now() - parseInt(lastRefresh, 10);
  // Consider "recent" if refreshed within last 5 seconds
  return elapsed < 5000;
}

/**
 * Check if the refresh token is expired
 */
function isRefreshTokenExpired(): boolean {
  const refreshIssuedAt = localStorage.getItem(REFRESH_TOKEN_ISSUED_AT_KEY);
  if (!refreshIssuedAt) return false;

  const issuedAt = parseInt(refreshIssuedAt, 10);
  const expiresAt = issuedAt + REFRESH_TOKEN_LIFETIME * 1000;

  return Date.now() > expiresAt;
}

/**
 * Get current token info from localStorage
 */
export function getTokenInfo(): {
  accessTokenExpiresAt: number | null;
  refreshTokenExpiresAt: number | null;
  tokenLifetime: number;
} {
  const accessIssuedAt = localStorage.getItem(TOKEN_ISSUED_AT_KEY);
  const refreshIssuedAt = localStorage.getItem(REFRESH_TOKEN_ISSUED_AT_KEY);
  const tokenLifetime = parseInt(localStorage.getItem(TOKEN_LIFETIME_KEY) || '3600', 10);

  return {
    accessTokenExpiresAt: accessIssuedAt
      ? parseInt(accessIssuedAt, 10) + tokenLifetime * 1000
      : null,
    refreshTokenExpiresAt: refreshIssuedAt
      ? parseInt(refreshIssuedAt, 10) + REFRESH_TOKEN_LIFETIME * 1000
      : null,
    tokenLifetime,
  };
}

// Listen for storage changes from other tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === TOKEN_ISSUED_AT_KEY && event.newValue) {
      // Another tab has refreshed the token
      console.log('[TokenRefresh] Cross-tab: Token refreshed in another tab');

      // Read the new token from cookies (they're shared across tabs)
      const accessToken = getCookie('access_token');
      const refreshToken = getCookie('refresh_token');
      const expiresIn = parseInt(localStorage.getItem(TOKEN_LIFETIME_KEY) || '3600', 10);

      if (accessToken && refreshToken) {
        // Emit event so components can react
        authEvents.emit({
          type: 'token-refreshed',
          accessToken,
          refreshToken,
          expiresIn,
        });
      }
    }
  });
}

// ============================================
// MAIN REFRESH FUNCTION
// ============================================

/**
 * Centralized token refresh function
 * Uses mutex pattern to prevent concurrent refresh attempts
 * All refresh attempts will wait for the ongoing refresh to complete
 */
export async function refreshTokens(): Promise<RefreshResult> {
  const currentRefreshToken = getCookie('refresh_token');

  // No refresh token available
  if (!currentRefreshToken || currentRefreshToken === 'undefined' || currentRefreshToken === 'null') {
    const result: RefreshResult = { success: false, error: 'No refresh token available' };
    authEvents.emit({ type: 'refresh-failed', error: result.error! });
    return result;
  }

  // Check if refresh token is expired
  if (isRefreshTokenExpired()) {
    console.log('[TokenRefresh] Refresh token expired');
    clearAuthCookies();
    clearTokenTracking();
    const result: RefreshResult = { success: false, error: 'Refresh token expired' };
    authEvents.emit({ type: 'session-invalid', reason: 'Refresh token expired' });
    return result;
  }

  // Check if another tab recently refreshed
  if (wasRecentlyRefreshed()) {
    console.log('[TokenRefresh] Token was recently refreshed (cross-tab)');
    const accessToken = getCookie('access_token');
    const refreshToken = getCookie('refresh_token');
    const expiresIn = parseInt(localStorage.getItem(TOKEN_LIFETIME_KEY) || '3600', 10);

    if (accessToken && refreshToken) {
      return {
        success: true,
        accessToken,
        refreshToken,
        expiresIn,
      };
    }
  }

  // If already refreshing, wait for the ongoing refresh
  if (isRefreshing && refreshPromise) {
    console.log('[TokenRefresh] Waiting for ongoing refresh...');
    return refreshPromise;
  }

  // Start new refresh
  isRefreshing = true;
  requestQueue.pause();
  authEvents.emit({ type: 'refresh-started' });

  console.log('[TokenRefresh] Starting token refresh...');

  refreshPromise = performRefresh(currentRefreshToken);

  try {
    const result = await refreshPromise;

    if (result.success) {
      // Resume queued requests with new token
      requestQueue.resume();
    } else {
      // Reject all queued requests
      requestQueue.rejectAll(new Error(result.error || 'Token refresh failed'));
    }

    return result;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

/**
 * Actual refresh API call using native fetch
 */
async function performRefresh(refreshToken: string): Promise<RefreshResult> {
  try {
    const response = await fetch(`${API_BASE_URL}${API_AUTH_PREFIX}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Backend format: { success: false, error: { code: "...", message: "..." } }
      const errorMessage = 
        (errorData.error?.message) || 
        (errorData.error?.code) || 
        (typeof errorData.error === 'string' ? errorData.error : null) ||
        errorData.message ||
        `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Backend returns { success: true, data: { auth: { accessToken, refreshToken, ... } } }
    let access_token: string;
    let newRefreshToken: string;
    let expires_in: number;

    if (data.success && data.data?.auth) {
      access_token = data.data.auth.accessToken;
      newRefreshToken = data.data.auth.refreshToken;
      expires_in = data.data.auth.expiresIn;
    } else if (data.access_token) {
      // Fallback: direct format
      access_token = data.access_token;
      newRefreshToken = data.refresh_token || data.refreshToken;
      expires_in = data.expires_in || data.expiresIn;
    } else {
      throw new Error('Invalid refresh response format');
    }

    // Store new tokens in cookies
    setCookie('access_token', access_token, 1); // 1 day
    setCookie('refresh_token', newRefreshToken, 7); // 7 days

    // Track token issuance time and lifetime
    const now = Date.now();
    localStorage.setItem(TOKEN_ISSUED_AT_KEY, now.toString());
    localStorage.setItem(REFRESH_TOKEN_ISSUED_AT_KEY, now.toString());
    if (expires_in) {
      localStorage.setItem(TOKEN_LIFETIME_KEY, expires_in.toString());
    }

    console.log('[TokenRefresh] Token refresh successful');

    const result: RefreshResult = {
      success: true,
      accessToken: access_token,
      refreshToken: newRefreshToken,
      expiresIn: expires_in,
    };

    // Emit success event
    authEvents.emit({
      type: 'token-refreshed',
      accessToken: access_token,
      refreshToken: newRefreshToken,
      expiresIn: expires_in,
    });

    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TokenRefresh] Token refresh failed:', errorMessage);

    // Clear auth on refresh failure
    clearAuthCookies();
    clearTokenTracking();

    const result: RefreshResult = {
      success: false,
      error: errorMessage,
    };

    // Emit failure event
    authEvents.emit({ type: 'refresh-failed', error: errorMessage });

    return result;
  }
}

/**
 * Clear token tracking data from localStorage
 */
export function clearTokenTracking(): void {
  localStorage.removeItem(TOKEN_ISSUED_AT_KEY);
  localStorage.removeItem(TOKEN_LIFETIME_KEY);
  localStorage.removeItem(REFRESH_TOKEN_ISSUED_AT_KEY);
}

/**
 * Mark tokens as issued (called after login/register)
 */
export function markTokensIssued(expiresIn?: number): void {
  const now = Date.now();
  localStorage.setItem(TOKEN_ISSUED_AT_KEY, now.toString());
  localStorage.setItem(REFRESH_TOKEN_ISSUED_AT_KEY, now.toString());
  if (expiresIn) {
    localStorage.setItem(TOKEN_LIFETIME_KEY, expiresIn.toString());
  }
}

/**
 * Check if a refresh is currently in progress
 */
export function isRefreshInProgress(): boolean {
  return isRefreshing;
}

/**
 * Get the current refresh promise if one is in progress
 */
export function getRefreshPromise(): Promise<RefreshResult> | null {
  return refreshPromise;
}
