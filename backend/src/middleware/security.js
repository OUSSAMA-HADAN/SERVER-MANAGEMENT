/**
 * Security layer for ServerCtrl.
 *
 * - Real client IP from Cloudflare (CF-Connecting-IP)
 * - Cloudflare Access (Zero Trust) JWT verification — blocks anyone who reaches
 *   the origin without passing Cloudflare Access (enabled when CF_ACCESS_* set)
 * - Cloudflare Turnstile verification for the login form (enabled when TURNSTILE_* set)
 * - Origin checks against CSRF / cross-site WebSocket hijacking
 * - Brute-force protection: per-IP rate limits + per-account lockout
 */
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const isProd = process.env.NODE_ENV === 'production';

// ─── Client IP ──────────────────────────────────────────────────────────────
function clientIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function clientCountry(req) {
  return req.headers['cf-ipcountry'] || '??';
}

// ─── Security headers ───────────────────────────────────────────────────────
const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://challenges.cloudflare.com', 'https://static.cloudflareinsights.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'https://cloudflareinsights.com'],
      frameSrc: ['https://challenges.cloudflare.com'],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'deny' },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'no-referrer' },
});

// ─── Origin check (CSRF + cross-site WebSocket hijacking) ───────────────────
const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
if (!isProd) extraOrigins.push(process.env.FRONTEND_URL || 'http://localhost:5173');

function originAllowed(req, { requireOrigin = false } = {}) {
  const origin = req.headers.origin;
  if (!origin) return !requireOrigin;
  if (extraOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function originGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!originAllowed(req)) {
    console.warn(`[security] blocked cross-origin ${req.method} ${req.path} from ${req.headers.origin} ip=${clientIp(req)}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  // State-changing API calls must be JSON — blocks HTML-form based CSRF.
  if (req.path.startsWith('/api/') && req.headers['content-type'] && !req.is('application/json')) {
    return res.status(415).json({ error: 'Unsupported content type' });
  }
  next();
}

// ─── Cloudflare Access (Zero Trust) ─────────────────────────────────────────
const CF_TEAM = process.env.CF_ACCESS_TEAM_DOMAIN; // e.g. myteam.cloudflareaccess.com
const CF_AUD = process.env.CF_ACCESS_AUD;          // Application Audience (AUD) tag
const accessEnabled = Boolean(CF_TEAM && CF_AUD);

let jwksPromise;
async function verifyAccessJwt(token) {
  const jose = require('jose');
  const issuer = `https://${CF_TEAM.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  if (!jwksPromise) jwksPromise = Promise.resolve(jose.createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
  const jwks = await jwksPromise;
  const { payload } = await jose.jwtVerify(token, jwks, { issuer, audience: CF_AUD });
  return payload;
}

function getAccessToken(req) {
  if (req.headers['cf-access-jwt-assertion']) return req.headers['cf-access-jwt-assertion'];
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]) : null;
}

/** Returns the Access identity, `true` if Access is disabled, or null if rejected. */
async function checkAccess(req) {
  if (!accessEnabled) return true;
  const token = getAccessToken(req);
  if (!token) return null;
  try {
    return await verifyAccessJwt(token);
  } catch (e) {
    console.warn(`[security] invalid Cloudflare Access token ip=${clientIp(req)}: ${e.code || e.message}`);
    return null;
  }
}

async function cloudflareAccessGuard(req, res, next) {
  const identity = await checkAccess(req);
  if (!identity) return res.status(403).send('Forbidden');
  if (identity !== true) req.accessIdentity = identity;
  next();
}

// ─── Cloudflare Turnstile ───────────────────────────────────────────────────
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';
const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET);

async function verifyTurnstile(token, ip) {
  if (!turnstileEnabled) return true;
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json();
    return data.success === true;
  } catch (e) {
    console.error('[security] Turnstile verification error:', e.message);
    return false; // fail closed
  }
}

// ─── Rate limiting ──────────────────────────────────────────────────────────
const keyByIp = (req) => clientIp(req);

// Failed logins per IP: 5 per 15 minutes (successful logins don't count).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByIp,
  validate: { keyGeneratorIpFallback: false, trustProxy: false, xForwardedForHeader: false },
  handler: (req, res) => {
    console.warn(`[security] login rate limit hit ip=${clientIp(req)} country=${clientCountry(req)}`);
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
  },
});

// General API ceiling per IP.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByIp,
  validate: { keyGeneratorIpFallback: false, trustProxy: false, xForwardedForHeader: false },
  message: { error: 'Too many requests' },
});

// Per-account lockout — stops distributed brute force that rotates IPs.
const LOCK_THRESHOLD = 5;
const BASE_LOCK_MS = 15 * 60 * 1000;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;
const accountFailures = new Map(); // username -> { count, lockedUntil, locks }

function accountLockedFor(username) {
  const rec = accountFailures.get(username);
  if (!rec || !rec.lockedUntil) return 0;
  const left = rec.lockedUntil - Date.now();
  return left > 0 ? left : 0;
}

function recordFailure(username) {
  const rec = accountFailures.get(username) || { count: 0, lockedUntil: 0, locks: 0 };
  rec.count += 1;
  if (rec.count >= LOCK_THRESHOLD) {
    rec.locks += 1;
    rec.count = 0;
    rec.lockedUntil = Date.now() + Math.min(BASE_LOCK_MS * 2 ** (rec.locks - 1), MAX_LOCK_MS);
  }
  accountFailures.set(username, rec);
  if (accountFailures.size > 10000) accountFailures.delete(accountFailures.keys().next().value);
  return rec;
}

function recordSuccess(username) {
  accountFailures.delete(username);
}

module.exports = {
  clientIp,
  clientCountry,
  securityHeaders,
  originAllowed,
  originGuard,
  accessEnabled,
  checkAccess,
  cloudflareAccessGuard,
  turnstileEnabled,
  TURNSTILE_SITE_KEY,
  verifyTurnstile,
  loginLimiter,
  apiLimiter,
  accountLockedFor,
  recordFailure,
  recordSuccess,
};
