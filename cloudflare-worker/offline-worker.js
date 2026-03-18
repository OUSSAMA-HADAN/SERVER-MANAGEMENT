/**
 * Cloudflare Worker — Offline fallback for home-lab.indevs.in
 *
 * Deploy at: https://dash.cloudflare.com → Workers & Pages → Create Worker
 * Then add a Route: home-lab.indevs.in/* → this worker
 */

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SRV0HP — Offline</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --green: #00e8a2;
      --green-dim: rgba(0, 232, 162, 0.12);
      --red: #e8003a;
      --red-dim: rgba(232, 0, 58, 0.12);
      --bg: #0a0a0a;
      --surface: #111111;
      --border: rgba(255,255,255,0.07);
      --text: #e0e0e0;
      --muted: #5a5a5a;
    }

    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    /* Animated grid background */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(0, 232, 162, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 232, 162, 0.03) 1px, transparent 1px);
      background-size: 40px 40px;
      z-index: 0;
    }

    .container {
      position: relative;
      z-index: 1;
      width: min(480px, calc(100vw - 40px));
      padding: 36px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
    }

    /* Corner brackets */
    .container::before, .container::after {
      content: '';
      position: absolute;
      width: 12px;
      height: 12px;
      border-color: rgba(232, 0, 58, 0.5);
      border-style: solid;
    }
    .container::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
    .container::after  { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

    .corner-tr, .corner-bl {
      position: absolute;
      width: 12px;
      height: 12px;
      border-color: rgba(232, 0, 58, 0.5);
      border-style: solid;
    }
    .corner-tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
    .corner-bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }

    /* Header bar */
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 28px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--red);
      box-shadow: 0 0 8px var(--red);
      animation: blink 2s ease-in-out infinite;
      flex-shrink: 0;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.2; }
    }

    .hostname {
      color: var(--red);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    .timestamp {
      margin-left: auto;
      color: var(--muted);
      font-size: 10px;
      letter-spacing: 0.08em;
    }

    /* Main content */
    .code {
      font-size: 11px;
      color: var(--muted);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    h1 {
      font-size: clamp(22px, 6vw, 28px);
      font-weight: 700;
      color: var(--text);
      line-height: 1.2;
      margin-bottom: 12px;
    }

    h1 span {
      color: var(--red);
    }

    .desc {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.7;
      margin-bottom: 28px;
    }

    /* Terminal output block */
    .terminal {
      background: rgba(0,0,0,0.5);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 14px 16px;
      margin-bottom: 24px;
      font-size: 11px;
      line-height: 1.8;
    }

    .terminal .prompt { color: var(--muted); }
    .terminal .cmd    { color: var(--text); }
    .terminal .out    { color: var(--red); }
    .terminal .cursor {
      display: inline-block;
      width: 7px;
      height: 13px;
      background: var(--green);
      vertical-align: middle;
      animation: cursor-blink 1.1s step-end infinite;
      margin-left: 2px;
    }

    @keyframes cursor-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    /* Status row */
    .status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: var(--red-dim);
      border: 1px solid rgba(232, 0, 58, 0.2);
      border-radius: 3px;
      font-size: 11px;
      color: var(--red);
      margin-bottom: 20px;
    }

    .status-row svg { flex-shrink: 0; }

    /* Footer */
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }

    .footer-brand {
      font-size: 10px;
      color: var(--muted);
      letter-spacing: 0.08em;
    }

    .retry-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 5px 12px;
      font-family: inherit;
      font-size: 11px;
      cursor: pointer;
      border-radius: 3px;
      letter-spacing: 0.05em;
      transition: all 0.15s;
    }

    .retry-btn:hover {
      border-color: var(--green);
      color: var(--green);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="corner-tr"></div>
    <div class="corner-bl"></div>

    <div class="header">
      <div class="status-dot"></div>
      <span class="hostname">SRV0HP</span>
      <span class="timestamp" id="ts"></span>
    </div>

    <div class="code">ERR_ORIGIN_UNREACHABLE</div>
    <h1>Server is <span>offline</span></h1>
    <p class="desc">
      The home lab server is currently powered off or unreachable.<br>
      It will come back online automatically when the machine starts.
    </p>

    <div class="terminal">
      <div><span class="prompt">$ </span><span class="cmd">ping srv0hp.local</span></div>
      <div><span class="out">Request timeout for icmp_seq 0</span></div>
      <div><span class="out">Request timeout for icmp_seq 1</span></div>
      <div><span class="prompt">$ </span><span class="cursor"></span></div>
    </div>

    <div class="status-row">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      Origin unreachable — host is not responding
    </div>

    <div class="footer">
      <span class="footer-brand">home-lab.indevs.in</span>
      <button class="retry-btn" onclick="location.reload()">&#8635; Retry</button>
    </div>
  </div>

  <script>
    function tick() {
      document.getElementById('ts').textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
    }
    tick();
    setInterval(tick, 1000);
  </script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    // Only intercept GET/HEAD — let API requests pass and fail naturally
    const url = new URL(request.url);
    const isPage = request.method === 'GET' || request.method === 'HEAD';

    try {
      const response = await fetch(request, { cf: { cacheTtl: 0 } });

      // If origin returned a 5xx server error, show offline page for page requests
      if (isPage && response.status >= 500) {
        return new Response(OFFLINE_HTML, {
          status: 503,
          headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
        });
      }

      return response;
    } catch {
      // Origin unreachable (machine is off, network error, etc.)
      if (isPage) {
        return new Response(OFFLINE_HTML, {
          status: 503,
          headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
        });
      }

      // For non-page requests (API, assets), return a JSON error
      return new Response(JSON.stringify({ error: 'Server offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
  },
};
