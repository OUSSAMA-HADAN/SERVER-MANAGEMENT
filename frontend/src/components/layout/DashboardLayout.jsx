import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { SERVER_NAME, APP_TITLE } from '../../lib/api.js';
import Icon from '../Icon.jsx';
import NotificationToggle from '../NotificationToggle.jsx';
import StatsStrip from './StatsStrip.jsx';

const TerminalPage = lazy(() => import('../../pages/TerminalPage.jsx'));

const NAV = [
  { to: '/', label: 'Overview', icon: 'overview', end: true },
  { to: '/services', label: 'Services', icon: 'services' },
  { to: '/docker', label: 'Docker', icon: 'docker' },
  { to: '/processes', label: 'Processes', icon: 'processes' },
  { to: '/terminal', label: 'Terminal', icon: 'terminal' },
];

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const online = useOnline();
  const onTerminal = pathname === '/terminal';
  const [terminalMounted, setTerminalMounted] = useState(onTerminal);

  useEffect(() => { if (onTerminal) setTerminalMounted(true); }, [onTerminal]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <div className="shell">
        <aside className="sidebar">
          <Link to="/" className="brand" aria-label={`${APP_TITLE} home`}>
            <span className="brand-mark" aria-hidden="true"><Icon name="skull" size={20} /></span>
            <span style={{ minWidth: 0 }}>
              <span className="brand-name" style={{ display: 'block' }}>{APP_TITLE}</span>
              <span className="brand-host truncate" style={{ display: 'block' }}>{SERVER_NAME}</span>
            </span>
          </Link>

          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
                <Icon name={n.icon} size={18} />
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-foot">
            <NotificationToggle />
            <div className="user-chip">
              <span className="avatar" aria-hidden="true">{user?.username?.[0] || '?'}</span>
              <span className="truncate">
                <span className="sr-only">Signed in as </span>{user?.username}
              </span>
            </div>
            <button type="button" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={handleLogout}>
              <Icon name="logout" size={18} /> Sign out
            </button>
          </div>
        </aside>

        <header className="topbar">
          <Link to="/" className="topbar-brand" aria-label={`${APP_TITLE} home`}>
            <span className="brand-mark" style={{ width: 30, height: 30 }} aria-hidden="true"><Icon name="skull" size={18} /></span>
          </Link>
          <StatsStrip />
          <div className="topbar-actions">
            {!online && (
              <span className="status" data-tone="danger" role="status">
                <Icon name="offline" size={14} /> Offline
              </span>
            )}
            <span className="mobile-only"><NotificationToggle compact /></span>
            <button type="button" className="btn btn-ghost btn-icon mobile-only" onClick={handleLogout} aria-label="Sign out" title="Sign out">
              <Icon name="logout" size={18} />
            </button>
          </div>
        </header>

        <main id="main" className="main" tabIndex={-1}>
          {!onTerminal && <Outlet />}
          {terminalMounted && (
            <Suspense fallback={<div className="center-screen" style={{ height: '100%' }}><span className="spinner" role="status" aria-label="Loading terminal" /></div>}>
              <TerminalPage active={onTerminal} />
            </Suspense>
          )}
        </main>

        <nav className="bottom-nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="bottom-link">
              <span className="bottom-ico"><Icon name={n.icon} size={20} /></span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  );
}
