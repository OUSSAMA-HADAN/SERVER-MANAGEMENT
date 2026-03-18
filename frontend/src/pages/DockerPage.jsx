import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../App.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast toast-${toast.type}`}>{toast.msg}</div>;
}

function ContainerCard({ c, links, actioning, onAction }) {
  const isRunning = c.state === 'running';
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--text)', fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
          <div style={{ color: 'var(--muted)', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{c.image}</div>
        </div>
        <span className={`badge badge-${isRunning ? 'running' : 'exited'}`}>{c.state}</span>
      </div>
      {c.ports && c.ports !== '—' && (
        <div style={{ color: 'var(--muted)', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ports}</div>
      )}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {!isRunning && (
          <button className="btn btn-green" style={{ padding: '3px 9px' }} disabled={!!actioning} onClick={() => onAction(c.id, c.name, 'start')}>
            {actioning === `${c.id}-start` ? <span className="spinner" /> : '▶ start'}
          </button>
        )}
        {isRunning && (
          <button className="btn btn-red" style={{ padding: '3px 9px' }} disabled={!!actioning} onClick={() => onAction(c.id, c.name, 'stop')}>
            {actioning === `${c.id}-stop` ? <span className="spinner" /> : '■ stop'}
          </button>
        )}
        <button className="btn btn-muted" style={{ padding: '3px 9px' }} disabled={!!actioning} onClick={() => onAction(c.id, c.name, 'restart')}>
          {actioning === `${c.id}-restart` ? <span className="spinner" /> : '↺'}
        </button>
        <button className="btn btn-red" style={{ padding: '3px 9px' }} disabled={!!actioning}
          onClick={async () => { if (await confirm(`Remove "${c.name}"?`, { detail: 'This will force-remove the container.', danger: true })) onAction(c.id, c.name, 'remove'); }}>
          {actioning === `${c.id}-remove` ? <span className="spinner" /> : '✕'}
        </button>
        {links[c.name] && (
          <a href={links[c.name]} target="_blank" rel="noopener noreferrer" className="btn btn-muted" style={{ padding: '3px 9px', textDecoration: 'none' }}>↗</a>
        )}
      </div>
    </div>
  );
}

function ContainersTab({ onToast }) {
  const confirm = useConfirm();
  const [links, setLinks] = useState({});
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(null);
  const [view, setView] = useState('table');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, rl] = await Promise.all([
        apiFetch('/api/docker/containers'),
        apiFetch('/api/container-links'),
      ]);
      if (r.ok) setContainers(await r.json());
      if (rl.ok) setLinks(await rl.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const doAction = async (id, name, action) => {
    const key = `${id}-${action}`;
    setActioning(key);
    try {
      const r = await apiFetch(`/api/docker/containers/${id}/${action}`, { method: 'POST' });
      const data = await r.json();
      if (r.ok) { onToast(`${name}: ${action}${action === 'remove' ? 'd' : 'ed'}`); await fetchData(); }
      else onToast(data.error || 'Failed', 'err');
    } catch (e) { onToast(e.message, 'err'); }
    finally { setActioning(null); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '60px 0' }}><span className="spinner" /></div>;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ color: 'var(--muted)', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {containers.length} containers
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn btn-ghost" onClick={() => setView(v => v === 'table' ? 'cards' : 'table')} style={{ fontSize: '10px' }}>
            {view === 'table' ? '▦ cards' : '≡ table'}
          </button>
          <button className="btn btn-green" onClick={fetchData}>↻ refresh</button>
        </div>
      </div>

      {containers.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px', fontSize: '13px', margin: 0 }}>No containers found</p>
      ) : view === 'cards' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
          {containers.map(c => (
            <ContainerCard key={c.id} c={c} links={links} actioning={actioning} onAction={doAction} />
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="hide-sm">Image</th>
                  <th>State</th>
                  <th className="hide-md">Status</th>
                  <th className="hide-md">Ports</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {containers.map(c => {
                  const isRunning = c.state === 'running';
                  return (
                    <tr key={c.id}>
                      <td style={{ color: 'var(--text)', fontWeight: 500 }}>{c.name}</td>
                      <td className="hide-sm" style={{ color: 'var(--muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.image}</td>
                      <td><span className={`badge badge-${isRunning ? 'running' : 'exited'}`}>{c.state}</span></td>
                      <td className="hide-md" style={{ color: 'var(--muted)', fontSize: '11px' }}>{c.status}</td>
                      <td className="hide-md" style={{ color: 'var(--muted)', fontSize: '11px', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ports || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {!isRunning && (
                            <button className="btn btn-green" style={{ padding: '2px 8px' }} disabled={!!actioning} onClick={() => doAction(c.id, c.name, 'start')}>
                              {actioning === `${c.id}-start` ? <span className="spinner" /> : '▶'}
                            </button>
                          )}
                          {isRunning && (
                            <button className="btn btn-red" style={{ padding: '2px 8px' }} disabled={!!actioning} onClick={() => doAction(c.id, c.name, 'stop')}>
                              {actioning === `${c.id}-stop` ? <span className="spinner" /> : '■'}
                            </button>
                          )}
                          <button className="btn btn-muted" style={{ padding: '2px 8px' }} disabled={!!actioning} onClick={() => doAction(c.id, c.name, 'restart')}>
                            {actioning === `${c.id}-restart` ? <span className="spinner" /> : '↺'}
                          </button>
                          <button className="btn btn-red" style={{ padding: '2px 8px' }} disabled={!!actioning}
                            onClick={async () => { if (await confirm(`Remove "${c.name}"?`, { detail: 'This will force-remove the container.', danger: true })) doAction(c.id, c.name, 'remove'); }}>
                            {actioning === `${c.id}-remove` ? <span className="spinner" /> : '✕'}
                          </button>
                          {links[c.name] && (
                            <a href={links[c.name]} target="_blank" rel="noopener noreferrer" className="btn btn-muted" style={{ padding: '2px 8px', textDecoration: 'none' }}>↗</a>
                          )}
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
    </>
  );
}

function ImagesTab({ onToast }) {
  const confirm = useConfirm();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/docker/images');
      if (r.ok) setImages(await r.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const remove = async (id, label) => {
    if (!await confirm(`Remove image "${label}"?`, { detail: 'This will delete the image from disk.', danger: true })) return;
    setRemoving(id);
    try {
      const r = await apiFetch(`/api/docker/images/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await r.json();
      if (r.ok) { onToast(`Image ${label} removed`); await fetchData(); }
      else onToast(data.error || 'Failed', 'err');
    } catch (e) { onToast(e.message, 'err'); }
    finally { setRemoving(null); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '60px 0' }}><span className="spinner" /></div>;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ color: 'var(--muted)', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {images.length} images
        </span>
        <button className="btn btn-green" onClick={fetchData}>↻ refresh</button>
      </div>

      {images.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px', fontSize: '13px', margin: 0 }}>No images found</p>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Tag</th>
                  <th className="hide-sm">ID</th>
                  <th className="hide-md">Size</th>
                  <th className="hide-md">Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {images.map(img => (
                  <tr key={img.id}>
                    <td style={{ color: 'var(--text)' }}>{img.repo}</td>
                    <td><span className="badge badge-inactive">{img.tag}</span></td>
                    <td className="hide-sm" style={{ color: 'var(--muted)' }}>{img.id}</td>
                    <td className="hide-md" style={{ color: 'var(--muted)' }}>{img.size}</td>
                    <td className="hide-md" style={{ color: 'var(--muted)', fontSize: '11px' }}>{img.created}</td>
                    <td>
                      <button className="btn btn-red" style={{ padding: '2px 8px' }}
                        disabled={!!removing}
                        onClick={() => remove(img.id, `${img.repo}:${img.tag}`)}>
                        {removing === img.id ? <span className="spinner" /> : '✕ remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export default function DockerPage() {
  const [tab, setTab] = useState('containers');
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Docker</h1>
          <p className="page-subtitle">container & image management</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {['containers', 'images'].map(t => (
          <button
            key={t}
            className="btn"
            onClick={() => setTab(t)}
            style={{
              color: tab === t ? 'var(--green)' : 'var(--muted)',
              borderColor: tab === t ? 'rgba(0,232,162,0.35)' : 'var(--border)',
              background: tab === t ? 'rgba(0,232,162,0.06)' : 'transparent',
            }}
          >
            {t === 'containers' ? '◈ containers' : '▨ images'}
          </button>
        ))}
      </div>

      {tab === 'containers' ? <ContainersTab onToast={showToast} /> : <ImagesTab onToast={showToast} />}
      <Toast toast={toast} />
    </div>
  );
}
