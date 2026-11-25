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

// ─── Listener-based trust ───────────────────────────────────────────────────
// Which local address a connection arrived on (not a header, so it can't be
// spoofed). Listeners in ACCESS_EXEMPT_LOCAL (e.g. Tailscale, localhost) are
// reached without Cloudflare; everything else is treated as tunnel traffic.
const EXEMPT_LOCAL = new Set((process.env.ACCESS_EXEMPT_LOCAL || '')
  .split(',').map((s) => s.trim()).filter(Boolean));
const localAddr = (req) => (req.socket?.localAddress || '').replace(/^::ffff:/, '');
const viaExempt = (req) => EXEMPT_LOCAL.has(localAddr(req));

// ─── Client IP ──────────────────────────────────────────────────────────────
// CF-Connecting-IP is set by Cloudflare, so it is only trusted on tunnel
// listeners; on direct listeners anyone could send it to dodge rate limits.
function clientIp(req) {
  if (!viaExempt(req) && req.headers['cf-connecting-ip']) return req.headers['cf-connecting-ip'];
  return (req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

function clientCountry(req) {
  return req.headers['cf-ipcountry'] || '??';
}

// ─── Origin check (CSRF + cross-site WebSocket hijacking) ───────────────────
const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
if (!isProd) extraOrigins.push(process.env.FRONTEND_URL || 'http://localhost:5173');

// ─── Security headers ───────────────────────────────────────────────────────
// Explicit wss:// entries for configured origins (older Safari does not let
// 'self' cover WebSockets).
const wsOrigins = extraOrigins
  .map((o) => { try { const u = new URL(o); return `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`; } catch { return null; } })
  .filter(Boolean);

const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://challenges.cloudflare.com', 'https://static.cloudflareinsights.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", ...wsOrigins, 'https://cloudflareinsights.com'],
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
const CF_TEAM = (process.env.CF_ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const CF_AUD = process.env.CF_ACCESS_AUD;          // Application Audience (AUD) tag
const accessEnabled = Boolean(CF_TEAM && CF_AUD);
const ISSUER = `https://${CF_TEAM}`;
// Test-only override; production always uses the team domain's certs.
const CERTS_URL = process.env.CF_ACCESS_CERTS_URL || `${ISSUER}/cdn-cgi/access/certs`;
const ALLOWED_EMAILS = new Set((process.env.ACCESS_ALLOWED_EMAILS || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));

const KEY_TTL_MS = 60 * 60 * 1000;      // routine refresh of the signing keys
const KEY_REFRESH_GAP_MS = 30 * 1000;   // at most one fetch per 30 s (unknown kids can't force a fetch storm)
let signingKeys = new Map();            // kid -> CryptoKey
let keysFetchedAt = 0;
let lastKeyFetch = 0;
let keyFetch = null;

async function fetchSigningKeys() {
  const jose = require('jose');
  const r = await fetch(CERTS_URL, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`certs endpoint returned HTTP ${r.status}`);
  const { keys } = await r.json();
  const map = new Map();
  for (const jwk of keys || []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    map.set(jwk.kid, await jose.importJWK({ ...jwk, alg: 'RS256' }, 'RS256'));
  }
  if (!map.size) throw new Error('certs endpoint returned no usable RSA keys');
  signingKeys = map;
  keysFetchedAt = Date.now();
}

/** Fetch keys unless a fetch ran in the last 30 s. Failures keep the old keys. */
function refreshSigningKeys() {
  if (keyFetch) return keyFetch;
  if (Date.now() - lastKeyFetch < KEY_REFRESH_GAP_MS) return Promise.resolve();
  lastKeyFetch = Date.now();
  keyFetch = fetchSigningKeys()
    .catch((e) => console.error(`[security] cannot fetch Cloudflare Access keys: ${e.message}`))
    .finally(() => { keyFetch = null; });
  return keyFetch;
}

async function keyForKid(kid) {
  if (!signingKeys.size || Date.now() - keysFetchedAt > KEY_TTL_MS) await refreshSigningKeys();
  if (!signingKeys.has(kid)) await refreshSigningKeys(); // rotated key: refresh once
  const key = signingKeys.get(kid);
  // No key (unknown kid, or keys never fetched) = reject: fail closed.
  if (!key) throw Object.assign(new Error(`no signing key for kid ${String(kid).slice(0, 16)}`), { code: 'ERR_ACCESS_KEY' });
  return key;
}

async function verifyAccessJwt(token) {
  const jose = require('jose');
  const { payload } = await jose.jwtVerify(token, (header) => keyForKid(header.kid), {
    issuer: ISSUER,
    audience: CF_AUD,
    algorithms: ['RS256'],
    requiredClaims: ['exp', 'iat'],
    clockTolerance: 30,
  });
  if (ALLOWED_EMAILS.size) {
    const email = String(payload.email || '').toLowerCase();
    if (!ALLOWED_EMAILS.has(email)) {
      throw Object.assign(new Error(`email not allowed: ${email || '(none)'}`), { code: 'ERR_ACCESS_EMAIL' });
    }
  }
  return payload;
}

function getAccessToken(req) {
  if (req.headers['cf-access-jwt-assertion']) return req.headers['cf-access-jwt-assertion'];
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Returns the Access identity, `true` if Access is off or the request came in on
 * an exempt listener (Tailscale/localhost), or null if it must be rejected.
 */
async function checkAccess(req) {
  if (!accessEnabled || viaExempt(req)) return true;
  const token = getAccessToken(req);
  if (!token) {
    console.warn(`[security] no Cloudflare Access token on ${localAddr(req)} ${req.method} ${(req.url || '').split('?')[0]} ip=${clientIp(req)}`);
    return null;
  }
  try {
    return await verifyAccessJwt(token);
  } catch (e) {
    console.warn(`[security] rejected Cloudflare Access token ip=${clientIp(req)}: ${e.code || ''} ${e.message}`);
    return null;
  }
}

/** Log the Access mode and pre-load the signing keys at startup. */
function initAccess() {
  if (!accessEnabled) {
    console.log('[security] Cloudflare Access verification: off');
    return Promise.resolve();
  }
  console.log(`[security] Cloudflare Access verification: on (team ${CF_TEAM}; exempt listeners: ${[...EXEMPT_LOCAL].join(', ') || 'none'}; allowed emails: ${ALLOWED_EMAILS.size || 'any'})`);
  if (process.env.CF_ACCESS_CERTS_URL) {
    console.warn(`[security] WARNING: CF_ACCESS_CERTS_URL is set (${CERTS_URL}). Tokens are verified against keys from that URL, not Cloudflare. Testing only — remove it in production.`);
  }
  return refreshSigningKeys();
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
  initAccess,
  viaExempt,
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
