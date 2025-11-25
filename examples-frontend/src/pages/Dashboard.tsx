import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { twoFactorApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [loading2FA, setLoading2FA] = useState(true);
  const hasLoaded2FA = useRef(false);

  useEffect(() => {
    if (!user) {
      setLoading2FA(false);
      return;
    }

    // Prevent double execution in StrictMode
    if (hasLoaded2FA.current) return;
    hasLoaded2FA.current = true;

    const fetch2FAStatus = async () => {
      try {
        const status = await twoFactorApi.getStatus();
        setTwoFactorEnabled(status.data.enabled);
      } catch (error) {
        // If 2FA is not configured, status will be false
        setTwoFactorEnabled(false);
      } finally {
        setLoading2FA(false);
      }
    };

    fetch2FAStatus();
  }, [user]);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Navigation Bar */}
      <nav className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-primary">BetterAuth</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">
                {user?.email}
              </span>
              <Button
                variant="outline"
                onClick={handleLogout}
                disabled={loading}
              >
                {loading ? 'Logging out...' : 'Logout'}
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Welcome Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl">Welcome back, {user?.name}!</CardTitle>
              <CardDescription>
                Here's what you can do with your account
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Profile Card */}
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  <span>Profile</span>
                </CardTitle>
                <CardDescription>
                  View and edit your profile information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  Manage Profile
                </Button>
              </CardContent>
            </Card>

            {/* Sessions Card */}
            <Card
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate('/sessions')}
            >
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span>Active Sessions</span>
                </CardTitle>
                <CardDescription>
                  Manage your active sessions and devices
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  View Sessions
                </Button>
              </CardContent>
            </Card>

            {/* Two-Factor Auth Card */}
            <Card
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate('/2fa/setup')}
            >
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <span>Two-Factor Auth</span>
                </CardTitle>
                <CardDescription>
                  {twoFactorEnabled
                    ? 'Manage your two-factor authentication'
                    : 'Add an extra layer of security to your account'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {twoFactorEnabled ? (
                  <div className="flex items-center text-sm text-green-600">
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Enabled
                  </div>
                ) : (
                  <Button variant="outline" className="w-full">
                    Setup 2FA
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Email Verification Card */}
            <Card
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate('/email/verify')}
            >
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span>Email Verification</span>
                </CardTitle>
                <CardDescription>
                  {user?.emailVerified
                    ? 'Your email is verified'
                    : 'Verify your email address'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {user?.emailVerified ? (
                  <div className="flex items-center text-sm text-green-600">
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Verified
                  </div>
                ) : (
                  <Button variant="outline" className="w-full">
                    Send Verification
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Password Reset Card */}
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                    />
                  </svg>
                  <span>Change Password</span>
                </CardTitle>
                <CardDescription>
                  Update your password for security
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  Change Password
                </Button>
              </CardContent>
            </Card>

            {/* Security Overview Card */}
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <span>Security Overview</span>
                </CardTitle>
                <CardDescription>
                  View your account security status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Password:</span>
                    <span className="text-green-600">Strong</span>
                  </div>
                  <div className="flex justify-between">
                    <span>2FA:</span>
                    {loading2FA ? (
                      <span className="text-muted-foreground">Loading...</span>
                    ) : (
                      <span className={twoFactorEnabled ? 'text-green-600' : 'text-yellow-600'}>
                        {twoFactorEnabled ? 'Enabled' : 'Not enabled'}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span>Email:</span>
                    <span className={user?.emailVerified ? 'text-green-600' : 'text-yellow-600'}>
                      {user?.emailVerified ? 'Verified' : 'Not verified'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Account Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Your account details and settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Full Name</dt>
                  <dd className="mt-1 text-sm">{user?.name}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Email Address</dt>
                  <dd className="mt-1 text-sm">{user?.email}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Account Created</dt>
                  <dd className="mt-1 text-sm">
                    {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Last Login</dt>
                  <dd className="mt-1 text-sm">
                    {user?.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : 'N/A'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
