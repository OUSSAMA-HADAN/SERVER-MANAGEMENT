import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { bytes, duration, tone } from '../lib/format.js';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import { Button, Empty, ErrorAlert, Meter, PageHeader } from '../components/ui.jsx';

const COLUMNS = [
  { key: 'pid', label: 'PID', num: true },
  { key: 'name', label: 'Process' },
  { key: 'user', label: 'User' },
  { key: 'cpu', label: 'CPU %', num: true },
  { key: 'mem', label: 'Memory', num: true },
  { key: 'elapsed', label: 'Running', num: true },
];

export default function ProcessesPage() {
  usePageTitle('Processes');
  const confirm = useConfirm();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [live, setLive] = useState(true);
  const [sort, setSort] = useState({ key: 'cpu', dir: 'desc' });
  const [busy, setBusy] = useState(null);
  const { data, error, loading, refresh, setData } = usePolling(
    (signal) => api('/api/processes', { signal }),
    4000,
    { enabled: live },
  );

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = (data || []).filter((p) => !q || String(p.pid).includes(q) || p.cmd.toLowerCase().includes(q) || p.user.toLowerCase().includes(q));
    const { key, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))) * mul;
    });
  }, [data, filter, sort]);

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'user' ? 'asc' : 'desc' }));
  };

  const end = async (p) => {
    const choice = await confirm(`End “${p.name}” (PID ${p.pid})?`, {
      detail: `${p.cmd.slice(0, 200)}\n\n“End process” asks it to exit cleanly (SIGTERM). “Force kill” stops it immediately (SIGKILL) and may lose data.`,
      danger: true,
      confirmLabel: 'End process',
      altLabel: 'Force kill',
    });
    if (!choice) return;
    const force = choice === 'alt';
    setBusy(p.pid);
    try {
      await api(`/api/processes/${p.pid}${force ? '?signal=KILL' : ''}`, { method: 'DELETE' });
      toast.success(`${force ? 'Killed' : 'Sent SIGTERM to'} ${p.name} (${p.pid})`);
      if (force) setData((list) => list?.filter((x) => x.pid !== p.pid));
      setTimeout(refresh, 600);
    } catch (e) {
      toast.error(`${p.name}: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const cpuMax = Math.max(100, ...(data || []).map((p) => p.cpu));

  return (
    <div className="page">
      <PageHeader title="Processes" subtitle="Top processes by resource use">
        <button type="button" className="btn" aria-pressed={live} onClick={() => setLive((v) => !v)}>
          <Icon name={live ? 'pause' : 'play'} size={16} />
          {live ? 'Pause updates' : 'Resume updates'}
        </button>
        <Button icon="refresh" onClick={refresh}>Refresh</Button>
      </PageHeader>

      <div className="stack">
        <div className="row wrap">
          <div className="input-wrap search">
            <Icon name="search" size={16} className="input-icon" />
            <input
              className="input"
              type="search"
              placeholder="Filter by name, command, user or PID"
              aria-label="Filter processes"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <span className="spacer" />
          <span className="muted" role="status" style={{ fontSize: 'var(--fs-sm)' }}>
            {data ? `${rows.length} of ${data.length} processes` : ''}{!live && data ? ' · paused' : ''}
          </span>
        </div>

        <ErrorAlert error={error} onRetry={refresh} />

        {loading && !data ? <div className="card skeleton" style={{ height: 400 }} /> : rows.length === 0 ? (
          !error && <div className="card"><Empty icon="processes" title="No processes match your filter" /></div>
        ) : (
          <div className="card card-pad-0">
            <div className="table-scroll" style={{ maxHeight: 'calc(100dvh - 300px)', minHeight: 320 }}>
              <table className="table table-responsive">
                <caption className="sr-only">Processes, sorted by {COLUMNS.find((c) => c.key === sort.key)?.label} {sort.dir === 'asc' ? 'ascending' : 'descending'}</caption>
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        className={c.num ? 'r' : undefined}
                        aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        <button type="button" className="sort-btn" onClick={() => toggleSort(c.key)}>
                          {c.label}
                          {sort.key === c.key && <Icon name={sort.dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={14} />}
                        </button>
                      </th>
                    ))}
                    <th scope="col" className="actions"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const t = tone(p.cpu, 25, 75);
                    return (
                      <tr key={p.pid}>
                        <td data-label="PID" className="r mono num muted">{p.pid}</td>
                        <td className="cell-primary" style={{ maxWidth: 420 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }} className="truncate">{p.name}</div>
                            <div className="mono muted truncate" style={{ fontSize: 'var(--fs-xs)' }} title={p.cmd}>{p.cmd}</div>
                          </div>
                        </td>
                        <td data-label="User" className="mono">{p.user}</td>
                        <td data-label="CPU %" className="r">
                          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                            <span style={{ width: 48 }} className="hide-mobile"><Meter value={p.cpu} max={cpuMax} label={`${p.name} CPU`} tone={t} thin /></span>
                            <span className={`mono num ${t === 'ok' ? '' : `tone-${t}`}`} style={{ minWidth: 44 }}>{p.cpu.toFixed(1)}</span>
                          </div>
                        </td>
                        <td data-label="Memory" className="r mono num">{bytes(p.rss)} <span className="muted">({p.mem.toFixed(1)}%)</span></td>
                        <td data-label="Running" className="r mono num muted">{duration(p.elapsed)}</td>
                        <td className="actions">
                          <Button icon="x" className="btn-sm btn-danger-soft" busy={busy === p.pid} disabled={busy !== null} onClick={() => end(p)} aria-label={`End ${p.name}, PID ${p.pid}`}>
                            End
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
