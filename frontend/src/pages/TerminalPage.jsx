import { SERVER_NAME } from '../App.jsx';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export default function TerminalPage() {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  const focusTerminal = useCallback(() => {
    if (termRef.current) {
      termRef.current.focus();
    }
  }, []);

  const connect = useCallback(() => {
    if (!containerRef.current) return;

    // Reset previous instances if any
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }

    // 1. Initialize Terminal
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Cascadia Code", monospace',
      lineHeight: 1.4,
      scrollback: 5000,
      theme: {
        background: '#0a0a0b',
        foreground: '#c8c8d8',
        cursor: '#00e8a2',
        cursorAccent: '#0a0a0b',
        selectionBackground: 'rgba(0,232,162,0.2)',
        black: '#0a0a0b',
        red: '#e8003a',
        green: '#00e8a2',
        yellow: '#e8c300',
        blue: '#0080e8',
        magenta: '#a000e8',
        cyan: '#00d0e8',
        white: '#c8c8d8',
        brightBlack: '#4a4a5a',
        brightRed: '#ff2040',
        brightGreen: '#20ffb0',
        brightYellow: '#ffd020',
        brightBlue: '#20a0ff',
        brightMagenta: '#c020ff',
        brightCyan: '#20e0ff',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Open terminal inside DOM element
    term.open(containerRef.current);
    try {
      fitAddon.fit();
    } catch {}

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Focus immediately
    term.focus();

    // 2. Setup WebSocket connection
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname;
    const port = import.meta.env.DEV ? '3000' : window.location.port;
    const wsUrl = `${proto}://${host}:${port}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      term.writeln('\x1b[32m╔══════════════════════════════════════╗\x1b[0m');
      term.writeln(`\x1b[32m║  ServerCtrl Terminal — ${SERVER_NAME.slice(0, 12).padEnd(12)}║\x1b[0m`);
      term.writeln('\x1b[32m╚══════════════════════════════════════╝\x1b[0m');
      term.writeln('');
      term.focus();
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'output') {
          term.write(msg.data);
        } else if (msg.type === 'exit') {
          term.writeln('\r\n\x1b[33m[session ended]\x1b[0m');
          setConnected(false);
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      term.writeln('\r\n\x1b[31m[disconnected]\x1b[0m');
    };

    ws.onerror = () => {
      setError('WebSocket connection failed');
      setConnected(false);
    };

    // 3. User Keystrokes -> WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // 4. Send initial resize
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  }, []);

  useEffect(() => {
    connect();

    // Handle auto-resize on container dimension change
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && termRef.current) {
        try {
          fitAddonRef.current.fit();
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'resize',
                cols: termRef.current.cols,
                rows: termRef.current.rows,
              })
            );
          }
        } catch {}
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (termRef.current) {
        termRef.current.dispose();
      }
    };
  }, [connect]);

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
            <button className="btn btn-green" onClick={connect}>
              ↻ reconnect
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '9px 14px',
            marginBottom: '12px',
            background: 'rgba(232,0,58,0.07)',
            border: '1px solid rgba(232,0,58,0.28)',
            color: 'var(--red)',
            fontSize: '12px',
            borderRadius: '4px',
            flexShrink: 0,
          }}
        >
          ✗ {error} — ensure the backend is running and node-pty is installed
        </div>
      )}

      {/* Terminal container */}
      <div
        onClick={focusTerminal}
        style={{
          flex: 1,
          background: '#0a0a0b',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          overflow: 'hidden',
          position: 'relative',
          minHeight: 0,
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)',
          cursor: 'text',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.6)',
            flexShrink: 0,
            cursor: 'default',
          }}
        >
          {['var(--red)', 'var(--yellow)', 'var(--green)'].map((c, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.65 }} />
          ))}
          <span style={{ marginLeft: '8px', color: 'var(--muted)', fontSize: '11px', fontFamily: 'JetBrains Mono' }}>
            srv@{SERVER_NAME} — bash
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              className={connected ? 'pulse-dot' : ''}
              style={!connected ? { width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)' } : {}}
            />
          </div>
        </div>

        {/* The XTerm DOM element */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            padding: '8px',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        />
      </div>
    </div>
  );
}
