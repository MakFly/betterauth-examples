/**
 * Cookie utilities for secure token storage
 */

const COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'Lax' as const,
  secure: import.meta.env.PROD, // HTTPS only in production
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

export function setCookie(name: string, value: string, days?: number): void {
  const expires = days
    ? `; expires=${new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString()}`
    : '';
  const secure = COOKIE_OPTIONS.secure ? '; Secure' : '';
  const sameSite = `; SameSite=${COOKIE_OPTIONS.sameSite}`;
  document.cookie = `${name}=${encodeURIComponent(value)}${expires}; path=${COOKIE_OPTIONS.path}${secure}${sameSite}`;
}

export function getCookie(name: string): string | null {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) {
      return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
  }
  return null;
}

export function deleteCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${COOKIE_OPTIONS.path};`;
}

export function clearAuthCookies(): void {
  deleteCookie('access_token');
  deleteCookie('refresh_token');
}

// Guest session cookie utilities
const GUEST_TOKEN_KEY = 'guest_token';

export function setGuestToken(token: string, days: number = 1): void {
  setCookie(GUEST_TOKEN_KEY, token, days);
}

export function getGuestToken(): string | null {
  return getCookie(GUEST_TOKEN_KEY);
}

export function clearGuestToken(): void {
  deleteCookie(GUEST_TOKEN_KEY);
}

