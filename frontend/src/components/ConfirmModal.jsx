import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';

/**
 * confirm(title, { detail, danger, confirmLabel, altLabel }) → Promise<true | false | 'alt'>
 * Built on <dialog>: real modal semantics, focus trapping and Esc for free.
 */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const ref = useRef(null);
  const cancelRef = useRef(null);
  const returnFocus = useRef(null);
  const titleId = useId();
  const descId = useId();

  const confirm = useCallback((title, opts = {}) => new Promise((resolve) => {
    returnFocus.current = document.activeElement;
    setReq({ title, ...opts, resolve });
  }), []);

  useEffect(() => {
    const d = ref.current;
    if (req && d && !d.open) {
      d.showModal();
      // Safe default: focus Cancel for destructive actions.
      requestAnimationFrame(() => cancelRef.current?.focus());
    }
  }, [req]);

  const close = (result) => {
    ref.current?.close();
    req?.resolve(result);
    setReq(null);
    const el = returnFocus.current;
    if (el && document.contains(el)) requestAnimationFrame(() => el.focus());
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={ref}
        className="dialog"
        aria-labelledby={titleId}
        aria-describedby={req?.detail ? descId : undefined}
        onCancel={(e) => { e.preventDefault(); close(false); }}
        onClick={(e) => { if (e.target === ref.current) close(false); }}
      >
        {req && (
          <>
            <div className="dialog-body">
              <div className="dialog-icon" data-tone={req.danger ? 'danger' : undefined}>
                <Icon name={req.danger ? 'alert' : 'info'} size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 id={titleId} className="dialog-title">{req.title}</h2>
                {req.detail && <p id={descId} className="dialog-text">{req.detail}</p>}
              </div>
            </div>
            <div className="dialog-foot">
              <button ref={cancelRef} type="button" className="btn" onClick={() => close(false)}>Cancel</button>
              {req.altLabel && (
                <button type="button" className="btn btn-danger-soft" onClick={() => close('alt')}>{req.altLabel}</button>
              )}
              <button type="button" className={`btn ${req.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
                {req.confirmLabel || 'Confirm'}
              </button>
            </div>
          </>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
