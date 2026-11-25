/**
 * System metrics read straight from /proc and /sys — no shell, no `top`.
 * Results are cached briefly and shared, so many open tabs cost one sample.
 */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const CACHE_MS = 1500;
const HIDDEN_MOUNT = /^\/(boot|snap|sys|proc|run|dev)(\/|$)/;
const CPU_SENSORS = ['k10temp', 'coretemp', 'zenpower', 'cpu_thermal', 'soc_thermal', 'x86_pkg_temp', 'acpitz'];

const read = (p) => fs.readFile(p, 'utf8');

let prevCpu = null;
let prevNet = null;

async function cpuTimes() {
  const line = (await read('/proc/stat')).split('\n', 1)[0];
  const f = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = f[3] + (f[4] || 0); // idle + iowait
  const total = f.slice(0, 8).reduce((a, b) => a + b, 0);
  return { idle, total };
}

async function cpuPercent() {
  const cur = await cpuTimes();
  let base = prevCpu;
  if (!base) {
    // First call: take a short second sample so the value is meaningful.
    await new Promise((r) => setTimeout(r, 250));
    base = cur;
    prevCpu = await cpuTimes();
    return pct(base, prevCpu);
  }
  prevCpu = cur;
  return pct(base, cur);
}
function pct(a, b) {
  const dt = b.total - a.total;
  if (dt <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - (b.idle - a.idle) / dt) * 100));
}

async function memory() {
  const info = {};
  for (const line of (await read('/proc/meminfo')).split('\n')) {
    const m = /^(\w+):\s+(\d+)/.exec(line);
    if (m) info[m[1]] = Number(m[2]) * 1024;
  }
  const total = info.MemTotal || 0;
  const available = info.MemAvailable ?? info.MemFree ?? 0;
  return {
    memTotal: total,
    memUsed: total - available,
    memFree: available,
    swapTotal: info.SwapTotal || 0,
    swapUsed: (info.SwapTotal || 0) - (info.SwapFree || 0),
  };
}

async function disks() {
  const seen = new Set();
  const out = [];
  for (const line of (await read('/proc/mounts')).split('\n')) {
    const [dev, rawMount] = line.split(' ');
    if (!dev || !dev.startsWith('/dev/') || dev.startsWith('/dev/loop') || seen.has(dev)) continue;
    const mount = rawMount.replace(/\\040/g, ' ');
    if (HIDDEN_MOUNT.test(mount) && mount !== '/') continue;
    seen.add(dev);
    try {
      const s = await fs.statfs(mount);
      const total = s.blocks * s.bsize;
      if (!total) continue;
      out.push({ device: dev, mount, total, used: (s.blocks - s.bfree) * s.bsize, free: s.bavail * s.bsize });
    } catch {}
  }
  return out.sort((a, b) => (a.mount === '/' ? -1 : b.mount === '/' ? 1 : a.mount.localeCompare(b.mount)));
}

async function temperature() {
  // Prefer a real CPU sensor from hwmon; fall back to thermal zones.
  const candidates = [];
  try {
    for (const h of await fs.readdir('/sys/class/hwmon')) {
      const dir = path.join('/sys/class/hwmon', h);
      try {
        const name = (await read(path.join(dir, 'name'))).trim();
        const t = Number(await read(path.join(dir, 'temp1_input')));
        if (t > 0) candidates.push({ name, t });
      } catch {}
    }
  } catch {}
  try {
    for (const z of await fs.readdir('/sys/class/thermal')) {
      if (!z.startsWith('thermal_zone')) continue;
      const dir = path.join('/sys/class/thermal', z);
      try {
        const name = (await read(path.join(dir, 'type'))).trim();
        const t = Number(await read(path.join(dir, 'temp')));
        if (t > 0) candidates.push({ name, t });
      } catch {}
    }
  } catch {}
  for (const want of CPU_SENSORS) {
    const hit = candidates.find((c) => c.name === want);
    if (hit) return Math.round(hit.t / 1000);
  }
  return null;
}

async function network() {
  let rx = 0;
  let tx = 0;
  for (const line of (await read('/proc/net/dev')).split('\n').slice(2)) {
    const [iface, rest] = line.split(':');
    if (!rest) continue;
    const name = iface.trim();
    if (name === 'lo' || /^(docker|br-|veth|virbr)/.test(name)) continue;
    const f = rest.trim().split(/\s+/).map(Number);
    rx += f[0];
    tx += f[8];
  }
  const now = Date.now();
  let rates = { rxRate: 0, txRate: 0 };
  if (prevNet && now > prevNet.at) {
    const dt = (now - prevNet.at) / 1000;
    rates = { rxRate: Math.max(0, (rx - prevNet.rx) / dt), txRate: Math.max(0, (tx - prevNet.tx) / dt) };
  }
  prevNet = { rx, tx, at: now };
  return rates;
}

async function sample() {
  const [cpu, mem, diskList, temp, net, uptimeRaw] = await Promise.all([
    cpuPercent(),
    memory(),
    disks().catch(() => []),
    temperature().catch(() => null),
    network().catch(() => ({ rxRate: 0, txRate: 0 })),
    read('/proc/uptime'),
  ]);
  const root = diskList.find((d) => d.mount === '/') || diskList[0] || { total: 0, used: 0, free: 0 };
  return {
    at: Date.now(),
    hostname: os.hostname(),
    kernel: os.release(),
    cores: os.cpus().length,
    cpu: Math.round(cpu * 10) / 10,
    load: os.loadavg().map((n) => Math.round(n * 100) / 100),
    ...mem,
    diskTotal: root.total,
    diskUsed: root.used,
    diskFree: root.free,
    disks: diskList,
    uptime: Number(uptimeRaw.split(' ')[0]),
    temp,
    ...net,
  };
}

let cache = null;
let inflight = null;

/** Latest metrics (shared, at most one sample every CACHE_MS). */
function getMetrics() {
  if (cache && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache);
  if (!inflight) {
    inflight = sample()
      .then((m) => { cache = m; return m; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

module.exports = { getMetrics };
