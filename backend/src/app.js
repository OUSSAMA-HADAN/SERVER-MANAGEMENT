require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { sessionMiddleware } = require('./middleware/auth');

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

app.use(express.json());
app.use(cors({
  origin: isProd ? false : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(sessionMiddleware);

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
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

module.exports = app;
