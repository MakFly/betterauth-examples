import { useState, useEffect, useCallback, useRef } from 'react';
import { getCookie } from '../lib/cookies';
import {
  refreshTokens,
  isRefreshInProgress,
  requestQueue,
  getTokenInfo,
  TOKEN_LIFETIME_KEY,
  TOKEN_ISSUED_AT_KEY,
} from '../lib/token-refresh';
import { useAuthEvent } from '../lib/auth-events';

interface TokenInfo {
  accessTokenExpiresAt: number | null;
  refreshTokenExpiresAt: number | null;
  lastRefreshAt: number | null;
  refreshCount: number;
  isRefreshing: boolean;
  status: 'valid' | 'expiring' | 'expired' | 'refreshing' | 'no_token';
  tokenLifetime: number;
  queuedRequests: number;
}

interface RefreshLog {
  timestamp: number;
  success: boolean;
  error?: string;
  crossTab?: boolean;
}

// Default values
const DEFAULT_TOKEN_LIFETIME = 3600; // 1 hour

export function TokenRefreshMonitor() {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo>({
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    lastRefreshAt: null,
    refreshCount: 0,
    isRefreshing: false,
    status: 'no_token',
    tokenLifetime: DEFAULT_TOKEN_LIFETIME,
    queuedRequests: 0,
  });
  const [refreshLogs, setRefreshLogs] = useState<RefreshLog[]>([]);
  const [countdown, setCountdown] = useState<string>('--:--');
  const [refreshCountdown, setRefreshCountdown] = useState<string>('--:--');
  const [expanded, setExpanded] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const autoRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get token lifetime from storage or default
  const getTokenLifetime = useCallback((): number => {
    const stored = localStorage.getItem(TOKEN_LIFETIME_KEY);
    if (stored) {
      return parseInt(stored, 10);
    }
    return DEFAULT_TOKEN_LIFETIME;
  }, []);

  // Calculate refresh threshold (refresh 5 seconds before expiry for short tokens, 5 minutes for long)
  const getRefreshThreshold = useCallback((lifetime: number): number => {
    if (lifetime <= 60) {
      return 5; // 5 seconds for demo mode
    }
    return 300; // 5 minutes for production
  }, []);

  // Calculate token expiration times
  const calculateTokenTimes = useCallback(() => {
    const accessToken = getCookie('access_token');

    if (!accessToken || accessToken === 'undefined' || accessToken === 'null') {
      setTokenInfo(prev => ({ ...prev, status: 'no_token', accessTokenExpiresAt: null }));
      return;
    }

    const { accessTokenExpiresAt, refreshTokenExpiresAt, tokenLifetime } = getTokenInfo();
    const refreshThreshold = getRefreshThreshold(tokenLifetime);
    const now = Date.now();

    // Determine status
    let status: TokenInfo['status'] = 'valid';
    if (isRefreshInProgress()) {
      status = 'refreshing';
    } else if (!accessTokenExpiresAt) {
      status = 'valid';
    } else if (now > accessTokenExpiresAt) {
      status = 'expired';
    } else if (now > accessTokenExpiresAt - (refreshThreshold * 1000)) {
      status = 'expiring';
    }

    setTokenInfo(prev => ({
      ...prev,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      status,
      tokenLifetime,
      queuedRequests: requestQueue.pendingCount,
      isRefreshing: isRefreshInProgress(),
    }));
  }, [getRefreshThreshold]);

  // Subscribe to auth events
  useAuthEvent('token-refreshed', (event) => {
    const now = Date.now();
    setTokenInfo(prev => ({
      ...prev,
      isRefreshing: false,
      lastRefreshAt: now,
      refreshCount: prev.refreshCount + 1,
      status: 'valid',
      tokenLifetime: event.expiresIn || prev.tokenLifetime,
    }));

    setRefreshLogs(prev => [...prev.slice(-9), {
      timestamp: now,
      success: true,
    }]);

    // Reschedule auto-refresh
    if (autoRefreshEnabled) {
      scheduleAutoRefresh();
    }
  }, [autoRefreshEnabled]);

  useAuthEvent('refresh-started', () => {
    setTokenInfo(prev => ({ ...prev, isRefreshing: true, status: 'refreshing' }));
  }, []);

  useAuthEvent('refresh-failed', (event) => {
    setTokenInfo(prev => ({
      ...prev,
      isRefreshing: false,
      status: 'expired',
    }));

    setRefreshLogs(prev => [...prev.slice(-9), {
      timestamp: Date.now(),
      success: false,
      error: event.error,
    }]);
  }, []);

  // Format time remaining
  const formatTimeRemaining = (targetTime: number | null): string => {
    if (!targetTime) return '--:--';

    const now = Date.now();
    const diff = targetTime - now;

    if (diff <= 0) return '00:00';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  // Perform token refresh using centralized service
  const performRefresh = useCallback(async (isAuto: boolean = false): Promise<boolean> => {
    const refreshToken = getCookie('refresh_token');
    if (!refreshToken || refreshToken === 'undefined') {
      setRefreshLogs(prev => [...prev.slice(-9), {
        timestamp: Date.now(),
        success: false,
        error: 'No refresh token',
      }]);
      return false;
    }

    // Skip if already refreshing (centralized mutex)
    if (isRefreshInProgress()) {
      console.log('[TokenMonitor] Refresh already in progress, skipping...');
      return false;
    }

    console.log(`[TokenMonitor] Triggering ${isAuto ? 'auto' : 'manual'} refresh...`);

    // Use centralized refresh service (handles everything)
    const result = await refreshTokens();

    if (result.success) {
      console.log(`[TokenMonitor] Token refreshed ${isAuto ? '(auto)' : '(manual)'} - expires in ${result.expiresIn}s`);
      return true;
    } else {
      console.error('[TokenMonitor] Token refresh failed:', result.error);
      return false;
    }
  }, []);

  // Schedule auto-refresh
  const scheduleAutoRefresh = useCallback(() => {
    if (autoRefreshTimeoutRef.current) {
      clearTimeout(autoRefreshTimeoutRef.current);
    }

    if (!autoRefreshEnabled) return;

    const accessToken = getCookie('access_token');
    if (!accessToken || accessToken === 'undefined') return;

    const tokenLifetime = getTokenLifetime();
    const refreshThreshold = getRefreshThreshold(tokenLifetime);
    const accessIssuedAt = localStorage.getItem(TOKEN_ISSUED_AT_KEY);

    if (!accessIssuedAt) return;

    const expiresAt = parseInt(accessIssuedAt, 10) + (tokenLifetime * 1000);
    const refreshAt = expiresAt - (refreshThreshold * 1000);
    const now = Date.now();
    const delay = refreshAt - now;

    if (delay <= 0) {
      // Should refresh now
      console.log('[TokenMonitor] Token expiring, refreshing now...');
      performRefresh(true);
    } else {
      // Schedule refresh
      console.log(`[TokenMonitor] Auto-refresh scheduled in ${Math.round(delay / 1000)}s`);
      autoRefreshTimeoutRef.current = setTimeout(() => {
        performRefresh(true);
      }, delay);
    }
  }, [autoRefreshEnabled, getTokenLifetime, getRefreshThreshold, performRefresh]);

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      calculateTokenTimes();

      const tokenLifetime = getTokenLifetime();
      const refreshThreshold = getRefreshThreshold(tokenLifetime);

      // Update countdown displays
      setCountdown(formatTimeRemaining(tokenInfo.accessTokenExpiresAt));

      // Calculate time until next auto-refresh
      if (tokenInfo.accessTokenExpiresAt) {
        const refreshAt = tokenInfo.accessTokenExpiresAt - (refreshThreshold * 1000);
        setRefreshCountdown(formatTimeRemaining(refreshAt));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [calculateTokenTimes, tokenInfo.accessTokenExpiresAt, getTokenLifetime, getRefreshThreshold]);

  // Initialize and schedule auto-refresh
  useEffect(() => {
    const accessToken = getCookie('access_token');
    if (accessToken && accessToken !== 'undefined') {
      // Set initial issue time if not set
      if (!localStorage.getItem(TOKEN_ISSUED_AT_KEY)) {
        localStorage.setItem(TOKEN_ISSUED_AT_KEY, Date.now().toString());
      }
      calculateTokenTimes();
      scheduleAutoRefresh();
    }

    return () => {
      if (autoRefreshTimeoutRef.current) {
        clearTimeout(autoRefreshTimeoutRef.current);
      }
    };
  }, [calculateTokenTimes, scheduleAutoRefresh]);

  // Reschedule when auto-refresh is toggled
  useEffect(() => {
    if (autoRefreshEnabled) {
      scheduleAutoRefresh();
    } else if (autoRefreshTimeoutRef.current) {
      clearTimeout(autoRefreshTimeoutRef.current);
    }
  }, [autoRefreshEnabled, scheduleAutoRefresh]);

  // Status indicator colors
  const getStatusColor = () => {
    switch (tokenInfo.status) {
      case 'valid': return 'bg-green-500';
      case 'expiring': return 'bg-yellow-500 animate-pulse';
      case 'expired': return 'bg-red-500';
      case 'refreshing': return 'bg-blue-500 animate-pulse';
      case 'no_token': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (tokenInfo.status) {
      case 'valid': return 'Valid';
      case 'expiring': return 'Expiring soon';
      case 'expired': return 'Expired';
      case 'refreshing': return 'Refreshing...';
      case 'no_token': return 'No token';
      default: return 'Unknown';
    }
  };

  const isDemoMode = tokenInfo.tokenLifetime <= 60;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className={`bg-gray-900 text-white rounded-lg shadow-lg cursor-pointer transition-all duration-300 ${
          expanded ? 'w-80' : 'w-auto'
        }`}
        onClick={() => !expanded && setExpanded(true)}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
            <span className="text-sm font-medium">Token Monitor</span>
            {isDemoMode && (
              <span className="text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded">DEMO</span>
            )}
            {tokenInfo.queuedRequests > 0 && (
              <span className="text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded">
                {tokenInfo.queuedRequests} queued
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono">{countdown}</span>
            {expanded && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="px-3 pb-3 space-y-3">
            {/* Demo mode banner */}
            {isDemoMode && (
              <div className="bg-orange-500/20 border border-orange-500/50 rounded p-2 text-xs text-orange-300">
                Mode démo actif - Token expire en {tokenInfo.tokenLifetime}s
              </div>
            )}

            {/* Status */}
            <div className="bg-gray-800 rounded p-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Status</span>
                <span className={`font-medium ${
                  tokenInfo.status === 'valid' ? 'text-green-400' :
                  tokenInfo.status === 'expiring' ? 'text-yellow-400' :
                  tokenInfo.status === 'expired' ? 'text-red-400' :
                  'text-blue-400'
                }`}>
                  {getStatusText()}
                </span>
              </div>
              {tokenInfo.queuedRequests > 0 && (
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-gray-400">Queued requests</span>
                  <span className="text-blue-400">{tokenInfo.queuedRequests}</span>
                </div>
              )}
            </div>

            {/* Timers */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-800 rounded p-2">
                <div className="text-xs text-gray-400">Token expire dans</div>
                <div className={`text-lg font-mono ${
                  tokenInfo.status === 'expiring' ? 'text-yellow-400' :
                  tokenInfo.status === 'expired' ? 'text-red-400' : 'text-white'
                }`}>
                  {countdown}
                </div>
              </div>
              <div className="bg-gray-800 rounded p-2">
                <div className="text-xs text-gray-400">Auto-refresh dans</div>
                <div className="text-lg font-mono text-blue-400">{refreshCountdown}</div>
              </div>
            </div>

            {/* Auto-refresh toggle */}
            <div className="bg-gray-800 rounded p-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">Auto-refresh</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAutoRefreshEnabled(!autoRefreshEnabled);
                }}
                className={`w-10 h-5 rounded-full transition-colors relative ${
                  autoRefreshEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  autoRefreshEnabled ? 'left-5' : 'left-0.5'
                }`} />
              </button>
            </div>

            {/* Stats */}
            <div className="bg-gray-800 rounded p-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Refresh count</span>
                <span className="text-white">{tokenInfo.refreshCount}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Token lifetime</span>
                <span className="text-white">{tokenInfo.tokenLifetime}s</span>
              </div>
              {tokenInfo.lastRefreshAt && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Last refresh</span>
                  <span className="text-white">
                    {new Date(tokenInfo.lastRefreshAt).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>

            {/* Manual refresh button */}
            <button
              onClick={(e) => { e.stopPropagation(); performRefresh(false); }}
              disabled={tokenInfo.isRefreshing || tokenInfo.status === 'no_token'}
              className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors ${
                tokenInfo.isRefreshing || tokenInfo.status === 'no_token'
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {tokenInfo.isRefreshing ? 'Refreshing...' : 'Refresh Now'}
            </button>

            {/* Refresh history */}
            {refreshLogs.length > 0 && (
              <div className="bg-gray-800 rounded p-2">
                <div className="text-xs text-gray-400 mb-1">Historique des refreshes</div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {refreshLogs.slice(-5).reverse().map((log, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={log.success ? 'text-green-400' : 'text-red-400'}>
                        {log.success ? '✓' : '✗'}
                      </span>
                      <span className="text-gray-400">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      {log.crossTab && (
                        <span className="text-blue-400">(cross-tab)</span>
                      )}
                      {log.error && (
                        <span className="text-red-400 truncate">{log.error}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Config info */}
            <div className="text-xs text-gray-500 text-center">
              Lifetime: {tokenInfo.tokenLifetime}s | Threshold: {getRefreshThreshold(tokenInfo.tokenLifetime)}s
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TokenRefreshMonitor;
