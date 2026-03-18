import { createContext, useContext, useState, useCallback } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null); // { message, detail, danger, resolve }

  const confirm = useCallback((message, { detail, danger = false } = {}) =>
    new Promise((resolve) => setDialog({ message, detail, danger, resolve }))
  , []);

  const close = (result) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {dialog && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => close(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              zIndex: 9000,
            }}
          />

          {/* Modal */}
          <div style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 9001,
            width: 'min(380px, calc(100vw - 32px))',
            background: 'var(--surface)',
            border: `1px solid ${dialog.danger ? 'rgba(232,0,58,0.4)' : 'var(--border)'}`,
            borderRadius: '6px',
            padding: '24px',
            boxShadow: dialog.danger
              ? '0 0 40px rgba(232,0,58,0.15), 0 8px 32px rgba(0,0,0,0.6)'
              : '0 8px 32px rgba(0,0,0,0.6)',
            animation: 'fadeInUp 0.15s ease',
            fontFamily: 'JetBrains Mono, monospace',
          }}>
            {/* Corner brackets */}
            {[
              { top: 0, left: 0, borderWidth: '1px 0 0 1px' },
              { top: 0, right: 0, borderWidth: '1px 1px 0 0' },
              { bottom: 0, left: 0, borderWidth: '0 0 1px 1px' },
              { bottom: 0, right: 0, borderWidth: '0 1px 1px 0' },
            ].map((s, i) => (
              <div key={i} style={{
                position: 'absolute', width: 8, height: 8,
                borderStyle: 'solid',
                borderColor: dialog.danger ? 'rgba(232,0,58,0.6)' : 'rgba(0,232,162,0.4)',
                ...s,
              }} />
            ))}

            {/* Icon + message */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: dialog.detail ? '10px' : '20px' }}>
              <span style={{ fontSize: '18px', lineHeight: 1, flexShrink: 0, marginTop: '1px' }}>
                {dialog.danger ? '⚠' : '?'}
              </span>
              <p style={{
                margin: 0,
                fontSize: '13px',
                color: 'var(--text)',
                lineHeight: 1.5,
                fontWeight: 500,
              }}>
                {dialog.message}
              </p>
            </div>

            {dialog.detail && (
              <p style={{
                margin: '0 0 20px 30px',
                fontSize: '11px',
                color: 'var(--muted)',
                lineHeight: 1.5,
              }}>
                {dialog.detail}
              </p>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost"
                onClick={() => close(false)}
                autoFocus
              >
                Cancel
              </button>
              <button
                className={`btn ${dialog.danger ? 'btn-red' : 'btn-green'}`}
                onClick={() => close(true)}
              >
                {dialog.danger ? '⚠ Confirm' : '✓ Confirm'}
              </button>
            </div>
          </div>
        </>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
