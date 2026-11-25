/**
 * Process list straight from /proc with *current* CPU usage (like `top`),
 * computed from the tick delta since the previous sample. No child processes.
 */
const fs = require('fs/promises');
const os = require('os');

const CLK_TCK = 100; // USER_HZ on Linux
const PAGE = 4096;

let prev = null; // { total, ticks: Map<pid, ticks> }
let users = null;
let usersAt = 0;

async function userMap() {
  if (users && Date.now() - usersAt < 60_000) return users;
  users = new Map();
  try {
    for (const line of (await fs.readFile('/etc/passwd', 'utf8')).split('\n')) {
      const [name, , uid] = line.split(':');
      if (name && uid) users.set(uid, name);
    }
  } catch {}
  usersAt = Date.now();
  return users;
}

async function totalTicks() {
  const line = (await fs.readFile('/proc/stat', 'utf8')).split('\n', 1)[0];
  return line.trim().split(/\s+/).slice(1, 9).map(Number).reduce((a, b) => a + b, 0);
}

async function readProc(pid) {
  const [stat, status, cmdline] = await Promise.all([
    fs.readFile(`/proc/${pid}/stat`, 'utf8'),
    fs.readFile(`/proc/${pid}/status`, 'utf8'),
    fs.readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => ''),
  ]);
  // comm may contain spaces/parens: split around the LAST ')'.
  const close = stat.lastIndexOf(')');
  const name = stat.slice(stat.indexOf('(') + 1, close);
  const f = stat.slice(close + 2).split(' ');
  // f[0] = state (field 3), so field N is f[N - 3]
  const ticks = Number(f[11]) + Number(f[12]);
  const start = Number(f[19]);
  const rss = Number(f[21]) * PAGE;
  const uid = /^Uid:\s+(\d+)/m.exec(status)?.[1];
  return { pid: Number(pid), name, state: f[0], ticks, start, rss, uid, cmd: cmdline.replace(/\0+$/, '').replace(/\0/g, ' ') };
}

async function listProcesses(limit = 150) {
  const [entries, total, uptimeRaw, names] = await Promise.all([
    fs.readdir('/proc'),
    totalTicks(),
    fs.readFile('/proc/uptime', 'utf8'),
    userMap(),
  ]);
  const uptime = Number(uptimeRaw.split(' ')[0]);
  const cores = os.cpus().length;
  const memTotal = os.totalmem();

  const pids = entries.filter((e) => /^\d+$/.test(e));
  const results = await Promise.all(pids.map((p) => readProc(p).catch(() => null)));

  const dTotal = prev ? total - prev.total : 0;
  const ticksNow = new Map();
  const out = [];
  for (const p of results) {
    if (!p || p.pid === process.pid) continue;
    ticksNow.set(p.pid, p.ticks);
    const before = prev?.ticks.get(p.pid);
    let cpu;
    if (dTotal > 0 && before !== undefined) {
      // Share of all CPU time × cores → 100 % means one full core, like top.
      cpu = ((p.ticks - before) / dTotal) * 100 * cores;
    } else {
      // First sample: lifetime average as a fallback.
      const age = uptime - p.start / CLK_TCK;
      cpu = age > 0 ? (p.ticks / CLK_TCK / age) * 100 : 0;
    }
    out.push({
      pid: p.pid,
      user: names.get(p.uid) || p.uid || '?',
      cpu: Math.max(0, Math.round(cpu * 10) / 10),
      mem: Math.round((p.rss / memTotal) * 1000) / 10,
      rss: p.rss,
      elapsed: Math.max(0, Math.round(uptime - p.start / CLK_TCK)),
      name: p.name,
      state: p.state,
      cmd: p.cmd || `[${p.name}]`,
    });
  }
  prev = { total, ticks: ticksNow };
  out.sort((a, b) => b.cpu - a.cpu || b.rss - a.rss);
  return { total: out.length, processes: out.slice(0, limit) };
}

module.exports = { listProcesses };
