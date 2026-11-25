import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import { Button, Empty, ErrorAlert, PageHeader, Status } from '../components/ui.jsx';

const stateTone = (s) => (s === 'running' ? 'ok' : s === 'restarting' || s === 'paused' ? 'warn' : s === 'dead' ? 'danger' : 'idle');
const PAST = { start: 'started', stop: 'stopped', restart: 'restarted', remove: 'removed' };

function SearchBox({ value, onChange, label }) {
  return (
    <div className="input-wrap search">
      <Icon name="search" size={16} className="input-icon" />
      <input
        className="input"
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function LogsDialog({ container, onClose }) {
  const ref = useRef(null);
  const preRef = useRef(null);
  const titleId = useId();
  const [logs, setLogs] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { logs: text } = await api(`/api/docker/containers/${container.id}/logs?tail=500`);
      setLogs(text);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    ref.current?.showModal();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const pre = preRef.current;
    if (pre) pre.scrollTop = pre.scrollHeight;
  }, [logs]);

  return (
    <dialog
      ref={ref}
      className="dialog dialog-lg"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) ref.current.close(); }}
    >
      <div className="dialog-head">
        <Icon name="logs" size={18} />
        <h2 id={titleId} className="truncate">Logs · <span className="mono">{container.name}</span></h2>
        <span className="spacer" />
        <Button icon="refresh" className="btn-sm" busy={loading} onClick={load}>Reload</Button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => ref.current.close()} aria-label="Close logs">
          <Icon name="x" size={18} />
        </button>
      </div>
      {error ? (
        <div style={{ padding: 20 }}><ErrorAlert error={error} onRetry={load} /></div>
      ) : (
        <pre ref={preRef} className="logs" tabIndex={0} aria-label={`Last 500 log lines of ${container.name}`} aria-busy={loading}>
          {logs || (loading ? 'Loading…' : 'No log output.')}
        </pre>
      )}
    </dialog>
  );
}

function ContainersTab({ data, error, loading, refresh }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState({});
  const [logsFor, setLogsFor] = useState(null);

  const list = data?.list || [];
  const links = data?.links || {};
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? list.filter((c) => `${c.name} ${c.image} ${c.state}`.toLowerCase().includes(q)) : list;
  }, [list, filter]);

  const act = async (c, action) => {
    if (action === 'remove') {
      const ok = await confirm(`Remove container “${c.name}”?`, {
        detail: 'The container is force-removed, even if running. Its image and named volumes are kept.',
        danger: true, confirmLabel: 'Remove container',
      });
      if (!ok) return;
    }
    setBusy((b) => ({ ...b, [c.id]: action }));
    try {
      await api(`/api/docker/containers/${c.id}/${action}`, { method: 'POST' });
      toast.success(`${c.name} ${PAST[action]}`);
      await refresh();
    } catch (e) {
      toast.error(`${c.name}: ${e.message}`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[c.id]; return n; });
    }
  };

  return (
    <div className="stack">
      <div className="row wrap">
        <SearchBox value={filter} onChange={setFilter} label="Filter containers" />
        <span className="spacer" />
        <span className="muted" role="status" style={{ fontSize: 'var(--fs-sm)' }}>
          {filter ? `${shown.length} of ${list.length} containers` : `${list.length} containers`}
        </span>
      </div>
      <ErrorAlert error={error} onRetry={refresh} />
      {loading && !data ? <div className="card skeleton" style={{ height: 240 }} /> : shown.length === 0 ? (
        !error && <div className="card"><Empty icon="docker" title={filter ? 'No matching containers' : 'No containers yet'} /></div>
      ) : (
        <div className="card card-pad-0">
          <div className="table-scroll">
            <table className="table table-responsive">
              <caption className="sr-only">Docker containers</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">State</th>
                  <th scope="col">Status</th>
                  <th scope="col">Ports</th>
                  <th scope="col" className="actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const running = c.state === 'running';
                  const b = busy[c.id];
                  return (
                    <tr key={c.id}>
                      <td className="cell-primary">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }} className="truncate">{c.name}</div>
                          <div className="muted mono truncate" style={{ fontSize: 'var(--fs-xs)', maxWidth: 360 }}>{c.image}</div>
                        </div>
                      </td>
                      <td data-label="State"><Status tone={stateTone(c.state)}>{c.state}</Status></td>
                      <td data-label="Status" className="muted">{c.status}</td>
                      <td data-label="Ports" className="mono muted" style={{ fontSize: 'var(--fs-xs)', maxWidth: 260, overflowWrap: 'anywhere' }}>
                        {c.ports || '—'}
                      </td>
                      <td className="actions">
                        <div className="btn-group" role="group" aria-label={`${c.name} actions`}>
                          {running ? (
                            <Button icon="stop" className="btn-sm" busy={b === 'stop'} disabled={!!b} onClick={() => act(c, 'stop')}>Stop</Button>
                          ) : (
                            <Button icon="play" className="btn-sm" busy={b === 'start'} disabled={!!b} onClick={() => act(c, 'start')}>Start</Button>
                          )}
                          <Button icon="restart" className="btn-sm btn-icon" busy={b === 'restart'} disabled={!!b} onClick={() => act(c, 'restart')} aria-label={`Restart ${c.name}`} title="Restart" />
                          <Button icon="logs" className="btn-sm btn-icon" onClick={() => setLogsFor(c)} aria-label={`View logs for ${c.name}`} title="Logs" />
                          {links[c.name] && (
                            <a href={links[c.name]} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-icon" aria-label={`Open ${c.name} in a new tab`} title="Open">
                              <Icon name="external" size={16} />
                            </a>
                          )}
                          <Button icon="trash" className="btn-sm btn-icon btn-danger-soft" busy={b === 'remove'} disabled={!!b} onClick={() => act(c, 'remove')} aria-label={`Remove ${c.name}`} title="Remove" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {logsFor && <LogsDialog container={logsFor} onClose={() => setLogsFor(null)} />}
    </div>
  );
}

function ImagesTab({ data, error, loading, refresh }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(null);

  const list = data || [];
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? list.filter((i) => `${i.repo}:${i.tag} ${i.id}`.toLowerCase().includes(q)) : list;
  }, [list, filter]);

  const remove = async (img) => {
    const label = img.repo === '<none>' ? img.id : `${img.repo}:${img.tag}`;
    const ok = await confirm(`Delete image ${label}?`, {
      detail: 'The image is removed from disk. Docker refuses if a container still uses it.',
      danger: true, confirmLabel: 'Delete image',
    });
    if (!ok) return;
    setBusy(img.id);
    try {
      await api(`/api/docker/images/${encodeURIComponent(img.repo === '<none>' ? img.id : label)}`, { method: 'DELETE' });
      toast.success(`Deleted ${label}`);
      await refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <div className="row wrap">
        <SearchBox value={filter} onChange={setFilter} label="Filter images" />
        <span className="spacer" />
        <span className="muted" role="status" style={{ fontSize: 'var(--fs-sm)' }}>{shown.length} images</span>
      </div>
      <ErrorAlert error={error} onRetry={refresh} />
      {loading && !data ? <div className="card skeleton" style={{ height: 240 }} /> : shown.length === 0 ? (
        !error && <div className="card"><Empty icon="docker" title="No images" /></div>
      ) : (
        <div className="card card-pad-0">
          <div className="table-scroll">
            <table className="table table-responsive">
              <caption className="sr-only">Docker images</caption>
              <thead>
                <tr>
                  <th scope="col">Repository</th>
                  <th scope="col">Tag</th>
                  <th scope="col">Image ID</th>
                  <th scope="col" className="r">Size</th>
                  <th scope="col">Created</th>
                  <th scope="col" className="actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((img) => (
                  <tr key={`${img.id}-${img.repo}-${img.tag}`}>
                    <td className="cell-primary" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{img.repo}</td>
                    <td data-label="Tag"><span className="chip">{img.tag}</span></td>
                    <td data-label="Image ID" className="mono muted">{img.id}</td>
                    <td data-label="Size" className="r num">{img.size}</td>
                    <td data-label="Created" className="muted">{img.created}</td>
                    <td className="actions">
                      <Button icon="trash" className="btn-sm btn-danger-soft" busy={busy === img.id} disabled={!!busy} onClick={() => remove(img)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: 'containers', label: 'Containers' },
  { id: 'images', label: 'Images' },
];

export default function DockerPage() {
  usePageTitle('Docker');
  const [tab, setTab] = useState('containers');
  const tabRefs = useRef({});
  const baseId = useId();

  const containers = usePolling(async (signal) => {
    const [list, links] = await Promise.all([
      api('/api/docker/containers', { signal }),
      api('/api/container-links', { signal }).catch(() => ({})),
    ]);
    return { list, links };
  }, 10000);
  const images = usePolling((signal) => api('/api/docker/images', { signal }), 30000, { enabled: tab === 'images' });

  const counts = { containers: containers.data?.list.length, images: images.data?.length };

  // WAI-ARIA tabs: arrow keys move between tabs.
  const onKeyDown = (e) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = null;
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
    if (e.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length];
    if (e.key === 'Home') next = TABS[0];
    if (e.key === 'End') next = TABS[TABS.length - 1];
    if (next) {
      e.preventDefault();
      setTab(next.id);
      tabRefs.current[next.id]?.focus();
    }
  };

  const active = tab === 'containers' ? containers : images;

  return (
    <div className="page">
      <PageHeader title="Docker" subtitle="Containers and images on this host">
        <Button icon="refresh" onClick={active.refresh}>Refresh</Button>
      </PageHeader>
      <div className="tabs" role="tablist" aria-label="Docker resources" onKeyDown={onKeyDown} style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => { tabRefs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className="tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {counts[t.id] != null && <span className="count">{counts[t.id]}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-panel-${tab}`} aria-labelledby={`${baseId}-tab-${tab}`}>
        {tab === 'containers' ? <ContainersTab {...containers} /> : <ImagesTab {...images} />}
      </div>
    </div>
  );
}
