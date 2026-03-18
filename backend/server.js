require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const sequelize = require('./src/config/db');
const { sessionMiddleware, sessionStore } = require('./src/middleware/auth');
const { createTerminalServer } = require('./src/websocket/terminal');
const { sendToAll, startMonitors } = require('./src/services/notifications');

const server = http.createServer(app);
createTerminalServer(server, sessionMiddleware);

const PORT = process.env.PORT || 3000;

async function start() {
  await sequelize.sync();
  await sessionStore.sync();
  server.listen(PORT, async () => {
    console.log(`\n╔══════════════════════════════════╗`);
    console.log(`║  ServerCtrl running on :${PORT}     ║`);
    console.log(`╚══════════════════════════════════╝\n`);
    // Notify subscribers that the server is online
    await sendToAll('🟢 Server Online', 'SRV0HP is up and running', 'server-online');
    startMonitors();
  });
}

start().catch(console.error);