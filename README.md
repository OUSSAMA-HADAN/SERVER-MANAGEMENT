# ServerCtrl

A self-hosted web panel to monitor and control a Linux server remotely, from desktop or mobile.
Dark terminal aesthetic, installable as a PWA, built to sit safely behind Cloudflare.

![Version](https://img.shields.io/badge/version-2.0.0-00e8a2?style=flat-square&labelColor=0a0a0a)
![Stack](https://img.shields.io/badge/stack-Node.js_+_React-00e8a2?style=flat-square&labelColor=0a0a0a)
![License](https://img.shields.io/badge/license-MIT-00e8a2?style=flat-square&labelColor=0a0a0a)

> ⚠️ **This panel gives full control of your server, including a live shell.**
> Treat its login like an SSH key: strong password, 2FA on, and never expose it without HTTPS.
> Read [Security](#security) before deploying.

---

## Features

- **System stats** — live CPU, RAM, disk, uptime and temperature
- **Docker** — start / stop / restart / remove containers, manage images, optional per-container links
- **Services** — control an allow-list of systemd services
- **Processes** — browse and kill processes
- **Web terminal** — full bash session over WebSocket (xterm.js + node-pty)
- **Push notifications** — server online/restarting, high CPU/RAM, container crashes, failed services, **new logins and lockouts**
- **PWA** — installable on mobile; optional Cloudflare Worker offline page
- **Security built in** — 2FA (TOTP), brute-force lockout, rate limiting, Cloudflare Turnstile, optional Cloudflare Access, hidden API surface

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js, Express, SQLite (Sequelize), ws, node-pty |
| Frontend | React, Vite, xterm.js |
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
│       ├── routes/                # auth, docker, services, processes, stats, system, push
│       ├── services/              # notifications, totp
│       └── websocket/terminal.js  # Web terminal
├── frontend/
│   ├── .env.example
│   ├── public/                    # manifest, service worker
│   └── src/
│       ├── App.jsx                # Auth context, routing (login bundle)
│       ├── Dashboard.jsx          # Lazy-loaded dashboard (served only after login)
│       ├── pages/ components/
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
After=network.target

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
After that, `./deploy.sh` rebuilds the frontend and restarts the service.

### 6. Sudo rights (service control, restart, shutdown)
Grant **only** the exact commands the panel runs — never blanket `systemctl` access:
```bash
sudo visudo -f /etc/sudoers.d/serverctrl
```
```
<your-user> ALL=(root) NOPASSWD: /usr/bin/systemctl start nginx, /usr/bin/systemctl stop nginx, /usr/bin/systemctl restart nginx
# …repeat for each service in ALLOWED_SERVICES (backend/src/routes/services.js)
<your-user> ALL=(root) NOPASSWD: /usr/sbin/shutdown -r now, /usr/sbin/shutdown -h now
```

---

## Configuration

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | ✅ | ≥ 32 random chars. The server refuses to start in production without it |
| `PORT` | | Default `3000` |
| `BIND_HOST` | | Interface to listen on (default `0.0.0.0`). Use `127.0.0.1` if your tunnel runs on the host |
| `SERVER_NAME` | | Name used in notifications and the 2FA app entry |
| `SESSION_HOURS` | | Login lifetime, default `12` |
| `ALLOWED_ORIGINS` | | Extra allowed browser origins (same host is always allowed) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | | Enables Cloudflare Turnstile on the login form |
| `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` | | Enables Cloudflare Access token verification on every request |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | | Optional; auto-generated into `backend/data/vapid.json` |

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
| **Brute-force protection** | 5 failed logins / 15 min per IP, plus per-account lockout (15 min, doubling up to 24 h) that also stops attacks from rotating IPs |
| **Rate limiting** | 300 API requests / min per IP; real client IP read from `CF-Connecting-IP` |
| **Bot protection** | Cloudflare Turnstile on login (when keys are set) |
| **Sessions** | `HttpOnly`, `Secure`, `SameSite=Strict`, new session id at login, server-side store |
| **CSRF / WebSocket hijacking** | Origin checks on all state-changing requests and on the terminal WebSocket; JSON-only API |
| **Hidden attack surface** | Anonymous users get `404` on every protected API route, and the dashboard code is only served after login |
| **Headers** | Strict CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, `noindex` |
| **Terminal hygiene** | App secrets stripped from the shell environment; max 3 terminals per user; every session logged |
| **Alerts** | Push notification on each successful login, lockout and repeated 2FA failure |

Recommended deployment:
1. **Use HTTPS only** — e.g. a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) so no port is opened on your router.
2. **Enable 2FA** (`npm run setup-2fa`) and use a long unique password.
3. **Cloudflare (free plan)**: Turnstile keys, *Always Use HTTPS*, HSTS, Bot Fight Mode, and a WAF rate-limit rule on `/api/auth/login`. Set *Browser Cache TTL* to "Respect existing headers".
4. **Optional:** put the hostname behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) and set `CF_ACCESS_*` — requests without a valid Access token are then rejected even if someone reaches the origin directly.
5. Bind to the interface your tunnel uses (`BIND_HOST`) or firewall the port from your LAN.

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
Enable notifications from the bell icon in the dashboard. You'll be notified about:
server online / restarting / shutting down, CPU > 85 %, RAM > 90 %, container crashes,
failed services, new logins, account lockouts and repeated 2FA failures.

## Offline page (optional)

`cloudflare-worker/offline-worker.js` shows a status page when your server is unreachable.
Set `SITE_DOMAIN` and `SERVER_NAME` at the top, then in Cloudflare: **Workers & Pages → Create Worker**,
paste the file, deploy, and add the route `your-domain.com/*`.

---

## Changelog

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
cd frontend && npx vite            # UI on :5173, proxies /api to :3000
```

The repo includes [graphify](https://github.com/Graphify-Labs/graphify) settings (`.graphifyignore`, `CLAUDE.md`) for AI-assisted navigation. Optional:
`pip install graphifyy && graphify update .` builds a local code graph in `graphify-out/` (gitignored).

---

## License

MIT
