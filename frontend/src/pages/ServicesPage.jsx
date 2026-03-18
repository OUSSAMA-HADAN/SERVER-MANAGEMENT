import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../App.jsx';

const SERVICE_ICONS = {
  nginx: '⬡', cloudflared: '☁', docker: '◈',
  ssh: '🔑', ufw: '🛡', cron: '⏰',
};

function ServiceCard({ name, status, onAction, actioning }) {
  const isActive = status === 'active';
  const icon = SERVICE_ICONS[name] || '⚙';

  return (
    <div className="card bracket fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '20px', opacity: 0.65, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '13px', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.08em', marginTop: '2px' }}>systemd unit</div>
        </div>
        <span className={`badge badge-${isActive ? 'active' : 'inactive'}`}>
          {isActive ? '● active' : '○ inactive'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button
          className="btn btn-green"
          disabled={!!actioning || isActive}
          onClick={() => onAction(name, 'start')}
          style={{ opacity: isActive ? 0.4 : 1 }}
        >
          {actioning === `${name}-start` ? <span className="spinner" /> : '▶ start'}
        </button>
        <button
          className="btn btn-red"
          disabled={!!actioning || !isActive}
          onClick={() => onAction(name, 'stop')}
          style={{ opacity: !isActive ? 0.4 : 1 }}
        >
          {actioning === `${name}-stop` ? <span className="spinner" /> : '■ stop'}
        </button>
        <button
          className="btn btn-muted"
          disabled={!!actioning}
          onClick={() => onAction(name, 'restart')}
        >
          {actioning === `${name}-restart` ? <span className="spinner" /> : '↺ restart'}
        </button>
      </div>
    </div>
  );
}

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchServices = useCallback(async () => {
    try {
      const r = await apiFetch('/api/services');
      if (r.ok) setServices(await r.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const handleAction = async (name, action) => {
    setActioning(`${name}-${action}`);
    try {
      const r = await apiFetch(`/api/services/${name}/${action}`, { method: 'POST' });
      const data = await r.json();
      if (r.ok) {
        setServices(prev => prev.map(s => s.name === name ? { ...s, status: data.status } : s));
        showToast(`${name} ${action}ed — ${data.status}`);
      } else {
        showToast(data.error || 'Failed', 'err');
      }
    } catch (e) {
      showToast(e.message, 'err');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Services</h1>
          <p className="page-subtitle">systemd service control</p>
        </div>
        <button className="btn btn-green" onClick={fetchServices} disabled={loading}>
          {loading ? <span className="spinner" /> : '↻ refresh'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}><span className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
          {services.map(s => (
            <ServiceCard key={s.name} {...s} onAction={handleAction} actioning={actioning} />
          ))}
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
