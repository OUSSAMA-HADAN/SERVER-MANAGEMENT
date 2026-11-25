import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiFetch, APP_TITLE } from '../App.jsx';

function BloodRain() {
  const drops = Array.from({ length: 35 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    height: `${Math.random() * 80 + 40}px`,
    duration: `${Math.random() * 1.5 + 1}s`,
    delay: `${Math.random() * 4}s`,
    opacity: Math.random() * 0.35 + 0.2,
  }));
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {drops.map(d => (
        <div key={d.id} style={{
          position: 'absolute', top: '-80px', left: d.left,
          width: '2px', height: d.height,
          background: 'linear-gradient(to bottom, transparent, #6b0000, #cc0000)',
          borderRadius: '0 0 3px 3px',
          animation: `rain-fall ${d.duration} ${d.delay} linear infinite`,
          opacity: d.opacity,
        }} />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [siteKey, setSiteKey] = useState(null);
  const [step, setStep] = useState('password'); // 'password' | 'totp'
  const [code, setCode] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const widgetRef = useRef(null);
  const widgetId = useRef(null);

  // Load Cloudflare Turnstile if the server has it configured.
  useEffect(() => {
    apiFetch('/api/auth/config').then(r => r.ok ? r.json() : {}).then(c => {
      if (c.turnstileSiteKey) setSiteKey(c.turnstileSiteKey);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    const render = () => {
      if (!window.turnstile || !widgetRef.current || widgetId.current !== null) return;
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        theme: 'dark',
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = step === 'password'
        ? await apiFetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, turnstileToken }),
          })
        : await apiFetch('/api/auth/totp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        setCode('');
        if (step === 'password') resetTurnstile();
        if (data.restart) { setStep('password'); setPassword(''); resetTurnstile(); }
        return;
      }
      if (data.totpRequired) { setStep('totp'); setPassword(''); return; }
      login(data);
      navigate('/');
    } catch {
      setError('Connection refused — is the daemon running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#030005',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      padding: '16px',
    }}>
      {/* Background glows */}
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(90,0,0,0.45) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', width: 'min(700px, 100vw)', height: 'min(700px, 100vw)', borderRadius: '50%', border: '1px solid rgba(100,0,0,0.1)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', width: 'min(480px, 80vw)', height: 'min(480px, 80vw)', borderRadius: '50%', border: '1px solid rgba(100,0,0,0.07)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 0 }} />

      <BloodRain />

      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.9) 100%)', pointerEvents: 'none', zIndex: 1 }} />

      {/* Card */}
      <div style={{
        position: 'relative', zIndex: 2,
        width: '100%',
        maxWidth: '400px',
        background: 'rgba(4,0,6,0.97)',
        border: '1px solid rgba(120,0,0,0.5)',
        boxShadow: '0 0 0 1px rgba(60,0,0,0.2), 0 0 80px rgba(100,0,0,0.2), 0 0 160px rgba(60,0,0,0.1), inset 0 0 60px rgba(0,0,0,0.95)',
        padding: 'clamp(28px, 5vw, 44px) clamp(20px, 5vw, 40px)',
        fontFamily: '"JetBrains Mono", monospace',
      }}>
        {/* Corner brackets */}
        {[
          { top: 0, left: 0, borderWidth: '2px 0 0 2px' },
          { top: 0, right: 0, borderWidth: '2px 2px 0 0' },
          { bottom: 0, left: 0, borderWidth: '0 0 2px 2px' },
          { bottom: 0, right: 0, borderWidth: '0 2px 2px 0' },
        ].map((s, i) => (
          <div key={i} style={{ position: 'absolute', width: 16, height: 16, borderStyle: 'solid', borderColor: 'rgba(160,0,0,0.75)', ...s }} />
        ))}

        {/* Skull */}
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: 'clamp(40px, 8vw, 52px)', lineHeight: 1, filter: 'drop-shadow(0 0 24px rgba(220,0,0,0.65))' }}>☠</span>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h1 style={{
            fontFamily: '"UnifrakturMaguntia", cursive',
            fontSize: 'clamp(22px, 5vw, 30px)',
            color: '#bb0000',
            margin: '0 0 8px',
            textShadow: '0 0 30px rgba(180,0,0,0.55), 0 0 60px rgba(120,0,0,0.25)',
            letterSpacing: '0.04em',
          }}>
            {APP_TITLE}
          </h1>
          <p style={{ color: '#3a2030', fontSize: '10px', letterSpacing: '0.25em', margin: 0, textTransform: 'uppercase' }}>
            ░ authenticate to proceed ░
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {step === 'password' && (<>
          <div>
            <label style={{ display: 'block', fontSize: '9px', color: '#5a3040', letterSpacing: '0.2em', marginBottom: '6px', textTransform: 'uppercase' }}>
              ▸ Identifier
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="username"
              required
              autoComplete="username"
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.7)',
                border: '1px solid rgba(100,0,0,0.4)',
                borderBottom: '1px solid rgba(150,0,0,0.55)',
                color: '#cc8888',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '13px', padding: '10px 12px',
                outline: 'none', transition: 'border-color 0.2s',
                borderRadius: '2px',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(180,0,0,0.8)'}
              onBlur={e => e.target.style.borderColor = 'rgba(100,0,0,0.4)'}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '9px', color: '#5a3040', letterSpacing: '0.2em', marginBottom: '6px', textTransform: 'uppercase' }}>
              ▸ Passphrase
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••"
              required
              autoComplete="current-password"
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.7)',
                border: '1px solid rgba(100,0,0,0.4)',
                borderBottom: '1px solid rgba(150,0,0,0.55)',
                color: '#cc8888',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '13px', padding: '10px 12px',
                outline: 'none', transition: 'border-color 0.2s',
                borderRadius: '2px',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(180,0,0,0.8)'}
              onBlur={e => e.target.style.borderColor = 'rgba(100,0,0,0.4)'}
            />
          </div>
          </>)}

          {step === 'totp' && (
            <div>
              <label style={{ display: 'block', fontSize: '9px', color: '#5a3040', letterSpacing: '0.2em', marginBottom: '6px', textTransform: 'uppercase' }}>
                ▸ Authenticator code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9 ]*"
                maxLength={7}
                autoFocus
                value={code}
                onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="000000"
                required
                autoComplete="one-time-code"
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.7)',
                  border: '1px solid rgba(100,0,0,0.4)',
                  borderBottom: '1px solid rgba(150,0,0,0.55)',
                  color: '#cc8888',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '20px', letterSpacing: '0.4em', textAlign: 'center', padding: '10px 12px',
                  outline: 'none', borderRadius: '2px',
                }}
              />
              <button type="button" onClick={() => { setStep('password'); setCode(''); setError(''); resetTurnstile(); }}
                style={{ marginTop: '8px', background: 'none', border: 'none', color: '#5a3040', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                ← back
              </button>
            </div>
          )}

          {siteKey && <div ref={widgetRef} style={{ display: step === 'password' ? 'flex' : 'none', justifyContent: 'center' }} />}

          {error && (
            <div style={{
              padding: '9px 12px',
              background: 'rgba(140,0,0,0.1)',
              border: '1px solid rgba(180,0,0,0.35)',
              color: '#cc3333', fontSize: '11px',
              borderRadius: '2px',
            }}>
              ✗ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (step === 'password' && siteKey && !turnstileToken) || (step === 'totp' && code.length !== 6)}
            style={{
              marginTop: '6px', width: '100%', padding: '12px',
              background: loading ? 'rgba(80,0,0,0.3)' : 'rgba(100,0,0,0.22)',
              border: '1px solid rgba(160,0,0,0.55)',
              color: '#bb0000', cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.22em',
              transition: 'all 0.2s', borderRadius: '2px',
            }}
            onMouseEnter={e => { if (!loading) { e.target.style.background = 'rgba(120,0,0,0.38)'; e.target.style.color = '#ee2020'; } }}
            onMouseLeave={e => { e.target.style.background = 'rgba(100,0,0,0.22)'; e.target.style.color = '#bb0000'; }}
          >
            {loading ? '▒▒▒ verifying ▒▒▒' : step === 'totp' ? '▸ verify code' : '▸ enter the system'}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: '22px', paddingTop: '14px', borderTop: '1px solid rgba(60,0,0,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#2a1520', fontSize: '9px', letterSpacing: '0.1em' }}>restricted</span>
          <span style={{ color: '#2a1520', fontSize: '9px', letterSpacing: '0.1em' }}>secured</span>
        </div>
      </div>
    </div>
  );
}
