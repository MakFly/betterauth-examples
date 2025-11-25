import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { GuestSessionProvider } from './contexts/GuestSessionContext';
import { ToastProvider } from './components/ui/toast';
import { ProtectedRoute } from './components/ProtectedRoute';

// Pages
import { LoginStyled as Login } from './pages/LoginStyled';
import { RegisterStyled as Register } from './pages/RegisterStyled';
import { Dashboard } from './pages/Dashboard';
import { Sessions } from './pages/Sessions';
import { TwoFactorSetup } from './pages/TwoFactorSetup';
import { TwoFactorValidate } from './pages/TwoFactorValidate';
import { MagicLink } from './pages/MagicLink';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { EmailVerification } from './pages/EmailVerification';

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <GuestSessionProvider>
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/magic-link" element={<MagicLink />} />
              <Route path="/auth/magic-link/verify" element={<MagicLink />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/2fa/validate" element={<TwoFactorValidate />} />

              {/* Protected routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sessions"
                element={
                  <ProtectedRoute>
                    <Sessions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/2fa/setup"
                element={
                  <ProtectedRoute>
                    <TwoFactorSetup />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/email/verify"
                element={
                  <ProtectedRoute>
                    <EmailVerification />
                  </ProtectedRoute>
                }
              />

              {/* Default redirect */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </GuestSessionProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
