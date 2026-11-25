import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    api('/api/auth/me')
      .then((d) => { if (d?.username) setUser(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
    const onExpired = () => { setUser((u) => { if (u) setExpired(true); return null; }); };
    window.addEventListener('sc:auth-expired', onExpired);
    return () => window.removeEventListener('sc:auth-expired', onExpired);
  }, []);

  const login = useCallback((u) => { setUser(u); setExpired(false); }, []);
  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    try { sessionStorage.removeItem('sc.term.tabs'); } catch {}
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, expired, login, logout }), [user, loading, expired, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
