import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { createContext, useContext, useState, useEffect } from 'react';
import { ConfirmProvider } from './components/ConfirmModal.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardLayout from './components/layout/DashboardLayout.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import ServicesPage from './pages/ServicesPage.jsx';
import DockerPage from './pages/DockerPage.jsx';
import ProcessesPage from './pages/ProcessesPage.jsx';
import TerminalPage from './pages/TerminalPage.jsx';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export const API = '';
export function apiFetch(path, opts = {}) {
  return fetch(`${API}${path}`, { credentials: 'include', ...opts });
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0a0b' }}>
      <div className="spinner" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.username) setUser(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = (userData) => setUser(userData);
  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      <ConfirmProvider>
      <div className="scanlines">
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
            <Route path="/" element={<Protected><DashboardLayout /></Protected>}>
              <Route index element={<OverviewPage />} />
              <Route path="services" element={<ServicesPage />} />
              <Route path="docker" element={<DockerPage />} />
              <Route path="processes" element={<ProcessesPage />} />
              <Route path="terminal" element={<TerminalPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </div>
      </ConfirmProvider>
    </AuthContext.Provider>
  );
}
