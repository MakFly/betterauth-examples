import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setTokens } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');
    const provider = searchParams.get('provider');
    const errorParam = searchParams.get('error');
    const isNewUser = searchParams.get('new_user') === '1';

    if (errorParam) {
      setStatus('error');
      setError(errorParam);
      setTimeout(() => navigate('/login?error=' + encodeURIComponent(errorParam)), 2000);
      return;
    }

    if (!accessToken || !refreshToken) {
      setStatus('error');
      setError('Missing authentication tokens');
      setTimeout(() => navigate('/login?error=missing_tokens'), 2000);
      return;
    }

    // Store tokens and redirect to dashboard
    try {
      setTokens(accessToken, refreshToken);
      setStatus('success');

      // Redirect based on whether it's a new user
      const destination = isNewUser ? '/dashboard?welcome=1' : '/dashboard';
      setTimeout(() => navigate(destination), 1000);
    } catch (err) {
      setStatus('error');
      setError('Failed to save authentication');
      setTimeout(() => navigate('/login?error=save_failed'), 2000);
    }
  }, [searchParams, navigate, setTokens]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">
            {status === 'loading' && 'Authenticating...'}
            {status === 'success' && 'Success!'}
            {status === 'error' && 'Authentication Failed'}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          {status === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="text-muted-foreground">Completing OAuth authentication...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-muted-foreground">Redirecting to dashboard...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-red-600">{error}</p>
              <p className="text-muted-foreground text-sm">Redirecting to login...</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
