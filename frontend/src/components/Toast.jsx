import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((message, tone = 'ok') => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    // Errors stay longer so they can be read.
    setTimeout(() => dismiss(id), tone === 'danger' ? 8000 : 4000);
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (m) => push(m, 'ok'),
    error: (m) => push(m, 'danger'),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Two live regions: polite for confirmations, assertive for failures. */}
      <div className="toasts">
        <div className="toast-region" role="status" aria-live="polite">
          {toasts.filter((t) => t.tone !== 'danger').map((t) => <ToastItem key={t.id} t={t} onClose={dismiss} />)}
        </div>
        <div className="toast-region" role="alert" aria-live="assertive">
          {toasts.filter((t) => t.tone === 'danger').map((t) => <ToastItem key={t.id} t={t} onClose={dismiss} />)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ t, onClose }) {
  return (
    <div className="toast" data-tone={t.tone}>
      <Icon name={t.tone === 'danger' ? 'alert' : 'check'} size={18} />
      <div className="toast-msg">{t.message}</div>
      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onClose(t.id)} aria-label="Dismiss notification">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export const useToast = () => useContext(ToastContext);
