// One terminal tab: an xterm.js instance bound to a server shell over WebSocket.
// Handles fitting, binary I/O, reconnect with backoff and reattach-with-replay.
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';

export const TERM_FONT = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const TERM_THEME = {
  background: '#0b0d10',
  foreground: '#d7dce4',
  cursor: '#34e3a5',
  cursorAccent: '#0b0d10',
  selectionBackground: '#2b5d4e',
  selectionInactiveBackground: '#233a33',
  black: '#1b1f26',
  red: '#ff6b78',
  green: '#34e3a5',
  yellow: '#f5c84c',
  blue: '#6cbcff',
  magenta: '#c792ff',
  cyan: '#5fe0e6',
  white: '#d7dce4',
  brightBlack: '#6b7482',
  brightRed: '#ff8f99',
  brightGreen: '#6ff0c2',
  brightYellow: '#ffdc7a',
  brightBlue: '#9ad0ff',
  brightMagenta: '#dcb6ff',
  brightCyan: '#8eeef2',
  brightWhite: '#ffffff',
};

const BACKOFF = [500, 1000, 2000, 4000, 8000, 15000];
const enc = new TextEncoder();

export class TermSession {
  /**
   * @param {object} o
   * @param {string|null} o.sessionId  server session to reattach to
   * @param {number} o.fontSize
   * @param {boolean} o.screenReader
   * @param {(s: {state: string, info: object|null}) => void} o.onState
   * @param {(id: string|null) => void} o.onSessionId
   * @param {(title: string) => void} o.onTitle
   * @param {(mods: {ctrl: boolean, alt: boolean}) => void} o.onModifiers
   * @param {(action: string) => void} o.onShortcut
   */
  constructor(o) {
    this.o = o;
    this.sessionId = o.sessionId || null;
    this.state = 'idle';
    this.info = null;
    this.ws = null;
    this.attempt = 0;
    this.retryTimer = null;
    this.disposed = false;
    this.mods = { ctrl: false, alt: false };
    this.el = null;

    this.term = new Terminal({
      fontFamily: TERM_FONT,
      fontSize: o.fontSize,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'block',
      cursorInactiveStyle: 'outline',
      scrollback: 10000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
      screenReaderMode: o.screenReader,
      minimumContrastRatio: 4.5,
      theme: TERM_THEME,
    });
    this.fit = new FitAddon();
    this.search = new SearchAddon();
    this.term.loadAddon(this.fit);
    this.term.loadAddon(this.search);
    this.term.loadAddon(new WebLinksAddon((e, uri) => window.open(uri, '_blank', 'noopener,noreferrer')));
    const unicode = new Unicode11Addon();
    this.term.loadAddon(unicode);
    this.term.unicode.activeVersion = '11';

    this.term.onData((d) => this.input(d));
    this.term.onBinary((d) => this.sendBytes(Uint8Array.from(d, (c) => c.charCodeAt(0) & 0xff)));
    this.term.onResize(({ cols, rows }) => this.sendControl({ type: 'resize', cols, rows }));
    this.term.onTitleChange((t) => o.onTitle?.(t));
    this.term.attachCustomKeyEventHandler((e) => this.keyHandler(e));

    this.onOnline = () => { if (this.state === 'reconnecting') this.connectNow(); };
    this.onVisible = () => {
      if (document.visibilityState === 'visible' && this.state === 'reconnecting') this.connectNow();
    };
    window.addEventListener('online', this.onOnline);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  async mount(el) {
    this.el = el;
    // Measure glyphs with the real font, or the cell grid comes out wrong.
    try { await document.fonts.load(`${this.term.options.fontSize}px "JetBrains Mono"`); } catch {}
    if (this.disposed) return;
    this.term.open(el);
    this.opened = true;
    this.refit();
    if (this.pendingFocus) this.term.focus();
    this.connect();
  }

  // ── Connection ────────────────────────────────────────────────────────────
  setState(state, info = null) {
    this.state = state;
    this.info = info;
    this.o.onState?.({ state, info });
  }

  connect() {
    if (this.disposed) return;
    clearTimeout(this.retryTimer);
    const reconnecting = this.state === 'reconnecting';
    this.setState(reconnecting ? 'reconnecting' : 'connecting', reconnecting ? this.info : null);

    const q = new URLSearchParams({ cols: String(this.term.cols), rows: String(this.term.rows) });
    if (this.sessionId) q.set('session', this.sessionId);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/terminal?${q}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.readyReceived = false;
    this.fatal = false;
    const wanted = this.sessionId;

    ws.onmessage = (e) => {
      if (ws !== this.ws) return;
      if (typeof e.data !== 'string') {
        this.term.write(new Uint8Array(e.data));
        return;
      }
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'ready') this.onReady(msg, wanted);
      else if (msg.type === 'exit') {
        this.fatal = true;
        this.setSession(null);
        this.term.write(`\r\n\x1b[2m[process exited${msg.code ? ` with code ${msg.code}` : ''}]\x1b[0m\r\n`);
        this.setState('closed', { kind: 'exited', message: `The shell exited${msg.code ? ` with code ${msg.code}` : ''}.` });
      } else if (msg.type === 'error') {
        if (msg.code === 'restart') {
          // Server is restarting (e.g. a deploy): reconnect and get a new shell.
          this.term.write('\r\n\x1b[33m[server restarting — reconnecting…]\x1b[0m\r\n');
          return;
        }
        this.fatal = true;
        if (msg.code === 'ended') this.setSession(null);
        this.setState('closed', { kind: msg.code, message: msg.message });
      }
    };

    ws.onclose = (e) => {
      if (ws !== this.ws || this.disposed) return;
      this.ws = null;
      if (this.fatal) return;
      if (e.code === 4001) {
        this.setState('closed', { kind: 'taken', message: 'This shell was opened in another tab or device.' });
        return;
      }
      if (!this.readyReceived) {
        // Handshake refused: often an expired login (the browser only sees 1006).
        fetch('/api/auth/me', { credentials: 'include' }).then((r) => {
          if (r.ok) this.scheduleRetry();
          else {
            this.setState('closed', { kind: 'auth', message: 'Your session has ended. Sign in again.' });
            window.dispatchEvent(new Event('sc:auth-expired'));
          }
        }).catch(() => this.scheduleRetry());
        return;
      }
      this.scheduleRetry();
    };
  }

  onReady(msg, wanted) {
    this.readyReceived = true;
    this.attempt = 0;
    const lostSession = wanted && msg.id !== wanted;
    this.setSession(msg.id);
    if (msg.replay) {
      // Server replays recent output next: start from a clean screen, then
      // nudge the size so full-screen apps (vim, htop) redraw themselves.
      this.term.reset();
      setTimeout(() => {
        const { cols, rows } = this.term;
        this.sendControl({ type: 'resize', cols, rows: Math.max(2, rows - 1) });
        this.sendControl({ type: 'resize', cols, rows });
      }, 120);
    } else if (lostSession) {
      this.term.write('\r\n\x1b[33m[previous shell has ended — started a new one]\x1b[0m\r\n');
    }
    this.refit(true);
    this.setState('open');
  }

  scheduleRetry() {
    if (this.disposed) return;
    const delay = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)];
    this.attempt += 1;
    const at = Date.now() + delay;
    this.setState('reconnecting', { kind: 'retry', message: 'Connection lost.', retryAt: at });
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  connectNow() {
    clearTimeout(this.retryTimer);
    this.connect();
  }

  /** Start a fresh shell in this tab (after exit / error). */
  restart() {
    this.setSession(null);
    this.attempt = 0;
    this.term.reset();
    this.setState('idle');
    this.connect();
  }

  setSession(id) {
    this.sessionId = id;
    this.o.onSessionId?.(id);
  }

  // ── I/O ───────────────────────────────────────────────────────────────────
  input(data) {
    let d = data;
    if (this.mods.ctrl && d.length === 1) {
      const c = d.toUpperCase().charCodeAt(0);
      if (c >= 64 && c <= 95) d = String.fromCharCode(c & 0x1f);
      else if (d === ' ') d = '\x00';
    }
    if (this.mods.alt) d = `\x1b${d}`;
    if (this.mods.ctrl || this.mods.alt) this.setMods({ ctrl: false, alt: false });
    this.send(d);
  }

  send(str) {
    this.sendBytes(enc.encode(str));
  }

  sendBytes(bytes) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.state === 'open') this.ws.send(bytes);
  }

  sendControl(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Send a special key from the on-screen key bar, honouring cursor-key mode. */
  sendKey(key) {
    const app = this.term.modes.applicationCursorKeysMode;
    const arrows = { up: 'A', down: 'B', right: 'C', left: 'D' };
    if (arrows[key]) return this.send((app ? '\x1bO' : '\x1b[') + arrows[key]);
    const map = {
      esc: '\x1b', tab: '\t', home: '\x1b[H', end: '\x1b[F', pgup: '\x1b[5~', pgdn: '\x1b[6~', 'ctrl-c': '\x03', 'ctrl-d': '\x04',
    };
    if (map[key]) return this.send(map[key]);
    return this.input(key);
  }

  setMods(mods) {
    this.mods = { ...this.mods, ...mods };
    this.o.onModifiers?.(this.mods);
  }

  keyHandler(e) {
    if (e.type !== 'keydown') return true;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && e.code === 'KeyC') { this.copy(); e.preventDefault(); return false; }
    if (mod && e.shiftKey && e.code === 'KeyV') { this.paste(); e.preventDefault(); return false; }
    if (mod && e.shiftKey && e.code === 'KeyF') { this.o.onShortcut?.('search'); e.preventDefault(); return false; }
    if (e.key === 'F6') { this.o.onShortcut?.('leave'); e.preventDefault(); return false; }
    return true;
  }

  // ── View ──────────────────────────────────────────────────────────────────
  refit(force = false) {
    if (!this.el || this.disposed || !this.term.element) return;
    if (!this.el.clientWidth || !this.el.clientHeight) return;
    const before = `${this.term.cols}x${this.term.rows}`;
    try { this.fit.fit(); } catch { return; }
    if (force && before === `${this.term.cols}x${this.term.rows}`) {
      this.sendControl({ type: 'resize', cols: this.term.cols, rows: this.term.rows });
    }
  }

  setFontSize(n) {
    this.term.options.fontSize = n;
    document.fonts.load(`${n}px "JetBrains Mono"`).finally(() => this.refit());
  }

  setScreenReader(on) { this.term.options.screenReaderMode = on; }

  focus() {
    if (this.opened) this.term.focus();
    else this.pendingFocus = true;
  }
  clear() { this.term.clear(); }

  async copy() {
    const text = this.term.getSelection();
    if (!text) return false;
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  async paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) this.term.paste(text);
      this.focus();
      return true;
    } catch {
      return false;
    }
  }

  find(q, dir = 'next') {
    if (!q) { this.search.clearDecorations(); return false; }
    const opts = {
      decorations: {
        matchBackground: '#3a3f1e', activeMatchBackground: '#f5c84c', matchOverviewRuler: '#f5c84c', activeMatchColorOverviewRuler: '#ffffff',
      },
    };
    return dir === 'prev' ? this.search.findPrevious(q, opts) : this.search.findNext(q, opts);
  }

  clearSearch() { this.search.clearDecorations(); }

  dispose() {
    this.disposed = true;
    clearTimeout(this.retryTimer);
    window.removeEventListener('online', this.onOnline);
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.ws) { try { this.ws.close(1000); } catch {} this.ws = null; }
    this.term.dispose();
  }
}
