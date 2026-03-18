import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App.jsx';
import StatsBar from '../stats/StatsBar.jsx';
import NotificationBell from '../NotificationBell.jsx';

const NAV_ITEMS = [
  { to: '/',          exact: true, icon: '⬡',  label: 'Overview'  },
  { to: '/services',              icon: '⚙',   label: 'Services'  },
  { to: '/docker',                icon: '◈',   label: 'Docker'    },
  { to: '/processes',             icon: '▦',   label: 'Processes' },
  { to: '/terminal',              icon: '>_',  label: 'Terminal'  },
];

function SidebarLink({ to, icon, label, exact }) {
  return (
    <NavLink
      to={to}
      end={exact}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid',
        textDecoration: 'none',
        color: isActive ? 'var(--green)' : 'var(--muted)',
        background: isActive ? 'rgba(0,232,162,0.06)' : 'transparent',
        borderColor: isActive ? 'rgba(0,232,162,0.18)' : 'transparent',
        boxShadow: isActive ? 'inset 2px 0 0 var(--green)' : 'none',
        fontSize: '11px',
        fontFamily: 'JetBrains Mono, monospace',
        transition: 'all 0.15s',
        letterSpacing: '0.06em',
      })}
    >
      <span style={{ fontSize: '13px', width: '16px', textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

function BottomNavLink({ to, icon, label, exact }) {
  return (
    <NavLink
      to={to}
      end={exact}
      style={({ isActive }) => ({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2px',
        padding: '8px 4px',
        flex: 1,
        textDecoration: 'none',
        color: isActive ? 'var(--green)' : 'var(--muted)',
        fontSize: '9px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontFamily: 'JetBrains Mono',
        borderTop: isActive ? '2px solid var(--green)' : '2px solid transparent',
        background: isActive ? 'rgba(0,232,162,0.04)' : 'transparent',
        transition: 'all 0.15s',
      })}
    >
      <span style={{ fontSize: '15px', lineHeight: 1 }}>{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      <StatsBar />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar — desktop only */}
        <aside className="desktop-sidebar" style={{
          width: 'var(--sidebar-w)',
          borderRight: '1px solid var(--border)',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 100%)',
          flexDirection: 'column',
          padding: '14px 10px',
          flexShrink: 0,
        }}>
          {/* Logo */}
          <div style={{ padding: '4px 10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                fontSize: '20px', lineHeight: 1,
                filter: 'drop-shadow(0 0 8px rgba(0,232,162,0.4))',
              }}>☠</span>
              <div>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '13px', color: 'var(--text)', letterSpacing: '0.08em' }}>
                  ServerCtrl
                </div>
                <div style={{ fontSize: '9px', color: 'var(--muted)', letterSpacing: '0.12em', marginTop: '1px' }}>
                  SRV0HP
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--border)', margin: '0 4px 12px' }} />

          {/* Nav */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
            {NAV_ITEMS.map(item => <SidebarLink key={item.to} {...item} />)}
          </nav>

          {/* User + logout */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '0 10px', marginBottom: '4px' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 5px rgba(0,232,162,0.5)', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.1em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.username}
              </span>
            </div>
            <NotificationBell />
            <button
              onClick={handleLogout}
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', padding: '7px 10px' }}
            >
              ⏻ logout
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, overflow: 'auto', padding: 'var(--page-pad)' }}>
          <Outlet />
        </main>
      </div>

      {/* Floating notification bell — mobile only */}
      <div className="mobile-bottom-nav" style={{
        position: 'fixed',
        bottom: '58px',
        right: '14px',
        zIndex: 50,
      }}>
        <NotificationBell style={{
          width: 'auto',
          justifyContent: 'center',
          padding: '7px 11px',
          background: 'rgba(10,10,11,0.95)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
        }} />
      </div>

      {/* Bottom nav — mobile only */}
      <nav className="mobile-bottom-nav" style={{
        borderTop: '1px solid var(--border)',
        background: 'rgba(10,10,11,0.97)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexShrink: 0,
      }}>
        {NAV_ITEMS.map(item => <BottomNavLink key={item.to} {...item} />)}
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '2px', padding: '8px 4px', flex: 1,
            background: 'transparent', border: 'none',
            borderTop: '2px solid transparent',
            color: 'var(--muted)', fontSize: '9px',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            fontFamily: 'JetBrains Mono', cursor: 'pointer',
            transition: 'color 0.15s',
          }}
        >
          <span style={{ fontSize: '15px', lineHeight: 1 }}>⏻</span>
          <span>logout</span>
        </button>
      </nav>
    </div>
  );
}
