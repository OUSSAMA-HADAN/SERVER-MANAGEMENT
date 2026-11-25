import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useMetrics } from '../lib/metrics.jsx';
import { usePolling } from '../lib/usePolling.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { bytes, duration, durationLong, pct, rate, tone } from '../lib/format.js';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import { Empty, ErrorAlert, Meter, PageHeader, Sparkline, Status } from '../components/ui.jsx';
import { serviceTone, serviceLabel } from './ServicesPage.jsx';

const TONE_TEXT = { ok: 'Normal', warn: 'High', danger: 'Critical' };

function MetricCard({ icon, title, value, unit, t = 'ok', spark, sparkLabel, sparkMax, meter, meterLabel, children }) {
  return (
    <section className="card metric" aria-label={title}>
      <div className="metric-top">
        <Icon name={icon} size={16} />
        <h2 style={{ fontSize: 'inherit', fontWeight: 'inherit' }}>{title}</h2>
        {t !== 'ok' && <span style={{ marginLeft: 'auto' }}><Status tone={t}>{TONE_TEXT[t]}</Status></span>}
      </div>
      <div className="metric-value">{value}{unit && <small>{unit}</small>}</div>
      {meter !== undefined && <Meter value={meter} label={meterLabel || title} tone={t} />}
      {spark && <div className={`tone-${t}`}><Sparkline values={spark} max={sparkMax} label={sparkLabel} /></div>}
      {children && <div className="metric-foot">{children}</div>}
    </section>
  );
}

function SkeletonCards() {
  return (
    <div className="grid grid-metrics" aria-busy="true" aria-label="Loading metrics">
      {[0, 1, 2, 3].map((i) => <div key={i} className="card skeleton" style={{ height: 150 }} />)}
    </div>
  );
}

export default function OverviewPage() {
  usePageTitle('Overview');
  const confirm = useConfirm();
  const toast = useToast();
  const { metrics: m, history, error: metricsError } = useMetrics();

  const services = usePolling((signal) => api('/api/services', { signal }), 15000);
  const containers = usePolling(async (signal) => {
    const [list, links] = await Promise.all([
      api('/api/docker/containers', { signal }),
      api('/api/container-links', { signal }).catch(() => ({})),
    ]);
    return { list, links };
  }, 15000);

  const power = async (kind) => {
    const restart = kind === 'restart';
    const ok = await confirm(restart ? 'Restart the server?' : 'Shut down the server?', {
      detail: restart
        ? 'The machine reboots now. Every shell, container and connection drops until it is back.'
        : 'The machine powers off. You will need physical or out-of-band access to turn it back on.',
      danger: true,
      confirmLabel: restart ? 'Restart now' : 'Shut down',
    });
    if (!ok) return;
    try {
      await api(`/api/system/${kind}`, { method: 'POST' });
      toast.success(restart ? 'Restarting… the panel will be back shortly.' : 'Shutting down…');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const memPct = m?.memTotal ? (m.memUsed / m.memTotal) * 100 : 0;
  const diskPct = m?.diskTotal ? (m.diskUsed / m.diskTotal) * 100 : 0;
  const svc = services.data || [];
  const activeSvc = svc.filter((s) => s.status === 'active').length;
  const ctr = containers.data?.list || [];
  const links = containers.data?.links || {};
  const runningCtr = ctr.filter((c) => c.state === 'running').length;

  return (
    <div className="page">
      <PageHeader
        title="Overview"
        subtitle={m ? (
          <>
            <span className="mono">{m.hostname}</span> · Linux {m.kernel} · <span aria-label={`up ${durationLong(m.uptime)}`}>up {duration(m.uptime)}</span>
          </>
        ) : 'Live health of your server'}
      >
        <Link to="/terminal" className="btn btn-primary"><Icon name="terminal" size={16} /> Open terminal</Link>
      </PageHeader>

      <div className="stack">
        {metricsError && !m && <ErrorAlert error={metricsError} />}
        {!m ? <SkeletonCards /> : (
          <div className="grid grid-metrics">
            <MetricCard
              icon="cpu" title="CPU" value={m.cpu.toFixed(0)} unit="%"
              t={tone(m.cpu, 70, 90)} spark={history.cpu} sparkMax={100}
              sparkLabel={`CPU usage over the last ${history.cpu.length * 3} seconds, now ${pct(m.cpu)}`}
            >
              <span>Load <span className="mono num">{m.load.join(' · ')}</span></span>
              <span>{m.cores} cores</span>
            </MetricCard>
            <MetricCard
              icon="memory" title="Memory" value={bytes(m.memUsed)} unit={`/ ${bytes(m.memTotal)}`}
              t={tone(memPct, 80, 92)} meter={memPct} meterLabel="Memory used"
            >
              <span>{pct(memPct)} used</span>
              {m.swapTotal > 0 && <span>Swap {bytes(m.swapUsed)} / {bytes(m.swapTotal)}</span>}
            </MetricCard>
            <MetricCard
              icon="disk" title="Disk (/)" value={bytes(m.diskUsed)} unit={`/ ${bytes(m.diskTotal)}`}
              t={tone(diskPct, 80, 92)} meter={diskPct} meterLabel="Root disk used"
            >
              <span>{bytes(m.diskFree)} free</span>
              <span>{pct(diskPct)} used</span>
            </MetricCard>
            {m.temp != null && (
              <MetricCard icon="temp" title="CPU temperature" value={m.temp} unit="°C" t={tone(m.temp, 70, 85)} meter={m.temp} meterLabel="CPU temperature">
                <span>{m.temp >= 85 ? 'Check cooling now' : m.temp >= 70 ? 'Running warm' : 'Within normal range'}</span>
              </MetricCard>
            )}
            <MetricCard
              icon="network" title="Network" value={rate(m.rxRate)} unit="in"
              spark={history.rx} sparkLabel={`Incoming traffic, now ${rate(m.rxRate)}`}
            >
              <span>Out {rate(m.txRate)}</span>
            </MetricCard>
          </div>
        )}

        <div className="grid grid-2">
          <section className="card" aria-labelledby="ov-services">
            <div className="card-head">
              <Icon name="services" size={18} />
              <h2 id="ov-services" className="card-title">Services</h2>
              {services.data && <span className="chip">{activeSvc}/{svc.length} active</span>}
              <Link to="/services" className="link-more">Manage<Icon name="chevronRight" size={14} /></Link>
            </div>
            <ErrorAlert error={services.error} onRetry={services.refresh} />
            {services.loading ? <div className="skeleton" style={{ height: 200 }} /> : (
              <ul className="list">
                {svc.map((s) => (
                  <li key={s.name} className="list-item">
                    <div className="list-main">
                      <div className="list-title mono">{s.name}</div>
                      {s.description && <div className="list-sub truncate">{s.description}</div>}
                    </div>
                    <Status tone={serviceTone(s.status)}>{serviceLabel(s.status)}</Status>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="ov-containers">
            <div className="card-head">
              <Icon name="docker" size={18} />
              <h2 id="ov-containers" className="card-title">Containers</h2>
              {containers.data && <span className="chip">{runningCtr}/{ctr.length} running</span>}
              <Link to="/docker" className="link-more">Manage<Icon name="chevronRight" size={14} /></Link>
            </div>
            <ErrorAlert error={containers.error} onRetry={containers.refresh} />
            {containers.loading ? <div className="skeleton" style={{ height: 200 }} /> : ctr.length === 0 ? (
              !containers.error && <Empty icon="docker" title="No containers">Containers you create with Docker show up here.</Empty>
            ) : (
              <ul className="list">
                {ctr.slice(0, 7).map((c) => (
                  <li key={c.id} className="list-item">
                    <div className="list-main">
                      <div className="list-title truncate">{c.name}</div>
                      <div className="list-sub truncate mono">{c.image}</div>
                    </div>
                    {links[c.name] && (
                      <a href={links[c.name]} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-icon btn-sm" aria-label={`Open ${c.name} in a new tab`}>
                        <Icon name="external" size={16} />
                      </a>
                    )}
                    <Status tone={c.state === 'running' ? 'ok' : c.state === 'restarting' ? 'warn' : c.state === 'dead' ? 'danger' : 'idle'}>{c.state}</Status>
                  </li>
                ))}
                {ctr.length > 7 && (
                  <li className="list-item"><Link to="/docker" className="muted">+ {ctr.length - 7} more containers</Link></li>
                )}
              </ul>
            )}
          </section>

          {m?.disks?.length > 0 && (
            <section className="card" aria-labelledby="ov-storage">
              <div className="card-head">
                <Icon name="disk" size={18} />
                <h2 id="ov-storage" className="card-title">Storage</h2>
              </div>
              <ul className="list">
                {m.disks.map((d) => {
                  const p = d.total ? (d.used / d.total) * 100 : 0;
                  return (
                    <li key={d.device} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                      <div className="row">
                        <span className="mono list-title truncate">{d.mount}</span>
                        <span className="muted mono" style={{ fontSize: 'var(--fs-xs)' }}>{d.device}</span>
                        <span className="spacer" />
                        <span className="num" style={{ fontSize: 'var(--fs-sm)' }}>{bytes(d.used)} / {bytes(d.total)}</span>
                      </div>
                      <Meter value={p} label={`${d.mount} used`} tone={tone(p, 80, 92)} valueText={`${pct(p)} used, ${bytes(d.free)} free`} />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="card danger-zone" aria-labelledby="ov-power">
            <div className="card-head">
              <Icon name="power" size={18} />
              <h2 id="ov-power" className="card-title">Power</h2>
            </div>
            <p className="muted" style={{ marginBottom: 16, fontSize: 'var(--fs-sm)' }}>
              These act on the whole machine and need a passwordless sudo rule for <code>shutdown</code>.
            </p>
            <div className="btn-group">
              <button type="button" className="btn btn-danger-soft" onClick={() => power('restart')}>
                <Icon name="restart" size={16} /> Restart server
              </button>
              <button type="button" className="btn btn-danger-soft" onClick={() => power('shutdown')}>
                <Icon name="power" size={16} /> Shut down
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
