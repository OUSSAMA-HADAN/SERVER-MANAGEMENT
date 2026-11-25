const router = require('express').Router();
const { exec } = require('child_process');
const { requireAuth } = require('../middleware/auth');
const { sendToAll } = require('../services/notifications');
const SERVER_NAME = process.env.SERVER_NAME || 'server';

router.post('/restart', requireAuth, async (req, res) => {
  await sendToAll('🔄 Server Restarting', `${SERVER_NAME} is restarting now…`, 'server-restart');
  res.json({ ok: true });
  setTimeout(() => exec('sudo shutdown -r now'), 500);
});

router.post('/shutdown', requireAuth, async (req, res) => {
  await sendToAll('⏻ Server Shutting Down', `${SERVER_NAME} is shutting down…`, 'server-shutdown');
  res.json({ ok: true });
  setTimeout(() => exec('sudo shutdown -h now'), 500);
});

module.exports = router;
