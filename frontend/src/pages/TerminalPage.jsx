import { useEffect, useRef, useState } from 'react';

export default function TerminalPage() {
  const termRef = useRef(null);
  const xtermRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let term, fitAddon, ws;
    let mounted = true;

    async function init() {
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');
      await import('xterm/css/xterm.css');

      if (!mounted) return;

      term = new Terminal({
        theme: {
          background: '#0a0a0b',
          foreground: '#c8c8d8',
          cursor: '#00e8a2',
          cursorAccent: '#0a0a0b',
          selectionBackground: 'rgba(0,232,162,0.2)',
          black: '#0a0a0b', red: '#e8003a', green: '#00e8a2',
          yellow: '#e8c300', blue: '#0080e8', magenta: '#a000e8',
          cyan: '#00d0e8', white: '#c8c8d8',
          brightBlack: '#4a4a5a', brightRed: '#ff2040', brightGreen: '#20ffb0',
          brightYellow: '#ffd020', brightBlue: '#20a0ff', brightMagenta: '#c020ff',
          brightCyan: '#20e0ff', brightWhite: '#ffffff',
        },
        fontFamily: '"JetBrains Mono", "Cascadia Code", monospace',
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 5000,
        allowTransparency: true,
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      if (termRef.current) {
        term.open(termRef.current);
        fitAddon.fit();
      }

      xtermRef.current = term;
      fitRef.current = fitAddon;

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.hostname;
      const port = import.meta.env.DEV ? '3000' : window.location.port;

      ws = new WebSocket(`${proto}://${host}:${port}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mounted) return;
        setConnected(true);
        setError(null);
        term.writeln('\x1b[32m╔══════════════════════════════════════╗\x1b[0m');
        term.writeln('\x1b[32m║  ServerCtrl Terminal — SRV0HP        ║\x1b[0m');
        term.writeln('\x1b[32m╚══════════════════════════════════════╝\x1b[0m');
        term.writeln('');
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'output') term.write(msg.data);
          if (msg.type === 'exit') { term.writeln('\r\n\x1b[33m[session ended]\x1b[0m'); setConnected(false); }
        } catch {}
      };

      ws.onclose = () => { if (!mounted) return; setConnected(false); if (term) term.writeln('\r\n\x1b[31m[disconnected]\x1b[0m'); };
      ws.onerror = () => { if (!mounted) return; setError('WebSocket connection failed'); setConnected(false); };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }));
      });

      const resizeObserver = new ResizeObserver(() => {
        if (!mounted) return;
        try {
          fitAddon.fit();
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        } catch {}
      });

      if (termRef.current) resizeObserver.observe(termRef.current);
      return () => resizeObserver.disconnect();
    }

    init().catch(e => { if (mounted) setError(e.message); });

    return () => {
      mounted = false;
      if (ws) ws.close();
      if (term) term.dispose();
    };
  }, []);

  const reconnect = () => window.location.reload();

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0' }}>

      {/* Header */}
      <div className="page-header" style={{ marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 className="page-title">Terminal</h1>
          <p className="page-subtitle">live bash shell over WebSocket</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <span className={`badge badge-${connected ? 'active' : 'inactive'}`}>
            {connected ? '● connected' : '○ disconnected'}
          </span>
          {!connected && (
            <button className="btn btn-green" onClick={reconnect}>↻ reconnect</button>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          padding: '9px 14px', marginBottom: '12px',
          background: 'rgba(232,0,58,0.07)', border: '1px solid rgba(232,0,58,0.28)',
          color: 'var(--red)', fontSize: '12px', borderRadius: '4px', flexShrink: 0,
        }}>
          ✗ {error} — ensure the backend is running and node-pty is installed
        </div>
      )}

      {/* Terminal container */}
      <div style={{
        flex: 1,
        background: '#0a0a0b',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        overflow: 'hidden',
        position: 'relative',
        minHeight: 0,
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)',
      }}>
        {/* Corner brackets */}
        {[
          { top: 0, left: 0, borderWidth: '1px 0 0 1px' },
          { top: 0, right: 0, borderWidth: '1px 1px 0 0' },
          { bottom: 0, left: 0, borderWidth: '0 0 1px 1px' },
          { bottom: 0, right: 0, borderWidth: '0 1px 1px 0' },
        ].map((s, i) => (
          <div key={i} style={{
            position: 'absolute', width: 10, height: 10, zIndex: 2,
            borderStyle: 'solid', borderColor: 'var(--green)', opacity: 0.35, ...s,
          }} />
        ))}

        {/* Title bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '7px 14px', borderBottom: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.6)',
          flexShrink: 0,
        }}>
          {['var(--red)', 'var(--yellow)', 'var(--green)'].map((c, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.65 }} />
          ))}
          <span style={{ marginLeft: '8px', color: 'var(--muted)', fontSize: '11px', fontFamily: 'JetBrains Mono' }}>
            srv@SRV0HP — bash
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className={connected ? 'pulse-dot' : ''} style={!connected ? { width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)' } : {}} />
          </div>
        </div>

        <div
          ref={termRef}
          style={{ width: '100%', height: 'calc(100% - 33px)', padding: '4px' }}
        />
      </div>
    </div>
  );
}
