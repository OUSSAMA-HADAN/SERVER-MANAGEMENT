import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

const STATUS_TEXT = { ok: 'OK', warn: 'Warning', danger: 'Error', idle: 'Idle' };

/** Status pill: colour + shape + text, never colour alone. */
export function Status({ tone = 'idle', children }) {
  return (
    <span className="status" data-tone={tone}>
      <span className="status-dot" aria-hidden="true" />
      {children || STATUS_TEXT[tone]}
    </span>
  );
}

export function Meter({ value, max = 100, label, tone = 'ok', thin, valueText }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      className={`meter${thin ? ' meter-thin' : ''}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={valueText}
    >
      <div className="meter-fill" data-tone={tone} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function PageHeader({ title, subtitle, children }) {
  const ref = useRef(null);
  useEffect(() => {
    // Move focus to the page heading after client-side navigation so screen
    // readers announce the new page (skip on the very first load).
    if (window.__scNavigated) ref.current?.focus({ preventScroll: true });
    window.__scNavigated = true;
  }, []);
  return (
    <header className="page-head">
      <div style={{ minWidth: 0 }}>
        <h1 ref={ref} tabIndex={-1} className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

export function Empty({ icon = 'info', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} />
      {title && <p className="empty-title">{title}</p>}
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorAlert({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert" role="alert">
      <Icon name="alert" size={18} />
      <div style={{ flex: 1 }}>{error.message || String(error)}</div>
      {onRetry && <button type="button" className="btn btn-sm" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Sparkline({ values, max, height = 36, label }) {
  if (!values || values.length < 2) return <div className="metric-spark" aria-hidden="true" />;
  const w = 100;
  const top = max ?? Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - (Math.min(v, top) / top) * (height - 3) - 1.5]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('');
  return (
    <svg className="metric-spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={`${line}L${w},${height}L0,${height}Z`} fill="currentColor" opacity="0.12" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Button that shows a spinner while `busy`, keeping its width and label for AT. */
export function Button({ busy, icon, children, className = '', disabled, ...rest }) {
  return (
    <button type="button" className={`btn ${className}`} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}
