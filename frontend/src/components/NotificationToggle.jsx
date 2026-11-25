import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import Icon from './Icon.jsx';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const supported = typeof window !== 'undefined'
  && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

export default function NotificationToggle({ compact = false }) {
  const toast = useToast();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setOn(Boolean(sub)))
      .catch(() => {});
  }, []);

  if (!supported) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (on) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api('/api/push/unsubscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } });
          await sub.unsubscribe();
        }
        setOn(false);
        toast.success('Push alerts turned off');
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error('Notifications are blocked in your browser settings');
        const { key } = await api('/api/push/vapid-public-key');
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
        await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
        setOn(true);
        toast.success('Push alerts turned on');
      }
    } catch (e) {
      toast.error(e.message || 'Could not change alert settings');
    } finally {
      setBusy(false);
    }
  };

  const label = on ? 'Push alerts on' : 'Push alerts off';
  return (
    <button
      type="button"
      className={`btn btn-ghost${compact ? ' btn-icon' : ''}`}
      style={compact ? undefined : { justifyContent: 'flex-start' }}
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      aria-label={compact ? 'Push alerts' : undefined}
      title={compact ? label : undefined}
    >
      {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name={on ? 'bell' : 'bellOff'} size={18} />}
      {!compact && <span>{label}</span>}
    </button>
  );
}
