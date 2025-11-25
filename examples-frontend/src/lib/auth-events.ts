/**
 * Centralized Auth Event Bus
 * Coordinates authentication events across components without tight coupling.
 *
 * Events:
 * - token-refreshed: New tokens have been obtained
 * - refresh-failed: Token refresh attempt failed
 * - refresh-started: Token refresh has started (for UI feedback)
 * - logout: User has logged out
 * - session-invalid: Session is no longer valid (server rejected)
 */

// Event type definitions
export type AuthEvent =
  | { type: 'token-refreshed'; accessToken: string; refreshToken: string; expiresIn: number }
  | { type: 'refresh-failed'; error: string }
  | { type: 'refresh-started' }
  | { type: 'logout' }
  | { type: 'session-invalid'; reason?: string };

type EventType = AuthEvent['type'];
type EventPayload<T extends EventType> = Extract<AuthEvent, { type: T }>;
type Listener<T extends EventType> = (event: EventPayload<T>) => void;

class AuthEventBus {
  private listeners = new Map<EventType, Set<Listener<any>>>();
  private debugMode = import.meta.env.DEV;

  /**
   * Emit an event to all subscribers
   */
  emit<T extends AuthEvent>(event: T): void {
    if (this.debugMode) {
      console.log(`[AuthEventBus] Emitting: ${event.type}`, event);
    }

    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      typeListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`[AuthEventBus] Error in listener for ${event.type}:`, error);
        }
      });
    }
  }

  /**
   * Subscribe to an event type
   * Returns an unsubscribe function
   */
  on<T extends EventType>(type: T, listener: Listener<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type)!.add(listener);

    if (this.debugMode) {
      console.log(`[AuthEventBus] Subscribed to: ${type}`);
    }

    // Return unsubscribe function
    return () => this.off(type, listener);
  }

  /**
   * Unsubscribe from an event type
   */
  off<T extends EventType>(type: T, listener: Listener<T>): void {
    const typeListeners = this.listeners.get(type);
    if (typeListeners) {
      typeListeners.delete(listener);

      if (this.debugMode) {
        console.log(`[AuthEventBus] Unsubscribed from: ${type}`);
      }
    }
  }

  /**
   * Subscribe to an event type for a single occurrence
   */
  once<T extends EventType>(type: T, listener: Listener<T>): () => void {
    const wrapper: Listener<T> = (event) => {
      this.off(type, wrapper);
      listener(event);
    };

    return this.on(type, wrapper);
  }

  /**
   * Remove all listeners (useful for testing)
   */
  clear(): void {
    this.listeners.clear();
    if (this.debugMode) {
      console.log('[AuthEventBus] All listeners cleared');
    }
  }

  /**
   * Get the number of listeners for a specific event type
   */
  listenerCount(type: EventType): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

// Singleton instance
export const authEvents = new AuthEventBus();

// React hook for subscribing to auth events
import { useEffect } from 'react';

export function useAuthEvent<T extends EventType>(
  type: T,
  listener: Listener<T>,
  deps: React.DependencyList = []
): void {
  useEffect(() => {
    const unsubscribe = authEvents.on(type, listener);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, ...deps]);
}
