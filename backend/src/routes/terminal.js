const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { listSessions, killSession } = require('../websocket/terminal');

// Shells still running for this user (including ones detached from a closed tab).
router.get('/sessions', requireAuth, (req, res) => {
  res.json(listSessions(req.session.userId));
});

router.delete('/sessions/:id', requireAuth, (req, res) => {
  if (!/^[a-f0-9]{32}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid session id' });
  if (!killSession(req.session.userId, req.params.id)) return res.status(404).json({ error: 'No such session' });
  res.json({ ok: true });
});

module.exports = router;
