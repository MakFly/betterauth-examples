import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { authApi, type User, type LoginResponse } from '../lib/fetch-client';
import { getCookie, setCookie, clearAuthCookies } from '../lib/cookies';
import { authEvents, useAuthEvent } from '../lib/auth-events';
import { markTokensIssued, clearTokenTracking } from '../lib/token-refresh';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isRefreshing: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  login2fa: (email: string, password: string, code: string) => Promise<LoginResponse>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasInitialized = useRef(false);

  const refreshUser = useCallback(async () => {
    try {
      const user = await authApi.getCurrentUser();
      setUser(user);
    } catch (error) {
      console.error('Failed to refresh user:', error);
      clearAuthCookies();
      clearTokenTracking();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to auth events
  useAuthEvent('token-refreshed', async () => {
    console.log('[AuthContext] Token refreshed, refreshing user data...');
    setIsRefreshing(false);
    // Refresh user data after token refresh to keep it in sync
    await refreshUser();
  }, [refreshUser]);

  useAuthEvent('refresh-started', () => {
    setIsRefreshing(true);
  }, []);

  useAuthEvent('refresh-failed', () => {
    console.log('[AuthContext] Token refresh failed, logging out...');
    setIsRefreshing(false);
    setUser(null);
    clearAuthCookies();
    clearTokenTracking();
  }, []);

  useAuthEvent('session-invalid', (event) => {
    console.log('[AuthContext] Session invalid:', event.reason);
    setUser(null);
    clearAuthCookies();
    clearTokenTracking();
  }, []);

  useAuthEvent('logout', () => {
    setUser(null);
    clearAuthCookies();
    clearTokenTracking();
  }, []);

  // Initialize auth state
  useEffect(() => {
    // Prevent double execution in StrictMode
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const token = getCookie('access_token');
    // Clean up invalid tokens (string 'undefined' or 'null')
    if (token === 'undefined' || token === 'null') {
      clearAuthCookies();
      clearTokenTracking();
      setLoading(false);
      return;
    }
    if (token) {
      refreshUser();
    } else {
      setLoading(false);
    }
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResponse> => {
    const response = await authApi.login(email, password);
    const { access_token, refresh_token, expires_in, user: userData, requires2fa } = response;

    // If 2FA is required, don't store tokens yet
    if (requires2fa) {
      return response;
    }

    // Store tokens in cookies
    setCookie('access_token', access_token, 1); // 1 day
    setCookie('refresh_token', refresh_token, 7); // 7 days
    markTokensIssued(expires_in);
    setUser(userData);

    return response;
  }, []);

  const login2fa = useCallback(async (email: string, password: string, code: string): Promise<LoginResponse> => {
    const response = await authApi.login2fa(email, password, code);
    const { access_token, refresh_token, expires_in, user: userData } = response;

    // Store tokens in cookies
    setCookie('access_token', access_token, 1); // 1 day
    setCookie('refresh_token', refresh_token, 7); // 7 days
    markTokensIssued(expires_in);
    setUser(userData);

    return response;
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const response = await authApi.register(email, password, name);
    const { access_token, refresh_token, expires_in, user: userData } = response;

    // Store tokens in cookies (same as login)
    setCookie('access_token', access_token, 1); // 1 day
    setCookie('refresh_token', refresh_token, 7); // 7 days
    markTokensIssued(expires_in);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Emit logout event for other components
      authEvents.emit({ type: 'logout' });
      clearAuthCookies();
      clearTokenTracking();
      setUser(null);
    }
  }, []);

  // Set tokens from OAuth callback
  const setTokens = useCallback(async (accessToken: string, refreshToken: string) => {
    // Store tokens in cookies
    setCookie('access_token', accessToken, 1); // 1 day
    setCookie('refresh_token', refreshToken, 7); // 7 days
    markTokensIssued(3600); // Default 1 hour expiry

    // Fetch user data
    await refreshUser();
  }, [refreshUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isRefreshing,
        login,
        login2fa,
        register,
        logout,
        refreshUser,
        setUser,
        setTokens,
        isAuthenticated: !!user
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
