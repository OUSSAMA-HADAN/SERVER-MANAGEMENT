const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { getMetrics } = require('../services/metrics');

router.get('/', requireAuth, async (req, res) => {
  try {
    res.json(await getMetrics());
  } catch (e) {
    console.error('[stats]', e.message);
    res.status(500).json({ error: 'Could not read system metrics' });
  }
});

module.exports = router;
