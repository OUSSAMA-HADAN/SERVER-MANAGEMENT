require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const sequelize = require('./src/config/db');
const { sessionMiddleware, sessionStore } = require('./src/middleware/auth');
const { initAccess } = require('./src/middleware/security');
const { createTerminalServer, shutdownAll } = require('./src/websocket/terminal');
const { sendToAll, startMonitors } = require('./src/services/notifications');

const SERVER_NAME = process.env.SERVER_NAME || 'server';
const PORT = process.env.PORT || 3000;
// Comma-separated addresses to listen on, e.g. "127.0.0.1,172.17.0.1,100.x.y.z"
// (localhost, the Docker bridge cloudflared dials, Tailscale). Each address gets
// its own listener, so one missing interface never takes the others down.
const BIND_HOSTS = (process.env.BIND_HOST || '0.0.0.0').split(',').map((s) => s.trim()).filter(Boolean);
const RETRY_MS = 10 * 1000;

const listeners = BIND_HOSTS.map((host) => {
  const server = http.createServer(app);
  server.headersTimeout = 20000;
  server.requestTimeout = 30000;
  server.keepAliveTimeout = 65000; // longer than Cloudflare's keep-alive to avoid 502s
  return { host, server, up: false, failures: 0, timer: null };
});

// The terminal's upgrade handler is attached to every listener now, before any
// of them binds, so a listener that binds late gets it too.
createTerminalServer(listeners.map((l) => l.server), { sessionMiddleware, sessionStore });

let stopping = false;
let started = false;

function onFirstListener() {
  if (started) return;
  started = true;
  sendToAll('🟢 Server online', `${SERVER_NAME} is up and running`, 'server-online').catch(() => {});
  startMonitors();
}

function listen(l) {
  if (stopping) return;
  l.server.listen(PORT, l.host);
}

for (const l of listeners) {
  l.server.on('listening', () => {
    l.up = true;
    console.log(`[serverctrl] listening on ${l.host}:${PORT}${l.failures ? ` (after ${l.failures} failed attempts)` : ''}`);
    l.failures = 0;
    onFirstListener();
  });
  l.server.on('error', (e) => {
    if (l.up) {
      console.error(`[serverctrl] listener ${l.host}:${PORT} error: ${e.message}`);
      return;
    }
    l.failures += 1;
    // Log the first failure, then once a minute, so a missing interface doesn't flood the journal.
    if (l.failures === 1 || l.failures % 6 === 0) {
      console.error(`[serverctrl] cannot listen on ${l.host}:${PORT} (${e.code || e.message}); retrying every ${RETRY_MS / 1000}s, other listeners keep serving`);
    }
    clearTimeout(l.timer);
    l.timer = setTimeout(() => listen(l), RETRY_MS);
  });
}

async function start() {
  await require('./src/models/User').migrate();
  await sequelize.sync();
  await sessionStore.sync();
  await initAccess();
  listeners.forEach(listen);
}

function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[serverctrl] ${signal} received, shutting down`);
  shutdownAll();
  for (const l of listeners) {
    clearTimeout(l.timer);
    if (l.up) l.server.close();
  }
  setTimeout(() => process.exit(0), 500).unref();
}
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
