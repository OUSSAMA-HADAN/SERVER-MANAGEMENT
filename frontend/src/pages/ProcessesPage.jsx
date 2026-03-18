import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../App.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';

export default function ProcessesPage() {
  const confirm = useConfirm();
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [killing, setKilling] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchProcs = useCallback(async () => {
    try {
      const r = await apiFetch('/api/processes');
      if (r.ok) setProcesses(await r.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchProcs();
    const iv = setInterval(fetchProcs, 8000);
    return () => clearInterval(iv);
  }, [fetchProcs]);

  const killProcess = async (pid, cmd) => {
    if (!await confirm(`Kill PID ${pid}?`, { detail: cmd.slice(0, 60), danger: true })) return;
    setKilling(pid);
    try {
      const r = await apiFetch(`/api/processes/${pid}`, { method: 'DELETE' });
      const data = await r.json();
      if (r.ok) {
        showToast(`PID ${pid} killed`);
        setProcesses(prev => prev.filter(p => p.pid !== pid));
      } else {
        showToast(data.error || 'Failed', 'err');
      }
    } catch (e) { showToast(e.message, 'err'); }
    finally { setKilling(null); }
  };

  const filtered = processes.filter(p =>
    !filter || p.cmd.toLowerCase().includes(filter.toLowerCase()) || p.pid.includes(filter)
  );

  const cpuMax = Math.max(...processes.map(p => parseFloat(p.cpu) || 0), 1);

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Processes</h1>
          <p className="page-subtitle">top 40 by CPU — refreshes every 8s</p>
        </div>
        <div className="filter-row" style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: '1 1 auto', justifyContent: 'flex-end', maxWidth: '360px' }}>
          <input
            className="input"
            placeholder="filter by name or PID..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button className="btn btn-green" onClick={fetchProcs} disabled={loading} style={{ flexShrink: 0 }}>
            {loading ? <span className="spinner" /> : '↻'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="table-wrap" style={{ flex: 1, overflowY: 'auto' }}>
          <table className="data-table">
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={{ width: 65 }}>PID</th>
                <th style={{ width: 90 }}>CPU%</th>
                <th className="hide-sm" style={{ width: 65 }}>MEM%</th>
                <th>Command</th>
                <th style={{ width: 75 }}>Kill</th>
              </tr>
            </thead>
            <tbody>
              {loading && processes.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                  <span className="spinner" />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)', fontSize: '12px' }}>
                  No processes match filter
                </td></tr>
              ) : (
                filtered.map(p => {
                  const cpu = parseFloat(p.cpu) || 0;
                  const cpuPct = (cpu / cpuMax) * 100;
                  const cpuColor = cpu > 50 ? 'var(--red)' : cpu > 20 ? 'var(--yellow)' : 'var(--green)';
                  return (
                    <tr key={p.pid}>
                      <td style={{ color: 'var(--muted)' }}>{p.pid}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '28px', height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ width: `${cpuPct}%`, height: '100%', background: cpuColor, borderRadius: '2px' }} />
                          </div>
                          <span style={{ color: cpuColor, fontSize: '11px' }}>{p.cpu}</span>
                        </div>
                      </td>
                      <td className="hide-sm" style={{ color: 'var(--muted)', fontSize: '11px' }}>{p.mem}</td>
                      <td style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)', fontSize: '11px' }}>
                        {p.cmd}
                      </td>
                      <td>
                        <button
                          className="btn btn-red"
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          disabled={!!killing}
                          onClick={() => killProcess(p.pid, p.cmd)}
                        >
                          {killing === p.pid ? <span className="spinner" /> : '✕ kill'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '8px', color: 'var(--muted)', fontSize: '11px', flexShrink: 0 }}>
        showing {filtered.length} of {processes.length} processes
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
