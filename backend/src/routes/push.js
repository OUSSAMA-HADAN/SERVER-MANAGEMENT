const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { getPublicKey } = require('../services/notifications');
const PushSubscription = require('../models/PushSubscription');

// Get VAPID public key (needed by frontend to subscribe)
router.get('/vapid-public-key', requireAuth, (req, res) => {
  res.json({ key: getPublicKey() });
});

// Save a push subscription
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

    await PushSubscription.upsert({
      endpoint: subscription.endpoint,
      subscription: JSON.stringify(subscription),
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Remove a push subscription
router.delete('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    await PushSubscription.destroy({ where: { endpoint } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
