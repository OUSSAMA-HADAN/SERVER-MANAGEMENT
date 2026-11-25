const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function bytes(n, digits = 1) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), UNITS.length - 1);
  const v = n / 1024 ** i;
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : digits)} ${UNITS[i]}`;
}

export const rate = (n) => `${bytes(n)}/s`;

export function duration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

/** Spoken form for screen readers, e.g. "3 days 4 hours". */
export function durationLong(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const parts = [
    [Math.floor(s / 86400), 'day'],
    [Math.floor((s % 86400) / 3600), 'hour'],
    [Math.floor((s % 3600) / 60), 'minute'],
  ].filter(([v]) => v > 0).slice(0, 2);
  if (!parts.length) return `${s} seconds`;
  return parts.map(([v, u]) => `${v} ${u}${v === 1 ? '' : 's'}`).join(' ');
}

export function since(ts) {
  if (!ts) return '';
  return duration((Date.now() - ts) / 1000);
}

export const pct = (v, digits = 0) => `${(Number.isFinite(v) ? v : 0).toFixed(digits)}%`;

export function tone(value, warn, danger) {
  if (value >= danger) return 'danger';
  if (value >= warn) return 'warn';
  return 'ok';
}
