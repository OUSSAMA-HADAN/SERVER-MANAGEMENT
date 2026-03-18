import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../App.jsx';

function fmt(bytes) {
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + 'T';
  if (bytes >= 1e9)  return (bytes / 1e9).toFixed(1)  + 'G';
  if (bytes >= 1e6)  return (bytes / 1e6).toFixed(0)  + 'M';
  return (bytes / 1e3).toFixed(0) + 'K';
}

function fmtUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatItem({ label, value, pct, warn, className }) {
  const color = warn ? 'var(--red)' : 'var(--green)';
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <span style={{ color: 'var(--muted)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ width: '34px', height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.5s' }} />
      </div>
      <span style={{ color, fontSize: '11px' }}>{value}</span>
    </div>
  );
}

const HIDDEN_MOUNTS = ['/boot/efi', '/sys/firmware/efi/efivars'];
const DISK_LABELS = {
  '/': 'ROOT',
  '/mnt/sda3': 'WIN',
  '/mnt/sdb5': 'DATA',
};

export default function StatsBar() {
  const [stats, setStats] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const r = await apiFetch('/api/stats');
      if (r.ok) setStats(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 5000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  if (!stats) return (
    <div style={{ height: '40px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px', background: 'rgba(0,0,0,0.4)', gap: '8px', flexShrink: 0 }}>
      <span className="spinner" />
      <span style={{ color: 'var(--muted)', fontSize: '11px' }}>loading...</span>
    </div>
  );

  const cpuPct = Math.min(stats.cpu, 100);
  const memPct = (stats.memUsed / stats.memTotal) * 100;
  const visibleDisks = (stats.disks || []).filter(d => !HIDDEN_MOUNTS.includes(d.mount));

  return (
    <div style={{
      height: '40px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      background: 'rgba(0,0,0,0.5)',
      gap: '14px',
      overflowX: 'auto',
      overflowY: 'hidden',
      WebkitOverflowScrolling: 'touch',
      flexShrink: 0,
      scrollbarWidth: 'none',
    }}>
      {/* Hostname */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <div className="pulse-dot" />
        <span style={{ color: 'var(--green)', fontSize: '11px', fontWeight: 700, fontFamily: 'Syne' }}>SRV0HP</span>
      </div>

      <div className="vdivider" />

      <StatItem label="CPU" value={`${cpuPct.toFixed(1)}%`} pct={cpuPct} warn={cpuPct > 80} />
      <StatItem label="RAM" value={`${fmt(stats.memUsed)}/${fmt(stats.memTotal)}`} pct={memPct} warn={memPct > 85} />

      {visibleDisks.length > 0 && (
        <>
          <div className="vdivider" />
          {visibleDisks.map(d => {
            const pct = (d.used / d.total) * 100;
            const label = DISK_LABELS[d.mount] || d.mount.split('/').pop().toUpperCase();
            return (
              <StatItem
                key={d.mount}
                label={label}
                value={`${fmt(d.used)}/${fmt(d.total)}`}
                pct={pct}
                warn={pct > 90}
              />
            );
          })}
        </>
      )}

      <div className="vdivider" />
      <span style={{ color: 'var(--muted)', fontSize: '11px', flexShrink: 0 }}>
        up {fmtUptime(stats.uptime)}
      </span>
    </div>
  );
}
