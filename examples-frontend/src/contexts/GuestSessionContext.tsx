import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { guestSessionApi, type GuestSession } from '../lib/fetch-client';
import { getGuestToken, setGuestToken, clearGuestToken } from '../lib/cookies';
import { useAuth } from './AuthContext';
import { setCookie } from '../lib/cookies';

interface GuestSessionContextType {
  guestSession: GuestSession | null;
  loading: boolean;
  isGuest: boolean;
  createSession: (metadata?: Record<string, unknown>) => Promise<void>;
  convertToUser: (email: string, password?: string, name?: string) => Promise<void>;
  clearSession: () => void;
}

const GuestSessionContext = createContext<GuestSessionContextType | undefined>(undefined);

export function GuestSessionProvider({ children }: { children: ReactNode }) {
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null);
  const [loading, setLoading] = useState(true);
  const { setUser, isAuthenticated } = useAuth();
  const hasInitialized = useRef(false);

  useEffect(() => {
    // If user is authenticated, clear guest session
    if (isAuthenticated) {
      clearGuestToken();
      setGuestSession(null);
      setLoading(false);
      hasInitialized.current = false; // Reset on auth change
      return;
    }

    // Prevent double execution in StrictMode
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Check for existing guest token
    const token = getGuestToken();
    if (token) {
      const loadGuestSession = async () => {
        try {
          const response = await guestSessionApi.get(token);
          setGuestSession(response.data);
        } catch (error) {
          console.error('Failed to load guest session:', error);
          clearGuestToken();
          setGuestSession(null);
        } finally {
          setLoading(false);
        }
      };
      loadGuestSession();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const createSession = async (metadata?: Record<string, unknown>) => {
    try {
      const response = await guestSessionApi.create(metadata);
      const { guest_token, expires_at, created_at } = response.data;

      // Store token in cookie
      setGuestToken(guest_token, 1); // 1 day

      setGuestSession({
        guest_token,
        expires_at,
        created_at,
      });
    } catch (error) {
      console.error('Failed to create guest session:', error);
      throw error;
    }
  };

  const convertToUser = async (email: string, password?: string, name?: string) => {
    if (!guestSession?.guest_token) {
      throw new Error('No guest session to convert');
    }

    try {
      const response = await guestSessionApi.convert(
        guestSession.guest_token,
        email,
        password,
        name
      );

      const { user, access_token, refresh_token } = response.data;

      // Store auth tokens
      setCookie('access_token', access_token, 1);
      setCookie('refresh_token', refresh_token, 7);

      // Clear guest session
      clearGuestToken();
      setGuestSession(null);

      // Update auth context with new user
      setUser({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: false,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to convert guest session:', error);
      throw error;
    }
  };

  const clearSession = () => {
    if (guestSession?.guest_token) {
      guestSessionApi.delete(guestSession.guest_token).catch(console.error);
    }
    clearGuestToken();
    setGuestSession(null);
  };

  return (
    <GuestSessionContext.Provider
      value={{
        guestSession,
        loading,
        isGuest: !!guestSession,
        createSession,
        convertToUser,
        clearSession,
      }}
    >
      {children}
    </GuestSessionContext.Provider>
  );
}

export function useGuestSession() {
  const context = useContext(GuestSessionContext);
  if (!context) {
    throw new Error('useGuestSession must be used within GuestSessionProvider');
  }
  return context;
}
