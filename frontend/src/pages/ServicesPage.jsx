import { useState } from 'react';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { duration } from '../lib/format.js';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import { Button, Empty, ErrorAlert, PageHeader, Status } from '../components/ui.jsx';

export function serviceTone(status) {
  if (status === 'active') return 'ok';
  if (status === 'failed') return 'danger';
  if (status === 'activating' || status === 'deactivating' || status === 'reloading') return 'warn';
  return 'idle';
}
export function serviceLabel(status) {
  if (status === 'not-found') return 'Not installed';
  return status ? status[0].toUpperCase() + status.slice(1) : 'Unknown';
}

// Stopping these can cut off access to this panel or take other things down.
const RISKY = {
  cloudflared: 'This panel is reached through cloudflared. Stopping it will disconnect you and you will not be able to come back remotely.',
  ssh: 'Remote SSH logins will stop working until the service is started again.',
  docker: 'Every running container will stop.',
  nginx: 'Sites served by nginx will go offline.',
  ufw: 'Changes the firewall state for the whole machine.',
};

const PAST = { start: 'started', stop: 'stopped', restart: 'restarted' };

function ServiceCard({ svc, busy, onAction }) {
  const active = svc.status === 'active';
  const missing = svc.status === 'not-found';
  return (
    <li className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 className="mono" style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>{svc.name}</h2>
          <p className="muted truncate" style={{ fontSize: 'var(--fs-sm)' }} title={svc.description}>
            {svc.description || 'systemd unit'}
          </p>
        </div>
        <Status tone={serviceTone(svc.status)}>{serviceLabel(svc.status)}</Status>
      </div>
      <p className="muted" style={{ fontSize: 'var(--fs-xs)', minHeight: '1.5em' }}>
        {active && svc.since ? <>Running for {duration((Date.now() - svc.since) / 1000)}{svc.sub && svc.sub !== 'running' ? ` · ${svc.sub}` : ''}</> : svc.sub && !missing ? `State: ${svc.sub}` : ''}
      </p>
      <div className="btn-group" role="group" aria-label={`${svc.name} actions`}>
        <Button icon="play" className="btn-sm" disabled={active || missing || !!busy} busy={busy === 'start'} onClick={() => onAction(svc, 'start')}>
          Start
        </Button>
        <Button icon="stop" className="btn-sm" disabled={!active || !!busy} busy={busy === 'stop'} onClick={() => onAction(svc, 'stop')}>
          Stop
        </Button>
        <Button icon="restart" className="btn-sm" disabled={missing || !!busy} busy={busy === 'restart'} onClick={() => onAction(svc, 'restart')}>
          Restart
        </Button>
      </div>
    </li>
  );
}

export default function ServicesPage() {
  usePageTitle('Services');
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState({});
  const { data, error, loading, refresh, setData } = usePolling((signal) => api('/api/services', { signal }), 10000);

  const onAction = async (svc, action) => {
    const risk = RISKY[svc.name];
    if (risk && action !== 'start') {
      const ok = await confirm(`${action === 'stop' ? 'Stop' : 'Restart'} ${svc.name}?`, {
        detail: risk, danger: true, confirmLabel: action === 'stop' ? 'Stop service' : 'Restart service',
      });
      if (!ok) return;
    }
    setBusy((b) => ({ ...b, [svc.name]: action }));
    try {
      const res = await api(`/api/services/${encodeURIComponent(svc.name)}/${action}`, { method: 'POST' });
      setData((list) => list?.map((s) => (s.name === svc.name ? { ...s, ...res } : s)));
      toast.success(`${svc.name} ${PAST[action]} — now ${res.status}`);
    } catch (e) {
      toast.error(`${svc.name}: ${e.message}`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[svc.name]; return n; });
    }
  };

  const list = data || [];
  return (
    <div className="page">
      <PageHeader title="Services" subtitle="Start, stop and restart allow-listed systemd units">
        <Button icon="refresh" onClick={refresh} busy={loading && !data}>Refresh</Button>
      </PageHeader>
      <div className="stack">
        <ErrorAlert error={error} onRetry={refresh} />
        {loading && !data ? (
          <div className="grid grid-cards" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="card skeleton" style={{ height: 156 }} />)}
          </div>
        ) : list.length === 0 ? (
          !error && <Empty icon="services" title="No services configured">Set SERVICES in backend/.env.</Empty>
        ) : (
          <ul className="grid grid-cards list" aria-label="Services">
            {list.map((s) => <ServiceCard key={s.name} svc={s} busy={busy[s.name]} onAction={onAction} />)}
          </ul>
        )}
      </div>
    </div>
  );
}
