require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { sessionMiddleware } = require('./middleware/auth');
const {
  securityHeaders,
  originGuard,
  cloudflareAccessGuard,
  apiLimiter,
} = require('./middleware/security');
const { apiGate, assetGate } = require('./middleware/stealth');

const authRoutes = require('./routes/auth');
const dockerRoutes = require('./routes/docker');
const servicesRoutes = require('./routes/services');
const processesRoutes = require('./routes/processes');
const statsRoutes = require('./routes/stats');
const systemRoutes = require('./routes/system');
const containerLinksRoutes = require('./routes/containerLinks');
const pushRoutes = require('./routes/push');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Requests arrive through cloudflared (Docker network / localhost) — trust only private hops.
app.set('trust proxy', 'loopback, uniquelocal');
app.disable('x-powered-by');

// Cloudflare Access gate first: nothing (not even the login page) is served without it.
app.use(cloudflareAccessGuard);
app.use(securityHeaders);
app.use((req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });
app.use(express.json({ limit: '16kb' }));
app.use(cors({
  origin: isProd ? false : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(originGuard);
app.use('/api/', apiLimiter);
// API responses are per-user and must never be stored by browsers or Cloudflare.
app.use('/api/', (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
  next();
});
app.use(sessionMiddleware);
app.use('/api', apiGate);

app.use('/api/auth', authRoutes);
app.use('/api/docker', dockerRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/processes', processesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/container-links', containerLinksRoutes);
app.use('/api/push', pushRoutes);

if (isProd) {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(assetGate(distPath));
  app.use(express.static(distPath, { dotfiles: 'deny', index: 'index.html' }));
  // Only real app routes get the SPA shell; everything else is a genuine 404.
  const SPA_ROUTES = new Set(['/', '/login', '/services', '/docker', '/processes', '/terminal']);
  app.get('*', (req, res) => {
    const p = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
    if (!SPA_ROUTES.has(p)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).type('text/plain').send('Not found');
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Never leak stack traces.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;
