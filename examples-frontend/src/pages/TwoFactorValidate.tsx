import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { twoFactorApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { setCookie } from '@/lib/cookies';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function TwoFactorValidate() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const email = location.state?.email || '';

  const [code, setCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await twoFactorApi.validate(email, code, useBackupCode);

      // Store tokens in cookies
      setCookie('access_token', response.data.access_token, 1); // 1 day
      setCookie('refresh_token', response.data.refresh_token, 7); // 7 days

      // Update user state
      setUser(response.data.user);

      // Navigate to dashboard
      navigate('/dashboard');
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
        useBackupCode
          ? 'Invalid backup code'
          : 'Invalid verification code'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Invalid Access</CardTitle>
            <CardDescription className="text-center">
              Please log in first
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => navigate('/login')}
            >
              Go to Login
            </Button>
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
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
          </div>
          <CardTitle className="text-2xl text-center">
            {useBackupCode ? 'Enter Backup Code' : 'Two-Factor Authentication'}
          </CardTitle>
          <CardDescription className="text-center">
            {useBackupCode
              ? 'Enter one of your backup codes'
              : 'Enter the code from your authenticator app'}
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
              <Label htmlFor="code">
                {useBackupCode ? 'Backup Code' : 'Authentication Code'}
              </Label>
              <Input
                id="code"
                type="text"
                placeholder={useBackupCode ? 'XXXX-XXXX-XXXX' : '000000'}
                maxLength={useBackupCode ? 14 : 6}
                value={code}
                onChange={(e) => {
                  if (useBackupCode) {
                    setCode(e.target.value);
                  } else {
                    setCode(e.target.value.replace(/\D/g, ''));
                  }
                }}
                className="text-center text-2xl tracking-widest"
                disabled={loading}
                required
              />
              <p className="text-xs text-muted-foreground text-center">
                {useBackupCode
                  ? 'Each backup code can only be used once'
                  : 'Enter the 6-digit code from your authenticator app'}
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || (!useBackupCode && code.length !== 6) || (useBackupCode && !code)}
            >
              {loading ? 'Verifying...' : 'Verify'}
            </Button>

            <div className="space-y-2">
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

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setUseBackupCode(!useBackupCode);
                  setCode('');
                  setError('');
                }}
              >
                {useBackupCode ? 'Use authenticator code' : 'Use backup code'}
              </Button>
            </div>

            <div className="text-center">
              <Link to="/login" className="text-sm text-blue-600 hover:underline">
                Back to login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
