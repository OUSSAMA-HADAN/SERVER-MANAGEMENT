import { useState, useEffect } from 'react';
import { apiFetch } from '../App.jsx';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export default function NotificationBell({ style = {} }) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const ok = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setSupported(ok);
    if (ok) checkSubscription();
  }, []);

  async function checkSubscription() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch {}
  }

  async function subscribe() {
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        showToast('Notifications blocked in browser settings', 'err');
        return;
      }

      const r = await apiFetch('/api/push/vapid-public-key');
      const { key } = await r.json();

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const res = await apiFetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });

      if (!res.ok) throw new Error('Failed to save subscription');
      setSubscribed(true);
      showToast('Push notifications enabled');
    } catch (e) {
      showToast(e.message || 'Failed to enable notifications', 'err');
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiFetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      showToast('Push notifications disabled');
    } catch (e) {
      showToast(e.message || 'Failed', 'err');
    } finally {
      setLoading(false);
    }
  }

  if (!supported) return null;

  return (
    <>
      <button
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={loading}
        title={subscribed ? 'Notifications on — click to disable' : 'Enable push notifications'}
        style={{
          background: 'transparent',
          border: '1px solid',
          borderColor: subscribed ? 'rgba(0,232,162,0.3)' : 'var(--border)',
          borderRadius: '3px',
          cursor: loading ? 'wait' : 'pointer',
          padding: '5px 9px',
          color: subscribed ? 'var(--green)' : 'var(--muted)',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.15s',
          width: '100%',
          justifyContent: 'flex-start',
          fontFamily: 'JetBrains Mono, monospace',
          ...style,
        }}
      >
        {loading
          ? <span className="spinner" />
          : <span>{subscribed ? '🔔' : '🔕'}</span>
        }
        <span style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {subscribed ? 'alerts on' : 'alerts off'}
        </span>
      </button>

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </>
  );
}
