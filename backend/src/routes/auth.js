const router = require('express').Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');
const totp = require('../services/totp');
const { requireAuth } = require('../middleware/auth');
const { sendToAll } = require('../services/notifications');
const {
  clientIp,
  clientCountry,
  loginLimiter,
  verifyTurnstile,
  turnstileEnabled,
  TURNSTILE_SITE_KEY,
  accountLockedFor,
  recordFailure,
  recordSuccess,
} = require('../middleware/security');

// Used so unknown usernames take as long as wrong passwords (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-password', 12);

const PENDING_TTL_MS = 5 * 60 * 1000;
const MAX_TOTP_TRIES = 5;
const lastTotpStep = new Map(); // userId -> last accepted time step (blocks code replay)

function completeLogin(req, res, user, ip, country) {
  // Prevent session fixation: issue a brand-new session id on login.
  req.session.regenerate((err) => {
    if (err) { console.error(err); return res.status(500).json({ error: 'Server error' }); }
    recordSuccess(user.username);
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.ip = ip;
    req.session.save((saveErr) => {
      if (saveErr) { console.error(saveErr); return res.status(500).json({ error: 'Server error' }); }
      console.log(`[auth] login OK user="${user.username}" ip=${ip} country=${country} 2fa=${Boolean(user.totpSecret)}`);
      sendToAll('🔐 New login', `${user.username} signed in from ${ip} (${country})`, 'auth-login').catch(() => {});
      res.json({ ok: true, username: user.username });
    });
  });
}

// Public config the login page needs (no secrets).
router.get('/config', (req, res) => {
  res.json({ turnstileSiteKey: turnstileEnabled ? TURNSTILE_SITE_KEY : null });
});

router.post('/login', loginLimiter, async (req, res) => {
  const ip = clientIp(req);
  const country = clientCountry(req);
  try {
    const { username, password, turnstileToken } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password
        || username.length > 64 || password.length > 256) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    if (!(await verifyTurnstile(turnstileToken, ip))) {
      console.warn(`[auth] turnstile failed user="${username}" ip=${ip} country=${country}`);
      return res.status(403).json({ error: 'Human verification failed. Please retry.' });
    }

    const lockedMs = accountLockedFor(username);
    if (lockedMs > 0) {
      console.warn(`[auth] login on locked account user="${username}" ip=${ip} country=${country}`);
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }

    const user = await User.findOne({ where: { username } });
    const valid = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !valid) {
      const rec = recordFailure(username);
      console.warn(`[auth] FAILED login user="${username}" ip=${ip} country=${country}`);
      if (rec.lockedUntil > Date.now()) {
        sendToAll('🚨 Login lockout', `Account "${username}" locked after repeated failures (last from ${ip}, ${country})`, 'auth-lockout').catch(() => {});
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.totpSecret) {
      // Password OK — now require the authenticator code. Fresh session, NOT logged in yet.
      return req.session.regenerate((err) => {
        if (err) { console.error(err); return res.status(500).json({ error: 'Server error' }); }
        req.session.pending = { userId: user.id, at: Date.now(), tries: 0 };
        req.session.save(() => res.json({ totpRequired: true }));
      });
    }

    completeLogin(req, res, user, ip, country);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/totp', loginLimiter, async (req, res) => {
  const ip = clientIp(req);
  const country = clientCountry(req);
  try {
    const pending = req.session?.pending;
    if (!pending || Date.now() - pending.at > PENDING_TTL_MS) {
      if (req.session) delete req.session.pending;
      return res.status(401).json({ error: 'Login expired. Start again.', restart: true });
    }
    const user = await User.findByPk(pending.userId);
    if (!user || !user.totpSecret) return res.status(401).json({ error: 'Login expired. Start again.', restart: true });
    if (accountLockedFor(user.username) > 0) {
      delete req.session.pending;
      return req.session.save(() => res.status(429).json({ error: 'Too many attempts. Try again later.', restart: true }));
    }

    const code = typeof req.body?.code === 'string' ? req.body.code.replace(/\s+/g, '') : '';
    const step = totp.verify(user.totpSecret, code);
    const replay = step !== null && lastTotpStep.get(user.id) >= step;

    if (step === null || replay) {
      pending.tries += 1;
      const rec = recordFailure(user.username); // counts toward the account lockout
      console.warn(`[auth] FAILED 2FA user="${user.username}" ip=${ip} country=${country}${replay ? ' (replayed code)' : ''}`);
      if (pending.tries >= MAX_TOTP_TRIES) {
        delete req.session.pending;
        sendToAll('🚨 2FA failures', `Wrong 2FA codes for "${user.username}" from ${ip} (${country}) — your password may be known`, 'auth-2fa').catch(() => {});
        return req.session.save(() => res.status(401).json({ error: 'Too many wrong codes. Start again.', restart: true }));
      }
      if (rec.lockedUntil > Date.now()) {
        delete req.session.pending;
        return req.session.save(() => res.status(429).json({ error: 'Too many attempts. Try again later.', restart: true }));
      }
      return req.session.save(() => res.status(401).json({ error: 'Invalid code' }));
    }

    lastTotpStep.set(user.id, step);
    delete req.session.pending;
    completeLogin(req, res, user, ip, country);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sc.sid', { httpOnly: true, sameSite: 'strict' });
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.session.username });
});

module.exports = router;
