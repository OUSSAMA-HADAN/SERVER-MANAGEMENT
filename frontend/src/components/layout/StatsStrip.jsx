import { useMetrics } from '../../lib/metrics.jsx';
import { bytes, duration, durationLong, pct, tone } from '../../lib/format.js';
import { Meter } from '../ui.jsx';

function Item({ label, value, meter, meterLabel, t, className = '', valueText }) {
  return (
    <li className={`strip-item ${className}`}>
      <span className="strip-label">{label}</span>
      {meter !== undefined && (
        <span className="strip-bar"><Meter value={meter} label={meterLabel || label} tone={t} thin valueText={valueText || value} /></span>
      )}
      <span className={`strip-value tone-${t === 'ok' ? 'none' : t}`}>{value}</span>
    </li>
  );
}

export default function StatsStrip() {
  const { metrics: m, error } = useMetrics();
  if (!m) {
    return (
      <p className="strip muted" style={{ fontSize: 'var(--fs-sm)' }}>
        {error ? 'Live stats unavailable' : 'Loading live stats…'}
      </p>
    );
  }
  const memPct = m.memTotal ? (m.memUsed / m.memTotal) * 100 : 0;
  const diskPct = m.diskTotal ? (m.diskUsed / m.diskTotal) * 100 : 0;
  return (
    <ul className="strip" aria-label="Server status" tabIndex={0}>
      <Item label="CPU" value={pct(m.cpu)} meter={m.cpu} t={tone(m.cpu, 70, 90)} />
      <Item label="RAM" value={pct(memPct)} meter={memPct} t={tone(memPct, 80, 92)} valueText={`${pct(memPct)}, ${bytes(m.memUsed)} of ${bytes(m.memTotal)}`} />
      <Item label="Disk" value={pct(diskPct)} meter={diskPct} t={tone(diskPct, 80, 92)} className="hide-mobile" />
      {m.temp != null && <Item label="Temp" value={`${m.temp}°C`} t={tone(m.temp, 70, 85)} />}
      <li className="strip-item hide-mobile">
        <span className="strip-label">Up</span>
        <span className="strip-value" aria-label={durationLong(m.uptime)}>{duration(m.uptime)}</span>
      </li>
    </ul>
  );
}
