import { useCallback, useEffect, useId, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';
import { api, APP_TITLE, SERVER_NAME } from '../lib/api.js';
import { TermSession } from '../lib/termSession.js';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import { PageHeader } from '../components/ui.jsx';

const MAX_TABS = 6;
const STORE_KEY = 'sc.term.tabs';
const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

const pref = {
  get(k, d) { try { const v = localStorage.getItem(`sc.term.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`sc.term.${k}`, JSON.stringify(v)); } catch {} },
};

let keySeq = 0;
const newKey = () => `t${Date.now().toString(36)}${(keySeq++).toString(36)}`;

function loadTabs() {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    if (s?.tabs?.length) return s;
  } catch {}
  return null;
}

const STATE_TEXT = {
  idle: 'Starting',
  connecting: 'Connecting',
  open: 'Connected',
  reconnecting: 'Reconnecting',
  closed: 'Disconnected',
};

// Keys that phone keyboards lack. `mod` keys latch until the next keystroke.
const KEYS = [
  { k: 'esc', label: 'Esc' },
  { k: 'tab', label: 'Tab' },
  { k: 'ctrl', label: 'Ctrl', mod: true },
  { k: 'alt', label: 'Alt', mod: true },
  { k: 'up', label: '↑', aria: 'Up arrow' },
  { k: 'down', label: '↓', aria: 'Down arrow' },
  { k: 'left', label: '←', aria: 'Left arrow' },
  { k: 'right', label: '→', aria: 'Right arrow' },
  { k: 'ctrl-c', label: '^C', aria: 'Control C' },
  { k: 'ctrl-d', label: '^D', aria: 'Control D' },
  { k: '|', label: '|', aria: 'Pipe' },
  { k: '/', label: '/', aria: 'Slash' },
  { k: '-', label: '-', aria: 'Dash' },
  { k: '~', label: '~', aria: 'Tilde' },
  { k: 'home', label: 'Home' },
  { k: 'end', label: 'End' },
  { k: 'pgup', label: 'PgUp', aria: 'Page up' },
  { k: 'pgdn', label: 'PgDn', aria: 'Page down' },
];

function shortTitle(title, index) {
  if (!title) return `shell ${index + 1}`;
  const afterColon = title.split(': ').pop();
  return afterColon.length > 24 ? `…${afterColon.slice(-23)}` : afterColon;
}

/** Hosts one TermSession; created once per tab and kept alive while mounted. */
function TerminalPane({ tab, visible, settings, register, onUpdate }) {
  const elRef = useRef(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const s = new TermSession({
      sessionId: tab.sessionId,
      fontSize: settings.fontSize,
      screenReader: settings.screenReader,
      onState: (st) => onUpdateRef.current(tab.key, st),
      onSessionId: (id) => onUpdateRef.current(tab.key, { sessionId: id }),
      onTitle: (title) => onUpdateRef.current(tab.key, { title }),
      onModifiers: (mods) => onUpdateRef.current(tab.key, { mods }),
      onShortcut: (a) => onUpdateRef.current(tab.key, { shortcut: a, at: Date.now() }),
    });
    register(tab.key, s);
    s.mount(elRef.current);
    const ro = new ResizeObserver(() => requestAnimationFrame(() => s.refit()));
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      register(tab.key, null);
      s.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.key]);

  return (
    <div
      ref={elRef}
      className="term-pane"
      role="tabpanel"
      id={`panel-${tab.key}`}
      aria-labelledby={`tab-${tab.key}`}
      hidden={!visible}
    />
  );
}

export default function TerminalPage({ active }) {
  const confirm = useConfirm();
  const toast = useToast();
  const statusId = useId();
  const searchId = useId();

  const initial = useRef(loadTabs());
  const [tabs, setTabs] = useState(() => initial.current?.tabs.map((t) => ({ ...t, state: 'idle' })) || []);
  const [activeKey, setActiveKey] = useState(() => initial.current?.active || null);
  const [fontSize, setFontSize] = useState(() => pref.get('fontSize', window.innerWidth < 640 ? 12 : 14));
  const [screenReader, setScreenReader] = useState(() => pref.get('screenReader', false));
  const [showKeys, setShowKeys] = useState(() => pref.get('keys', coarse));
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [now, setNow] = useState(Date.now());

  const sessions = useRef(new Map());
  const shellRef = useRef(null);
  const tabRefs = useRef({});
  const searchRef = useRef(null);
  const settings = { fontSize, screenReader };

  // Only claim the document title while visible (the page stays mounted).
  useEffect(() => {
    if (active) document.title = `Terminal · ${SERVER_NAME} · ${APP_TITLE}`;
  }, [active]);

  const register = useCallback((key, s) => {
    if (s) sessions.current.set(key, s);
    else sessions.current.delete(key);
  }, []);
  const current = () => sessions.current.get(activeKey);

  // ── Tab bookkeeping ──────────────────────────────────────────────────────
  const addTab = useCallback((sessionId = null) => {
    const key = newKey();
    setTabs((t) => (t.length >= MAX_TABS ? t : [...t, { key, sessionId, state: 'idle' }]));
    setActiveKey(key);
    return key;
  }, []);

  // First open: restore tabs from this browser tab, else adopt shells still
  // running on the server (e.g. after closing the browser), else start one.
  useEffect(() => {
    if (initial.current) return;
    let cancelled = false;
    api('/api/terminal/sessions')
      .then((list) => {
        if (cancelled) return;
        const detached = (list || []).filter((s) => !s.attached).slice(0, MAX_TABS);
        if (detached.length) {
          const restored = detached.map((s) => ({ key: newKey(), sessionId: s.id, state: 'idle' }));
          setTabs(restored);
          setActiveKey(restored[0].key);
          toast.success(`Reattached ${detached.length} running shell${detached.length > 1 ? 's' : ''}`);
        } else addTab();
      })
      .catch(() => { if (!cancelled) addTab(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist so a reload reattaches to the same shells.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        active: activeKey,
        tabs: tabs.map(({ key, sessionId }) => ({ key, sessionId })),
      }));
    } catch {}
  }, [tabs, activeKey]);

  const onUpdate = useCallback((key, patch) => {
    if (patch.shortcut) {
      if (patch.shortcut === 'search') { setSearchOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }
      if (patch.shortcut === 'leave') tabRefs.current[key]?.focus();
      return;
    }
    setTabs((list) => list.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }, []);

  const activeTab = tabs.find((t) => t.key === activeKey) || tabs[0];
  useEffect(() => { if (!activeTab && tabs[0]) setActiveKey(tabs[0].key); }, [activeTab, tabs]);

  // Announce connection changes of the visible tab to screen readers.
  const lastState = useRef(null);
  useEffect(() => {
    if (!activeTab || !active) return;
    const sig = `${activeTab.key}:${activeTab.state}:${activeTab.info?.kind || ''}`;
    if (sig === lastState.current) return;
    lastState.current = sig;
    if (activeTab.state === 'open') setAnnounce('Terminal connected');
    else if (activeTab.state === 'reconnecting') setAnnounce('Connection lost. Reconnecting.');
    else if (activeTab.state === 'closed') setAnnounce(activeTab.info?.message || 'Terminal disconnected');
  }, [activeTab, active]);

  // Countdown for "reconnecting in Ns".
  useEffect(() => {
    if (activeTab?.state !== 'reconnecting') return undefined;
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, [activeTab?.state]);

  // Becoming visible: fit to the now-measurable box and focus the shell.
  useEffect(() => {
    if (!active || !activeKey) return;
    const raf = requestAnimationFrame(() => {
      const s = sessions.current.get(activeKey);
      s?.refit();
      if (!screenReader || document.activeElement === document.body) s?.focus();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeKey]);

  useEffect(() => {
    const onFs = () => {
      setFullscreen(document.fullscreenElement === shellRef.current);
      requestAnimationFrame(() => current()?.refit());
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  });

  // ── Actions ──────────────────────────────────────────────────────────────
  const closeTab = async (tab) => {
    const running = tab.state === 'open' || tab.state === 'reconnecting';
    if (running) {
      const ok = await confirm('Close this shell?', {
        detail: 'The shell and any program running in it will be terminated.',
        danger: true,
        confirmLabel: 'Close shell',
      });
      if (!ok) return;
    }
    if (tab.sessionId) api(`/api/terminal/sessions/${tab.sessionId}`, { method: 'DELETE' }).catch(() => {});
    const idx = tabs.findIndex((t) => t.key === tab.key);
    const rest = tabs.filter((t) => t.key !== tab.key);
    setTabs(rest);
    if (tab.key === activeKey) {
      const next = rest[Math.min(idx, rest.length - 1)];
      setActiveKey(next?.key || null);
      if (next) requestAnimationFrame(() => tabRefs.current[next.key]?.focus());
    }
  };

  const changeFont = (delta) => {
    const n = Math.max(9, Math.min(28, fontSize + delta));
    setFontSize(n);
    pref.set('fontSize', n);
    sessions.current.forEach((s) => s.setFontSize(n));
  };

  const toggleScreenReader = () => {
    const v = !screenReader;
    setScreenReader(v);
    pref.set('screenReader', v);
    sessions.current.forEach((s) => s.setScreenReader(v));
    toast.success(v ? 'Screen reader mode on: output is exposed to assistive tech' : 'Screen reader mode off');
  };

  const toggleKeys = () => {
    const v = !showKeys;
    setShowKeys(v);
    pref.set('keys', v);
    requestAnimationFrame(() => { current()?.refit(); current()?.focus(); });
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch {
      toast.error('Full screen is not available here');
    }
  };

  const doCopy = async () => {
    const ok = await current()?.copy();
    if (ok) toast.success('Selection copied');
    else toast.error('Select text in the terminal first');
    current()?.focus();
  };

  const doPaste = async () => {
    const ok = await current()?.paste();
    if (!ok) toast.error('Clipboard access was blocked — use Ctrl+Shift+V or long-press to paste');
  };

  const runSearch = (dir) => current()?.find(query, dir);
  const closeSearch = () => {
    setSearchOpen(false);
    current()?.clearSearch();
    current()?.focus();
  };

  const onTabKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.key === activeKey);
    let next = null;
    if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
    if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
    if (e.key === 'Home') next = tabs[0];
    if (e.key === 'End') next = tabs[tabs.length - 1];
    if (e.key === 'Delete' && activeTab) { e.preventDefault(); closeTab(activeTab); return; }
    if (next) {
      e.preventDefault();
      setActiveKey(next.key);
      tabRefs.current[next.key]?.focus();
    }
  };

  const pressKey = (k) => {
    const s = current();
    if (!s) return;
    if (k.mod) s.setMods({ [k.k]: !s.mods[k.k] });
    else s.sendKey(k.k);
  };

  const info = activeTab?.info;
  const secondsLeft = info?.retryAt ? Math.max(0, Math.ceil((info.retryAt - now) / 1000)) : 0;

  return (
    <div className="page page-fill" hidden={!active}>
      <div className="term-head">
        <PageHeader title="Terminal" subtitle={<>Interactive shell on <span className="mono">{SERVER_NAME}</span>. Shells keep running for 15 minutes if you disconnect.</>} />
      </div>

      <p id={statusId} className="sr-only" role="status" aria-live="polite">{announce}</p>

      <section ref={shellRef} className="term-shell" aria-label="Terminal">
        <div className="term-bar">
          <div className="term-tabs">
            <div className="term-tablist" role="tablist" aria-label="Shells" onKeyDown={onTabKeyDown}>
              {tabs.map((t, i) => (
                <div key={t.key} className="term-tab" data-active={t.key === activeTab?.key} role="presentation">
                  <button
                    ref={(el) => { tabRefs.current[t.key] = el; }}
                    type="button"
                    role="tab"
                    id={`tab-${t.key}`}
                    aria-selected={t.key === activeTab?.key}
                    aria-controls={`panel-${t.key}`}
                    aria-keyshortcuts="Delete"
                    tabIndex={t.key === activeTab?.key ? 0 : -1}
                    className="term-tab-btn"
                    title={t.title || undefined}
                    onClick={() => { setActiveKey(t.key); requestAnimationFrame(() => sessions.current.get(t.key)?.focus()); }}
                  >
                    <span className="term-state" data-state={t.state} aria-hidden="true" />
                    <span>{shortTitle(t.title, i)}</span>
                    <span className="sr-only">, {STATE_TEXT[t.state]}. Press Delete to close.</span>
                  </button>
                  {/* Pointer shortcut; keyboard users press Delete on the tab. */}
                  <span className="term-tab-close" aria-hidden="true" title="Close shell" onClick={() => closeTab(t)}>
                    <Icon name="x" size={14} />
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-icon"
              onClick={() => addTab()}
              disabled={tabs.length >= MAX_TABS}
              aria-label={tabs.length >= MAX_TABS ? `New shell (limit of ${MAX_TABS} reached)` : 'New shell'}
              title="New shell"
            >
              <Icon name="plus" size={16} />
            </button>
          </div>

          <div className="term-tools" role="toolbar" aria-label="Terminal tools">
            <button type="button" className="btn btn-sm btn-icon" onClick={() => { setSearchOpen((v) => !v); requestAnimationFrame(() => searchRef.current?.focus()); }} aria-pressed={searchOpen} aria-label="Find in output" title="Find (Ctrl+Shift+F)">
              <Icon name="search" size={16} />
            </button>
            <button type="button" className="btn btn-sm btn-icon hide-mobile" onClick={doCopy} aria-label="Copy selection" title="Copy (Ctrl+Shift+C)">
              <Icon name="copy" size={16} />
            </button>
            <button type="button" className="btn btn-sm btn-icon" onClick={doPaste} aria-label="Paste" title="Paste (Ctrl+Shift+V)">
              <Icon name="paste" size={16} />
            </button>
            <span className="term-sep hide-mobile" aria-hidden="true" />
            <button type="button" className="btn btn-sm btn-icon hide-mobile" onClick={() => changeFont(-1)} aria-label={`Smaller text, currently ${fontSize} pixels`} title="Smaller text">
              <Icon name="zoomOut" size={16} />
            </button>
            <button type="button" className="btn btn-sm btn-icon hide-mobile" onClick={() => changeFont(1)} aria-label={`Larger text, currently ${fontSize} pixels`} title="Larger text">
              <Icon name="zoomIn" size={16} />
            </button>
            <button type="button" className="btn btn-sm btn-icon" onClick={toggleKeys} aria-pressed={showKeys} aria-label="On-screen keys" title="On-screen keys">
              <Icon name="keyboard" size={16} />
            </button>
            <button type="button" className="btn btn-sm btn-icon hide-mobile" onClick={toggleScreenReader} aria-pressed={screenReader} aria-label="Screen reader mode" title="Screen reader mode">
              <Icon name="a11y" size={16} />
            </button>
            <button type="button" className="btn btn-sm btn-icon hide-mobile" onClick={() => { current()?.clear(); current()?.focus(); }} aria-label="Clear scrollback" title="Clear scrollback">
              <Icon name="eraser" size={16} />
            </button>
            <button type="button" className="btn btn-sm btn-icon" onClick={toggleFullscreen} aria-pressed={fullscreen} aria-label="Full screen" title="Full screen">
              <Icon name={fullscreen ? 'minimize' : 'maximize'} size={16} />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="term-search" role="search">
            <label htmlFor={searchId} className="sr-only">Find in terminal output</label>
            <input
              ref={searchRef}
              id={searchId}
              className="input"
              placeholder="Find in output"
              value={query}
              onChange={(e) => { setQuery(e.target.value); current()?.find(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); runSearch(e.shiftKey ? 'prev' : 'next'); }
                if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
              }}
            />
            <button type="button" className="btn btn-sm btn-icon" onClick={() => runSearch('prev')} aria-label="Previous match"><Icon name="chevronUp" size={16} /></button>
            <button type="button" className="btn btn-sm btn-icon" onClick={() => runSearch('next')} aria-label="Next match"><Icon name="chevronDown" size={16} /></button>
            <button type="button" className="btn btn-sm btn-icon" onClick={closeSearch} aria-label="Close search"><Icon name="x" size={16} /></button>
            <span className="hint hide-mobile">Enter: next · Shift+Enter: previous · Esc: close</span>
          </div>
        )}

        <div className="term-body">
          {tabs.map((t) => (
            <TerminalPane
              key={t.key}
              tab={t}
              visible={t.key === activeTab?.key}
              settings={settings}
              register={register}
              onUpdate={onUpdate}
            />
          ))}

          {activeTab && (activeTab.state === 'reconnecting' || activeTab.state === 'closed') && (
            <div className="term-banner">
              <Icon name={activeTab.state === 'reconnecting' ? 'offline' : 'alert'} size={18} />
              <span>
                {activeTab.state === 'reconnecting'
                  ? `Connection lost. Reconnecting${secondsLeft ? ` in ${secondsLeft}s` : '…'}`
                  : info?.message || 'Disconnected.'}
              </span>
              {activeTab.state === 'reconnecting' && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => current()?.connectNow()}>Retry now</button>
              )}
              {activeTab.state === 'closed' && info?.kind === 'taken' && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => current()?.connectNow()}>Use it here</button>
              )}
              {activeTab.state === 'closed' && info?.kind !== 'taken' && info?.kind !== 'auth' && info?.kind !== 'limit' && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => current()?.restart()}>Start new shell</button>
              )}
              {activeTab.state === 'closed' && info?.kind === 'limit' && (
                <button type="button" className="btn btn-sm" onClick={() => closeTab(activeTab)}>Close tab</button>
              )}
            </div>
          )}

          {tabs.length === 0 && (
            <div className="center-screen" style={{ height: '100%', flexDirection: 'column', gap: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: '#aab1bc' }}>No open shells.</p>
              <button type="button" className="btn btn-primary" onClick={() => addTab()}><Icon name="plus" size={16} /> New shell</button>
            </div>
          )}
        </div>

        {showKeys && activeTab && (
          <div className="term-keys" role="toolbar" aria-label="Special keys">
            {KEYS.map((k) => (
              <button
                key={k.k}
                type="button"
                className="term-key"
                aria-label={k.aria}
                aria-pressed={k.mod ? Boolean(activeTab.mods?.[k.k]) : undefined}
                // Keep focus (and the phone keyboard) on the terminal.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pressKey(k)}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
      </section>

      <p className="term-footer hide-mobile">
        <span>
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>/<kbd>V</kbd> copy/paste · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> find · <kbd>F6</kbd> leave the terminal
        </span>
        <span className="mono">{activeTab ? STATE_TEXT[activeTab.state] : ''}</span>
      </p>
    </div>
  );
}
