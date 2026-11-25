# ServerCtrl

A self-hosted web panel to monitor and control a Linux server remotely, from desktop or mobile.
Accessible dark/light interface, installable as a PWA, built to sit safely behind Cloudflare (Tunnel + Access) with Tailscale as a backup path.

![Version](https://img.shields.io/badge/version-2.1.0-00e8a2?style=flat-square&labelColor=0a0a0a)
![Stack](https://img.shields.io/badge/stack-Node.js_+_React-00e8a2?style=flat-square&labelColor=0a0a0a)
![License](https://img.shields.io/badge/license-MIT-00e8a2?style=flat-square&labelColor=0a0a0a)

> ⚠️ **This panel gives full control of your server, including a live shell.**
> Treat its login like an SSH key: strong password, 2FA on, and never expose it without HTTPS.
> Read [Security](#security) before deploying.

---

## Features

- **System stats** — live CPU (with history), load, RAM and swap, every disk, network throughput, uptime and CPU temperature, read straight from `/proc` and `/sys`
- **Docker** — start / stop / restart / remove containers, view logs, manage images, optional per-container links
- **Services** — control an allow-list of systemd services (configurable with `SERVICES`)
- **Processes** — current CPU per process (like `top`), sortable and filterable; end with SIGTERM or force-kill
- **Web terminal** — real shells over WebSocket (xterm.js + node-pty): tabs, auto-reconnect, sessions that survive dropped connections and reloads, search, copy/paste, on-screen keys for phones, screen-reader mode
- **Push notifications** — server online/restarting, high CPU/RAM, container crashes, failed services, **new logins and lockouts**
- **PWA** — installable on mobile; optional Cloudflare Worker offline page
- **Security built in** — 2FA (TOTP), brute-force lockout, rate limiting, Cloudflare Turnstile, Cloudflare Access token verification, per-address listeners, hidden API surface
- **Accessible** — WCAG AA contrast, full keyboard use, screen-reader labels and live announcements, reduced motion, automatic light theme, mobile layout

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js, Express, SQLite (Sequelize), ws, node-pty |
| Frontend | React, Vite, xterm.js, self-hosted Inter + JetBrains Mono |
| Security | helmet, express-rate-limit, TOTP (RFC 6238), Cloudflare Turnstile / Access (jose) |
| Notifications | Web Push (`web-push`) |
| Hosting | systemd + Cloudflare Tunnel (recommended) |

---

## Project structure

```
.
├── backend/
│   ├── server.js                  # HTTP + WebSocket entry point
│   ├── setup.js                   # First-time setup (creates DB + admin) — WIPES the DB
│   ├── reset-password.js          # Change password, revoke all sessions
│   ├── setup-2fa.js               # Enroll / remove TOTP 2FA (QR code in terminal)
│   ├── container-links.example.json
│   ├── .env.example
│   └── src/
│       ├── app.js                 # Express app + middleware order
│       ├── config/                # DB, container links
│       ├── middleware/
│       │   ├── auth.js            # Sessions
│       │   ├── security.js        # Headers, rate limits, lockout, Turnstile, Cloudflare Access
│       │   └── stealth.js         # Hides protected API + dashboard code from anonymous users
│       ├── models/                # User, PushSubscription
│       ├── routes/                # auth, docker, services, processes, stats, system, push, terminal, containerLinks
│       ├── services/              # metrics (/proc), procs (/proc), run (execFile), notifications, totp
│       └── websocket/terminal.js  # Web terminal (PTY sessions, reattach, heartbeat)
├── frontend/
│   ├── .env.example
│   ├── public/                    # manifest, service worker, icon
│   └── src/
│       ├── App.jsx                # Providers + routing (login bundle)
│       ├── Dashboard.jsx          # Lazy-loaded dashboard (served only after login)
│       ├── styles.css             # Design system: tokens, components, themes
│       ├── lib/                   # api, auth, metrics, polling, formatting, terminal session
│       ├── components/            # layout, icons, dialogs, toasts, UI primitives
│       └── pages/                 # Login, Overview, Services, Docker, Processes, Terminal
├── cloudflare-worker/offline-worker.js
└── deploy.sh                      # Build frontend + restart systemd service
```

---

## Setup

### Prerequisites
- Linux server with systemd
- Node.js 20+ and build tools for native modules (`build-essential`, `python3`)
- Optional: Docker, a domain on Cloudflare

### 1. Install
```bash
git clone <this-repo-url> serverctrl
cd serverctrl

cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Configure
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp backend/container-links.example.json backend/container-links.json   # optional
chmod 600 backend/.env
```
Generate a session secret and put it in `backend/.env`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Create the admin account and enable 2FA
```bash
cd backend
npm run setup        # creates the database + admin user (only on first install!)
npm run setup-2fa    # scan the QR code with Google Authenticator, Aegis, Authy, 2FAS…
```

### 4. Build and run
```bash
cd frontend && npm run build && cd ..
cd backend && NODE_ENV=production node server.js
```
The panel listens on `PORT` (default `3000`).

### 5. Run as a service (systemd)
```ini
# /etc/systemd/system/serverctrl.service
[Unit]
Description=ServerCtrl
After=network-online.target docker.service tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/serverctrl/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now serverctrl
```
After that, `./deploy.sh` rebuilds the frontend and restarts the service. A restart ends every open web-terminal shell.

### 6. Sudo rights (service control, restart, shutdown)
Grant **only** the exact commands the panel runs — never blanket `systemctl` access:
```bash
sudo visudo -f /etc/sudoers.d/serverctrl
```
```
<your-user> ALL=(root) NOPASSWD: /usr/bin/systemctl start nginx, /usr/bin/systemctl stop nginx, /usr/bin/systemctl restart nginx
# …repeat for each service listed in SERVICES (backend/.env)
<your-user> ALL=(root) NOPASSWD: /usr/sbin/shutdown -r now, /usr/sbin/shutdown -h now
```

---

## Configuration

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | ✅ | ≥ 32 random chars. The server refuses to start in production without it |
| `PORT` | | Default `3000` |
| `BIND_HOST` | | Comma-separated addresses to listen on, one listener each (default `0.0.0.0`). E.g. `127.0.0.1,172.17.0.1,100.x.y.z` = localhost, the Docker bridge cloudflared dials, Tailscale — keeps the panel off your LAN. An address that isn't up yet is retried every 10 s while the others serve |
| `SERVER_NAME` | | Name used in notifications and the 2FA app entry |
| `SESSION_HOURS` | | Login lifetime, default `12` |
| `ALLOWED_ORIGINS` | | Extra allowed browser origins (same host is always allowed) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | | Enables Cloudflare Turnstile on the login form |
| `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` | | Enables Cloudflare Access token verification (signature, issuer, audience, expiry; fails closed if the signing keys can't be fetched) |
| `ACCESS_ALLOWED_EMAILS` | | Optional: the Access token's email must be one of these |
| `ACCESS_EXEMPT_LOCAL` | | Listener addresses that skip the Access check because they never see Cloudflare traffic (e.g. `127.0.0.1,<tailscale-ip>`). App login + 2FA still apply. Decided by the address a connection arrived on, never by headers |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | | Optional; auto-generated into `backend/data/vapid.json` |
| `SERVICES` | | Comma-separated systemd units shown on the Services page (default `nginx,cloudflared,docker,ssh,ufw,cron`) |
| `TERMINAL_MAX_SESSIONS` | | Shells one user may keep open, default `6` |
| `TERMINAL_DETACH_MINUTES` | | How long a shell keeps running after its browser disconnects, default `15` |
| `TERMINAL_SHELL` | | Shell to start, default `$SHELL` or `/bin/bash` (started as a login shell) |

### `frontend/.env` (rebuild after changing)

| Variable | Description |
|---|---|
| `VITE_SERVER_NAME` | Server name shown in the dashboard and terminal |
| `VITE_APP_TITLE` | Title on the login page |

### `backend/container-links.json`
Optional map of container name → URL, shown as links in the Docker page.

---

## Security

What's built in:

| Protection | Details |
|---|---|
| **2FA (TOTP)** | Password + 6-digit code. Codes can't be replayed; wrong codes count toward lockout |
| **Brute-force protection** | 5 failed logins / 15 min per IP, plus per-account lockout (15 min, doubling up to 24 h) that also stops attacks from rotating IPs. `CF-Connecting-IP` is only trusted on tunnel listeners, so it can't be forged to dodge the limit |
| **Rate limiting** | 300 API requests / min per IP; client IP from `CF-Connecting-IP` on tunnel listeners, from the socket everywhere else |
| **Bot protection** | Cloudflare Turnstile on login (when keys are set) |
| **Cloudflare Access** | Every request on a tunnel listener needs a valid Access token, including the terminal WebSocket, which is checked before any shell starts. Signature (cached keys, refreshed once on rotation), issuer, audience, expiry and optional email are verified; fails closed if keys can't be fetched. Listeners in `ACCESS_EXEMPT_LOCAL` (Tailscale, localhost) skip it, decided by the address a connection arrived on |
| **Network exposure** | One listener per `BIND_HOST` address, so the panel can stay off the LAN; a missing interface is retried without affecting the others |
| **Sessions** | `HttpOnly`, `Secure`, `SameSite=Strict`, new session id at login, server-side store |
| **CSRF / WebSocket hijacking** | Origin checks on all state-changing requests and on the terminal WebSocket; JSON-only API |
| **Hidden attack surface** | Anonymous users get `404` on every protected API route, and the dashboard code is only served after login |
| **Headers** | Strict CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, `noindex` |
| **Terminal hygiene** | App secrets stripped from the shell environment; per-user shell limit; shells bound to their login and killed on logout or session expiry; every session logged |
| **Alerts** | Push notification on each successful login, lockout and repeated 2FA failure |

Recommended deployment:
1. **Use HTTPS only** — e.g. a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) so no port is opened on your router.
2. **Enable 2FA** (`npm run setup-2fa`) and use a long unique password.
3. **Cloudflare (free plan)**: Turnstile keys, *Always Use HTTPS*, HSTS, Bot Fight Mode, and a WAF rate-limit rule on `/api/auth/login`. Set *Browser Cache TTL* to "Respect existing headers".
4. **Optional:** put the hostname behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) and set `CF_ACCESS_*` — requests without a valid Access token are then rejected even if someone reaches the origin directly. Set `ACCESS_ALLOWED_EMAILS` to pin it to your account, and `ACCESS_EXEMPT_LOCAL` for a Tailscale/localhost listener that doesn't go through Cloudflare.
5. Bind only to the addresses you need (`BIND_HOST`) so the port isn't reachable from your LAN.
6. If a Cloudflare Worker runs on the panel's hostname (e.g. the offline page), add a route `<host>/ws/*` with **Workers: None** — proxying the terminal WebSocket through a Worker dropped every keystroke.

> **What the web shell can do.** The terminal runs as the service user. If that user is in the `docker` group, a shell can become root (`docker run -v /:/host …`); with sudo rights it can do anything sudo allows; and it can read everything the user can (this app's `.env`, tunnel tokens, SSH keys). Treat panel access as root access. For stronger isolation, run the service as a dedicated user outside the `docker` group.

Maintenance commands:
```bash
npm run reset-password   # new password + revoke all sessions
npm run setup-2fa        # (re)enroll 2FA;  add "-- --disable" to remove it
```

Security logs (logins, failures, lockouts, terminal sessions) go to the service journal:
```bash
journalctl -u serverctrl | grep -E "\[auth\]|\[terminal\]|\[security\]"
```

Found a vulnerability? Please open a private security advisory on the repository rather than a public issue.

---

## Push notifications

VAPID keys are generated on first start and stored in `backend/data/vapid.json` (gitignored).
Turn them on with **Push alerts** in the sidebar (bell icon in the top bar on mobile). You'll be notified about:
server online / restarting / shutting down, CPU > 85 %, RAM > 90 %, container crashes,
failed services, new logins, account lockouts and repeated 2FA failures.

## Offline page (optional)

`cloudflare-worker/offline-worker.js` shows a status page when your server is unreachable.
Set `SITE_DOMAIN` and `SERVER_NAME` at the top, then in Cloudflare: **Workers & Pages → Create Worker**,
paste the file, deploy, and add the route `your-domain.com/*`.
Also add a second route `your-domain.com/ws/*` with **Workers: None** so the terminal's WebSocket never passes through the Worker
(proxied through it, browser → server frames were lost: the terminal said "Connected" but keystrokes never arrived).
The Worker also passes WebSocket upgrades straight through as a second safeguard.

---

## Changelog

### v2.1.0 — Terminal rebuild and redesign
- **Access and binding:** `BIND_HOST` takes several addresses (one listener each, retried independently, so a missing Tailscale interface never takes down the tunnel listener). Cloudflare Access verification hardened: cached signing keys with one refresh on key rotation, fail closed, `exp`/`iat`/issuer/audience required, optional email allow-list, and per-listener exemption for Tailscale/localhost. `CF-Connecting-IP` trusted only on tunnel listeners.
- **Terminal rebuilt from scratch.** Dedicated `/ws/terminal` endpoint with binary I/O, output batching and backpressure, and heartbeats so idle shells survive Cloudflare's 100 s timeout. Shells outlive the browser connection (`TERMINAL_DETACH_MINUTES`) and reattach with their recent output after a reload, sleep or network drop. Tabs, search, copy/paste, font size, full screen, on-screen keys (Esc, Ctrl, Alt, arrows…) for phones, screen-reader mode. Correct sizing from the first frame (the old one stayed at 80×24 and measured the font before it loaded).
- **New interface.** One design system with accessible contrast (WCAG AA), visible focus, keyboard support throughout, screen-reader labels and live announcements, reduced-motion support and an automatic light theme. Self-hosted fonts (no Google Fonts).
- **Faster backend.** Stats are read from `/proc` and `/sys` and shared between all clients instead of running `top`/`df` every few seconds; processes show current CPU (like `top`) rather than a lifetime average; all commands run through `execFile` with no shell.
- **Fixes.** CPU temperature now comes from the CPU sensor (it was reading the Wi-Fi chip); the root disk is found automatically (no hardcoded `/dev/sda1`); killing a process sends SIGTERM first with an explicit force-kill option.
- Container logs viewer; service descriptions and uptime; confirmations before stopping services that could cut off access.


### v2.0.0 — Security update
- Two-factor authentication (TOTP) with replay protection
- Brute-force protection: per-IP rate limits + escalating per-account lockout
- Cloudflare Turnstile on login, optional Cloudflare Access verification
- Hardened sessions (`Secure`, `SameSite=Strict`, regenerated on login, 12 h lifetime)
- CSRF and cross-site WebSocket hijacking protection
- Protected API routes and dashboard code hidden from anonymous visitors
- Security headers (CSP, HSTS, frame denial), request size limits, no stack traces
- Secrets stripped from the web terminal environment; terminal sessions logged
- Login / lockout / 2FA-failure push alerts
- `reset-password` and `setup-2fa` maintenance scripts
- Server name, title and container links are now configurable (no hardcoded values)
- Dependency security updates (`ws`, `express`)

### v1.0.0
- Initial release: stats, Docker, services, processes, web terminal, push notifications, PWA

---

## Development

```bash
cd backend && npm run dev          # API on :3000
cd frontend && npx vite            # UI on :5173, proxies /api and /ws to :3000
```

Terminal over the dev proxy: Vite forwards `/ws` to the backend, so `http://localhost:5173/terminal` works like production.

The repo includes [graphify](https://github.com/Graphify-Labs/graphify) settings (`.graphifyignore`, `CLAUDE.md`) for AI-assisted navigation. Optional:
`pip install graphifyy && graphify update .` builds a local code graph in `graphify-out/` (gitignored). Run `graphify update .` again after code changes to keep it current (AST only, no API cost).

---

## License

MIT
