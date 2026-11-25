const webpush = require('web-push');
const path = require('path');
const fs = require('fs');
const { getMetrics } = require('./metrics');
const { run } = require('./run');
const SERVER_NAME = process.env.SERVER_NAME || 'server';

// ── VAPID keys ──────────────────────────────────────────────
const VAPID_PATH = path.join(__dirname, '../../data/vapid.json');

function loadOrGenerateVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  if (fs.existsSync(VAPID_PATH)) {
    return JSON.parse(fs.readFileSync(VAPID_PATH, 'utf8'));
  }
  const keys = webpush.generateVAPIDKeys();
  fs.mkdirSync(path.dirname(VAPID_PATH), { recursive: true });
  fs.writeFileSync(VAPID_PATH, JSON.stringify(keys, null, 2));
  console.log('[push] VAPID keys generated → data/vapid.json');
  return keys;
}

const vapid = loadOrGenerateVapid();
webpush.setVapidDetails('mailto:admin@serverctrl.local', vapid.publicKey, vapid.privateKey);

// ── Send to all subscribers ──────────────────────────────────
async function sendToAll(title, body, tag = 'serverctrl') {
  // lazy require to avoid circular dependency at module load time
  const PushSubscription = require('../models/PushSubscription');
  let subs;
  try {
    subs = await PushSubscription.findAll();
  } catch {
    return; // DB not ready yet
  }
  if (!subs.length) return;

  const payload = JSON.stringify({ title, body, icon: '/skull.svg', badge: '/skull.svg', tag });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(JSON.parse(sub.subscription), payload);
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await sub.destroy(); // expired subscription, clean up
        }
      }
    })
  );
}

// ── Monitors ────────────────────────────────────────────────
let cpuAlerted = false;
let ramAlerted = false;
const containerStates = new Map();

async function checkStats() {
  try {
    const m = await getMetrics();
    const cpu = m.cpu;
    const ram = (m.memUsed / m.memTotal) * 100;

    if (cpu > 85 && !cpuAlerted) {
      cpuAlerted = true;
      await sendToAll('⚠️ High CPU', `CPU at ${cpu.toFixed(1)}% on ${SERVER_NAME}`, 'cpu-alert');
    } else if (cpu < 70) {
      cpuAlerted = false;
    }

    if (ram > 90 && !ramAlerted) {
      ramAlerted = true;
      await sendToAll('⚠️ High RAM', `RAM at ${ram.toFixed(1)}% on ${SERVER_NAME}`, 'ram-alert');
    } else if (ram < 80) {
      ramAlerted = false;
    }
  } catch {}
}

async function checkContainers() {
  try {
    const { stdout } = await run('docker', ['ps', '-a', '--format', '{{json .}}']);
    const containers = stdout.trim().split('\n').filter(Boolean).map((l) => {
      const c = JSON.parse(l);
      return { id: c.ID, name: c.Names, state: c.State };
    });

    for (const c of containers) {
      const prev = containerStates.get(c.id);
      if (prev === 'running' && c.state !== 'running') {
        await sendToAll('🐳 Container Crashed', `${c.name} is now ${c.state} on ${SERVER_NAME}`, 'container-crash');
      }
      containerStates.set(c.id, c.state);
    }

    // Clean up removed containers
    const currentIds = new Set(containers.map(c => c.id));
    for (const id of containerStates.keys()) {
      if (!currentIds.has(id)) containerStates.delete(id);
    }
  } catch {}
}

function startMonitors() {
  // Seed initial container states without alerting
  checkContainers().catch(() => {});

  setInterval(checkStats, 30_000);       // CPU/RAM every 30s
  setInterval(checkContainers, 60_000);  // Container health every 60s
}

module.exports = { sendToAll, startMonitors, getPublicKey: () => vapid.publicKey };
