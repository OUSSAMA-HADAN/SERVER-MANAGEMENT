import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../App.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';

function QuickCard({ icon, title, value, sub, linkTo, color = 'var(--green)' }) {
  return (
    <Link to={linkTo} style={{ textDecoration: 'none' }}>
      <div
        className="card bracket fade-in"
        style={{ cursor: 'pointer', transition: 'border-color 0.2s, box-shadow 0.2s', position: 'relative' }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = color;
          e.currentTarget.style.boxShadow = `0 0 20px ${color}18`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--muted)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '8px' }}>
              {title}
            </div>
            <div style={{ color, fontSize: 'clamp(22px, 4vw, 28px)', fontFamily: 'Syne', fontWeight: 800, lineHeight: 1 }}>
              {value}
            </div>
            {sub && <div style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '4px' }}>{sub}</div>}
          </div>
          <span style={{ fontSize: '22px', opacity: 0.2, flexShrink: 0, marginLeft: '8px' }}>{icon}</span>
        </div>
      </div>
    </Link>
  );
}

function ServiceRow({ name, status }) {
  const active = status === 'active';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 0', borderBottom: '1px solid rgba(30,30,36,0.5)',
      gap: '8px',
    }}>
      <span style={{ color: 'var(--text)', fontSize: '12px', fontFamily: 'JetBrains Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span className={`badge badge-${active ? 'active' : 'inactive'}`}>
        {active ? '● active' : '○ inactive'}
      </span>
    </div>
  );
}

export default function OverviewPage() {
  const confirm = useConfirm();
  const [services, setServices] = useState([]);
  const [containers, setContainers] = useState([]);
  const [links, setLinks] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/services').then(r => r.json()),
      apiFetch('/api/docker/containers').then(r => r.json()),
      apiFetch('/api/container-links').then(r => r.json()),
    ]).then(([s, c, l]) => {
      setServices(Array.isArray(s) ? s : []);
      setContainers(Array.isArray(c) ? c : []);
      setLinks(l || {});
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const activeServices = services.filter(s => s.status === 'active').length;
  const runningContainers = containers.filter(c => c.state === 'running').length;

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">System Overview</h1>
          <p className="page-subtitle">
            {new Date().toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {/* Quick stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '24px' }}>
        <QuickCard icon="⚙"  title="Services"   linkTo="/services"  value={loading ? '—' : `${activeServices}/${services.length}`}   sub="active" />
        <QuickCard icon="◈"  title="Containers" linkTo="/docker"    value={loading ? '—' : `${runningContainers}/${containers.length}`} sub="running" />
        <QuickCard icon="▦"  title="Processes"  linkTo="/processes" value="top 40"  sub="by CPU"    color="#00b8e8" />
        <QuickCard icon=">_" title="Terminal"   linkTo="/terminal"  value="bash"    sub="live shell" color="var(--yellow)" />
      </div>

      {/* Two-column cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '16px' }}>

        {/* Services */}
        <div className="card">
          <div className="section-header">
            <span style={{ color: 'var(--green)', fontSize: '13px' }}>⚙</span>
            <h2>Services</h2>
            <Link to="/services" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: '11px', textDecoration: 'none', flexShrink: 0 }}>
              manage →
            </Link>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}><span className="spinner" /></div>
          ) : (
            services.map(s => <ServiceRow key={s.name} {...s} />)
          )}
        </div>

        {/* Docker */}
        <div className="card">
          <div className="section-header">
            <span style={{ color: 'var(--green)', fontSize: '13px' }}>◈</span>
            <h2>Containers</h2>
            <Link to="/docker" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: '11px', textDecoration: 'none', flexShrink: 0 }}>
              manage →
            </Link>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}><span className="spinner" /></div>
          ) : containers.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '20px 0', margin: 0 }}>No containers found</p>
          ) : (
            containers.slice(0, 6).map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: '1px solid rgba(30,30,36,0.5)', gap: '8px',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text)', fontSize: '12px', fontFamily: 'JetBrains Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.image}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                  <span className={`badge badge-${c.state === 'running' ? 'running' : 'exited'}`}>{c.state}</span>
                  {links[c.name] && (
                    <a href={links[c.name]} target="_blank" rel="noopener noreferrer" className="btn btn-muted" style={{ padding: '2px 8px', textDecoration: 'none' }}>↗</a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Terminal hint */}
      <div style={{
        padding: '11px 16px',
        background: 'rgba(0,232,162,0.04)',
        border: '1px solid rgba(0,232,162,0.1)',
        borderRadius: '4px',
        display: 'flex', alignItems: 'center', gap: '10px',
        marginBottom: '10px',
      }}>
        <span style={{ color: 'var(--green)', fontSize: '12px', flexShrink: 0 }}>{'>'}_</span>
        <span style={{ color: 'var(--muted)', fontSize: '12px', fontFamily: 'JetBrains Mono' }}>
          Live terminal — <Link to="/terminal" style={{ color: 'var(--green)', textDecoration: 'none' }}>open bash shell</Link>
        </span>
      </div>

      {/* Power controls */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          className="btn"
          style={{ background: 'rgba(232,100,0,0.08)', border: '1px solid rgba(232,100,0,0.28)', color: '#e86400' }}
          onClick={async () => {
            if (!await confirm('Restart the server?', { detail: 'The server will reboot. You will lose the current session.', danger: true })) return;
            await apiFetch('/api/system/restart', { method: 'POST' });
          }}
        >
          ↺ Restart
        </button>
        <button
          className="btn"
          style={{ background: 'rgba(232,0,0,0.08)', border: '1px solid rgba(232,0,0,0.28)', color: '#e84040' }}
          onClick={async () => {
            if (!await confirm('Shut down the server?', { detail: 'The server will power off completely.', danger: true })) return;
            await apiFetch('/api/system/shutdown', { method: 'POST' });
          }}
        >
          ⏻ Shutdown
        </button>
      </div>
    </div>
  );
}
