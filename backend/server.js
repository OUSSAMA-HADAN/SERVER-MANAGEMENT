require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const sequelize = require('./src/config/db');
const { sessionMiddleware, sessionStore } = require('./src/middleware/auth');
const { createTerminalServer } = require('./src/websocket/terminal');
const { sendToAll, startMonitors } = require('./src/services/notifications');
const SERVER_NAME = process.env.SERVER_NAME || 'server';

const server = http.createServer(app);
createTerminalServer(server, sessionMiddleware);

const PORT = process.env.PORT || 3000;
// Set BIND_HOST to the address cloudflared uses (e.g. 127.0.0.1 or the Docker
// bridge gateway) so the panel is not reachable directly from the LAN.
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';

server.headersTimeout = 20000;
server.requestTimeout = 30000;

async function start() {
  await require('./src/models/User').migrate();
  await sequelize.sync();
  await sessionStore.sync();
  server.listen(PORT, BIND_HOST, async () => {
    console.log(`\n╔══════════════════════════════════╗`);
    console.log(`║  ServerCtrl running on :${PORT}     ║`);
    console.log(`╚══════════════════════════════════╝\n`);
    // Notify subscribers that the server is online
    await sendToAll('🟢 Server Online', `${SERVER_NAME} is up and running`, 'server-online');
    startMonitors();
  });
}

start().catch(console.error);