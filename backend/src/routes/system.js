const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { sendToAll } = require('../services/notifications');
const { run, sudoHint } = require('../services/run');

const SERVER_NAME = process.env.SERVER_NAME || 'server';

function power(kind, flag, title, body, tag) {
  return async (req, res) => {
    // Check sudo works before telling anyone the server is going down.
    try {
      await run('sudo', ['-n', '-l', 'shutdown', flag, 'now'], { timeout: 5000 });
    } catch (e) {
      return res.status(500).json({ error: sudoHint(e) });
    }
    console.warn(`[system] ${kind} requested by user="${req.session.username}"`);
    await sendToAll(title, body, tag).catch(() => {});
    res.json({ ok: true });
    setTimeout(() => run('sudo', ['-n', 'shutdown', flag, 'now']).catch((e) => console.error('[system]', e.userMessage)), 500);
  };
}

router.post('/restart', requireAuth, power('restart', '-r', '🔄 Server restarting', `${SERVER_NAME} is restarting now…`, 'server-restart'));
router.post('/shutdown', requireAuth, power('shutdown', '-h', '⏻ Server shutting down', `${SERVER_NAME} is shutting down…`, 'server-shutdown'));

module.exports = router;
