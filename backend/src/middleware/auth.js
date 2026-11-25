const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const sequelize = require('../config/db');

const isProd = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET;
const WEAK_SECRETS = ['dev-secret-change-me', 'change_me_to_a_long_random_string'];

if (!SESSION_SECRET || SESSION_SECRET.length < 32 || WEAK_SECRETS.includes(SESSION_SECRET)) {
  if (isProd) {
    console.error('FATAL: SESSION_SECRET must be set to a random string of at least 32 characters.');
    console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
  }
  console.warn('[security] WARNING: weak or missing SESSION_SECRET (allowed only in development)');
}

const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 12;

const sessionStore = new SequelizeStore({
  db: sequelize,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: SESSION_HOURS * 60 * 60 * 1000,
});

const sessionMiddleware = session({
  name: 'sc.sid',
  secret: SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  proxy: true,
  cookie: {
    httpOnly: true,
    // Secure whenever the request arrived over HTTPS (Cloudflare sets X-Forwarded-Proto)
    secure: 'auto',
    sameSite: 'strict',
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  },
});

const requireAuth = (req, res, next) => {
  if (req.session?.userId) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

module.exports = { sessionMiddleware, sessionStore, requireAuth };
