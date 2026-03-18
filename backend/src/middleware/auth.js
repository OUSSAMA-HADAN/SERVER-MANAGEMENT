const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const sequelize = require('../config/db');

const sessionStore = new SequelizeStore({ db: sequelize });

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

const requireAuth = (req, res, next) => {
  if (req.session?.userId) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

module.exports = { sessionMiddleware, sessionStore, requireAuth };
