import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { ConfirmProvider } from './components/ConfirmModal.jsx';
import LoginPage from './pages/LoginPage.jsx';

// Everything behind login lives in this lazily-loaded chunk; the server only
// serves it to authenticated sessions.
const Dashboard = lazy(() => import('./Dashboard.jsx'));

function FullScreenLoader() {
  return (
    <div className="center-screen">
      <span className="spinner" role="status" aria-label="Loading" />
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return user ? <Navigate to="/" replace /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route
                path="/*"
                element={
                  <Protected>
                    <Suspense fallback={<FullScreenLoader />}>
                      <Dashboard />
                    </Suspense>
                  </Protected>
                }
              />
            </Routes>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
