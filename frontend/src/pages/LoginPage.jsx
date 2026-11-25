import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, APP_TITLE, SERVER_NAME } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePageTitle } from '../lib/usePageTitle.js';
import Icon from '../components/Icon.jsx';

export default function LoginPage() {
  usePageTitle('Sign in');
  const { login, expired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState('password'); // 'password' | 'totp'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [siteKey, setSiteKey] = useState(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const widgetRef = useRef(null);
  const widgetId = useRef(null);
  const codeRef = useRef(null);
  const userRef = useRef(null);

  const errId = useId();
  const capsId = useId();

  // Cloudflare Turnstile, when the server has it configured.
  useEffect(() => {
    api('/api/auth/config').then((c) => { if (c?.turnstileSiteKey) setSiteKey(c.turnstileSiteKey); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    const render = () => {
      if (!window.turnstile || !widgetRef.current || widgetId.current !== null) return;
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        theme: window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
        callback: (t) => setTurnstileToken(t),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    };
    if (window.turnstile) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [siteKey]);

  const resetTurnstile = () => {
    if (window.turnstile && widgetId.current !== null) window.turnstile.reset(widgetId.current);
    setTurnstileToken('');
  };

  useEffect(() => {
    if (step === 'totp') codeRef.current?.focus();
    else userRef.current?.focus();
  }, [step]);

  const submit = async (e, codeOverride) => {
    e?.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const data = step === 'password'
        ? await api('/api/auth/login', { method: 'POST', body: { username, password, turnstileToken } })
        : await api('/api/auth/totp', { method: 'POST', body: { code: codeOverride ?? code } });
      if (data.totpRequired) {
        setPassword('');
        setStep('totp');
        return;
      }
      login({ username: data.username });
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message || 'Sign-in failed');
      setCode('');
      if (step === 'password') resetTurnstile();
      // The server tells us when the 2FA step must start over.
      if (step === 'totp' && /start again|expired|try again later/i.test(err.message)) {
        setStep('password');
        resetTurnstile();
      }
      if (step === 'totp') codeRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const onCode = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) submit(null, digits);
  };

  const needsTurnstile = step === 'password' && siteKey && !turnstileToken;
  const describedBy = [error ? errId : null, capsLock ? capsId : null].filter(Boolean).join(' ') || undefined;

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-head">
          <div className="brand-mark" aria-hidden="true"><Icon name="skull" size={26} /></div>
          <h1>{step === 'totp' ? 'Two-factor verification' : `Sign in to ${APP_TITLE}`}</h1>
          <p className="muted">
            {step === 'totp'
              ? 'Enter the 6-digit code from your authenticator app.'
              : <>Server <span className="mono text-2">{SERVER_NAME}</span></>}
          </p>
        </div>

        {expired && step === 'password' && !error && (
          <div className="alert" data-tone="info" style={{ marginBottom: 16 }}>
            <Icon name="info" size={18} />
            <div>Your session ended. Please sign in again.</div>
          </div>
        )}

        <form className="auth-form" onSubmit={submit} noValidate>
          {step === 'password' ? (
            <>
              <div className="field">
                <label className="label" htmlFor="login-user">Username</label>
                <input
                  ref={userRef}
                  id="login-user"
                  className="input"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errId : undefined}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="login-pass">Password</label>
                <div className="input-wrap">
                  <input
                    id="login-pass"
                    className="input"
                    style={{ paddingRight: 48 }}
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock'))}
                    onBlur={() => setCapsLock(false)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm input-end"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    aria-pressed={showPw}
                    style={{ background: 'transparent' }}
                  >
                    <Icon name={showPw ? 'eyeOff' : 'eye'} size={18} />
                  </button>
                </div>
                {capsLock && <p id={capsId} className="hint tone-warn">Caps Lock is on.</p>}
              </div>
              {siteKey && <div ref={widgetRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 65 }} />}
            </>
          ) : (
            <div className="field">
              <label className="label" htmlFor="login-code">Authentication code</label>
              <input
                ref={codeRef}
                id="login-code"
                className="input otp-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => onCode(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errId : undefined}
                disabled={loading}
              />
            </div>
          )}

          {error && (
            <div id={errId} className="alert" role="alert">
              <Icon name="alert" size={18} />
              <div>{error}</div>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            style={{ minHeight: 44 }}
            disabled={loading || needsTurnstile || (step === 'password' ? !username || !password : code.length !== 6)}
            aria-busy={loading || undefined}
          >
            {loading && <span className="spinner" aria-hidden="true" />}
            {loading ? 'Verifying…' : step === 'totp' ? 'Verify' : 'Sign in'}
          </button>

          {step === 'totp' && (
            <button
              type="button"
              className="link-btn"
              style={{ alignSelf: 'center' }}
              onClick={() => { setStep('password'); setCode(''); setError(''); resetTurnstile(); }}
            >
              <Icon name="chevronLeft" size={16} /> Use a different account
            </button>
          )}
        </form>

        <p className="auth-foot">
          <Icon name="lock" size={14} /> Restricted system. Access is logged.
        </p>
      </div>
    </main>
  );
}
