const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const containerLinks = require('../config/containerLinks');

router.get('/', requireAuth, (req, res) => {
  res.json(containerLinks);
});

module.exports = router;
