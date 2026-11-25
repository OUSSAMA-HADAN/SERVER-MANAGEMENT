#!/bin/bash
set -e

echo "🚀 Deploying ServerCtrl..."

# Navigate to project root
cd "$(dirname "$0")"

# Build frontend
echo "📦 Building frontend..."
cd frontend
npm run build
cd ..

# Restart systemd service
echo "♻️  Restarting serverctrl service..."
sudo systemctl restart serverctrl

# Wait for service to start
sleep 2

# Check status
if systemctl is-active --quiet serverctrl; then
  echo "✅ ServerCtrl deployed successfully!"
  [ -n "$PUBLIC_URL" ] && echo "🌍 Available at: $PUBLIC_URL"
  sudo systemctl status serverctrl --no-pager -l
else
  echo "❌ Deployment failed!"
  sudo systemctl status serverctrl --no-pager -l
  exit 1
fi
