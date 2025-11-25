import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { magicLinkApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { setCookie } from '@/lib/cookies';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function MagicLink() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('john.doe@example.com');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);
  const hasVerified = useRef(false);

  const verifyMagicLink = async (token: string) => {
    // Prevent double verification
    if (hasVerified.current) return;
    hasVerified.current = true;

    console.log('verifyMagicLink called with token:', token);
    try {
      setVerifying(true);
      setError('');
      console.log('Calling magicLinkApi.verify...');
      // Try GET first (for URL tokens), fallback to POST
      let response;
      try {
        response = await magicLinkApi.verifyGet(token);
      } catch (getError: any) {
        // If GET fails, try POST
        console.log('GET failed, trying POST:', getError);
        response = await magicLinkApi.verify(token);
      }
      console.log('Response received:', response);

      // Store tokens in cookies
      setCookie('access_token', response.data.access_token, 1); // 1 day
      setCookie('refresh_token', response.data.refresh_token, 7); // 7 days

      // Update user state
      setUser(response.data.user);

      // Show success and redirect
      setSuccess(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err: any) {
      console.error('Magic link verification error:', err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Invalid or expired magic link';
      setError(errorMessage);
      setVerifying(false);
      hasVerified.current = false; // Allow retry on error
    }
  };

  useEffect(() => {
    const token = searchParams.get('token');
    console.log('MagicLink: token from URL:', token);
    if (token) {
      verifyMagicLink(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await magicLinkApi.send(email);
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center animate-spin">
                <svg
                  className="h-8 w-8 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </div>
            </div>
            <CardTitle className="text-2xl text-center">Verifying magic link...</CardTitle>
            <CardDescription className="text-center">
              Please wait while we verify your magic link
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <svg
                  className="h-8 w-8 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
            <CardTitle className="text-2xl text-center">Success!</CardTitle>
            <CardDescription className="text-center">
              You've been signed in successfully. Redirecting...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <svg
                  className="h-8 w-8 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </div>
            <CardTitle className="text-2xl text-center">Check your email</CardTitle>
            <CardDescription className="text-center">
              We've sent a magic link to <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
              <p className="text-sm text-blue-800">
                Click the link in your email to sign in instantly. The link will expire in 10 minutes.
              </p>
            </div>
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSent(false)}
              >
                Send another link
              </Button>
              <div className="text-center">
                <Link to="/login" className="text-sm text-blue-600 hover:underline">
                  Back to login
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-2">
            <div className="h-12 w-12 rounded-full bg-purple-600 flex items-center justify-center">
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            </div>
          </div>
          <CardTitle className="text-2xl text-center">Sign in with Magic Link</CardTitle>
          <CardDescription className="text-center">
            No password needed. We'll email you a secure link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send magic link'}
            </Button>

            <div className="space-y-3">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or
                  </span>
                </div>
              </div>

              <div className="text-center space-y-2">
                <Link to="/login" className="text-sm text-blue-600 hover:underline block">
                  Sign in with password
                </Link>
                <div className="text-sm text-muted-foreground">
                  Don't have an account?{' '}
                  <Link to="/register" className="text-blue-600 hover:underline font-medium">
                    Sign up
                  </Link>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
