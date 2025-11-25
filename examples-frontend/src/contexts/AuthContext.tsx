import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { authApi, type User, type LoginResponse } from '../lib/api';
import { getCookie, setCookie, clearAuthCookies } from '../lib/cookies';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const hasInitialized = useRef(false);

  const refreshUser = async () => {
    try {
      const response = await authApi.getCurrentUser();
      setUser(response.data);
    } catch (error) {
      console.error('Failed to refresh user:', error);
      clearAuthCookies();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Prevent double execution in StrictMode
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const token = getCookie('access_token');
    // Clean up invalid tokens (string 'undefined' or 'null')
    if (token === 'undefined' || token === 'null') {
      clearAuthCookies();
      setLoading(false);
      return;
    }
    if (token) {
      refreshUser();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string): Promise<LoginResponse> => {
    const response = await authApi.login(email, password);
    const { access_token, refresh_token, user: userData } = response.data;

    // Store tokens in cookies
    setCookie('access_token', access_token, 1); // 1 day
    setCookie('refresh_token', refresh_token, 7); // 7 days
    setUser(userData);

    return response.data;
  };

  const register = async (email: string, password: string, name: string) => {
    await authApi.register(email, password, name);
    // User needs to login after registration
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuthCookies();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshUser,
        setUser,
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
