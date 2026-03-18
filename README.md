# ServerCtrl

A self-hosted home lab server manager with a dark terminal aesthetic.
Monitor and control your Linux server from any device — desktop or mobile.

![ServerCtrl](https://img.shields.io/badge/version-v1.0.0_PHANTOM-00e8a2?style=flat-square&labelColor=0a0a0a)
![Stack](https://img.shields.io/badge/stack-Node.js_+_React-00e8a2?style=flat-square&labelColor=0a0a0a)
![License](https://img.shields.io/badge/license-MIT-00e8a2?style=flat-square&labelColor=0a0a0a)

---

## Features

- **System Stats** — Real-time CPU, RAM, and disk usage in the header bar
- **Docker Management** — Start, stop, restart containers and manage images
- **Service Control** — Manage systemd services (nginx, ssh, ufw, cloudflared...)
- **Process Viewer** — Browse and kill running processes
- **Push Notifications** — Get notified on server startup, shutdown, container crashes, high CPU/RAM
- **Offline Page** — Custom Cloudflare Worker page shown when the server is down
- **PWA Ready** — Installable as a mobile app via Web App Manifest
- **Authentication** — Session-based login protecting all routes
- **Responsive UI** — Fully responsive, works on mobile and desktop

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js, Express, SQLite (via Sequelize) |
| Frontend | React, Vite |
| Push Notifications | Web Push API + `web-push` |
| Infrastructure | Cloudflare Tunnel, Cloudflare Worker |

---

## Project Structure

```
server_manager/
├── backend/
│   ├── src/
│   │   ├── config/        # DB connection
│   │   ├── middleware/    # Auth middleware
│   │   ├── models/        # Sequelize models
│   │   ├── routes/        # API routes
│   │   └── services/      # Business logic (notifications, stats)
│   ├── data/              # SQLite DB + VAPID keys (gitignored)
│   ├── server.js
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Route pages
│   │   └── App.jsx
│   └── public/
│       ├── sw.js          # Service worker (push notifications)
│       └── manifest.json
└── cloudflare-worker/
    └── offline-worker.js  # Custom offline page worker
```

---

## Setup

### Prerequisites
- Node.js 18+
- A Linux server with systemd
- Cloudflare account (for tunnel + worker)

### 1. Clone
```bash
git clone https://github.com/OUSSAMA-HADAN/SERVER-MANAGEMENT.git
cd SERVER-MANAGEMENT
```

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your values
node server.js
```

### 3. Frontend
```bash
cd frontend
npm install
npm run build
# Serve the dist/ folder or use a reverse proxy
```

### 4. Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Description |
|---|---|
| `PORT` | Backend port (default: 3001) |
| `SESSION_SECRET` | Random secret for session encryption |
| `ADMIN_USERNAME` | Login username |
| `ADMIN_PASSWORD` | Login password |
| `VAPID_PUBLIC_KEY` | Optional — auto-generated on first run |
| `VAPID_PRIVATE_KEY` | Optional — auto-generated on first run |

### 5. Sudoers (for service control)

To allow the backend to control systemd services without a password prompt:

```bash
sudo visudo
# Add this line:
your-user ALL=(ALL) NOPASSWD: /bin/systemctl
```

### 6. Cloudflare Worker (offline page)

1. Go to Cloudflare Dashboard → Workers & Pages → Create Worker
2. Paste the contents of `cloudflare-worker/offline-worker.js`
3. Deploy, then add a route: `your-domain.com/*` → your worker

---

## Push Notifications

VAPID keys are auto-generated on first backend start and saved to `backend/data/vapid.json`.

Notifications are sent for:
- Server coming online
- Server shutting down / restarting
- CPU usage > 85%
- RAM usage > 90%
- Docker container crash
- Service state failures

---

## License

MIT
