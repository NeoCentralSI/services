#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# NeoCentral – Initial VM Setup Script
# Run this ONCE on a fresh Ubuntu 22.04/24.04 VM
#
# Installs:
#   - Docker + Docker Compose
#   - GitHub Actions self-hosted runner (org-level)
#   - Creates deploy directory + .env template
#
# SSL/Domain is handled by Cloudflare Tunnels
#
# Usage:
#   chmod +x setup-vm.sh
#   sudo ./setup-vm.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

DEPLOY_DIR="/www/wwwroot/neocentral"
RUNNER_DIR="/home/${SUDO_USER:-$USER}/actions-runner"

echo "🚀 NeoCentral VM Setup"
echo "─────────────────────────────────────────"

# ── 1. System updates ───────────────────────────────────────────
echo "📦 Updating system packages..."
apt-get update -y
apt-get upgrade -y

# ── 2. Install Docker ───────────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    usermod -aG docker ${SUDO_USER:-$USER}
    echo "✅ Docker installed"
else
    echo "✅ Docker already installed"
fi

# ── 3. Install Docker Compose plugin ────────────────────────────
if ! docker compose version &> /dev/null; then
    echo "📦 Installing Docker Compose plugin..."
    apt-get install -y docker-compose-plugin
    echo "✅ Docker Compose installed"
else
    echo "✅ Docker Compose already installed"
fi

# ── 4. Create deploy directory ───────────────────────────────────
echo "📁 Creating deploy directory: $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
chown -R ${SUDO_USER:-$USER}:${SUDO_USER:-$USER} "$DEPLOY_DIR"

# ── 5. Create .env from template ────────────────────────────────
if [ ! -f "$DEPLOY_DIR/.env" ]; then
    cat > "$DEPLOY_DIR/.env" << 'ENVEOF'
# ─────────────────────────────────────────────────────────────────
# NeoCentral Production Environment
# Fill in ALL values before running docker compose up
# ─────────────────────────────────────────────────────────────────

# ── Cloudflare Tunnel ─────────────────────────────────────────────
# Get token from: Cloudflare Zero Trust → Networks → Tunnels → your tunnel
CLOUDFLARE_TUNNEL_TOKEN=

# ── Server ───────────────────────────────────────────────────────
NODE_ENV=production
PORT=3000
BASE_URL=https://api.neocentral.dev
FRONTEND_URL=https://neocentral.dev

# ── Database (MySQL – external, already on VM) ───────────────────
DATABASE_URL=mysql://user:password@host.docker.internal:3306/neocentral_db

# ── JWT Auth ──────────────────────────────────────────────────────
JWT_SECRET=CHANGE_ME_LONG_RANDOM_STRING
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_SECRET=CHANGE_ME_ANOTHER_LONG_RANDOM_STRING
REFRESH_TOKEN_EXPIRES_IN=30d

# ── Microsoft Azure OAuth2 ────────────────────────────────────────
CLIENT_ID=
CLIENT_SECRET=
TENANT_ID=
REDIRECT_URI=https://api.neocentral.dev/microsoft-auth/callback
SESSION_KEY=CHANGE_ME_SESSION_SECRET

# ── SMTP / Email ──────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# ── Firebase Cloud Messaging ──────────────────────────────────────
FCM_SERVICE_ACCOUNT_JSON=
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=

# ── SIA Integration ───────────────────────────────────────────────
# SIA_BASE_URL is set automatically in docker-compose (http://sia:4000)
SIA_API_TOKEN=CHANGE_ME_SIA_TOKEN
SIA_FETCH_TIMEOUT=10000
SIA_CHUNK_SIZE=200
ENABLE_SIA_CRON=false

# ── Cron Jobs ─────────────────────────────────────────────────────
ENABLE_CRON=true
CRON_TIME_NOTIFY=0 * * * *
THESIS_STATUS_CRON=30 2 * * *
THESIS_STATUS_TZ=Asia/Jakarta
GUIDANCE_REMINDER_CRON=0 7 * * *
GUIDANCE_REMINDER_TZ=Asia/Jakarta
DAILY_THESIS_REMINDER_CRON=0 9 * * *
DAILY_THESIS_REMINDER_TZ=Asia/Jakarta

# ── App Meta ──────────────────────────────────────────────────────
APP_NAME=NeoCentral API
APP_OWNER=Universitas Andalas
ENVEOF
    echo "✅ .env template created at $DEPLOY_DIR/.env"
    echo "⚠️  IMPORTANT: Edit $DEPLOY_DIR/.env and fill in all values!"
else
    echo "✅ .env already exists, skipping"
fi

# ── 6. Create initial docker-compose.yml ─────────────────────────
if [ ! -f "$DEPLOY_DIR/docker-compose.yml" ]; then
    cat > "$DEPLOY_DIR/docker-compose.yml" << 'COMPOSEEOF'
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: neocentral-tunnel
    restart: unless-stopped
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - neocentral-net
    depends_on:
      backend:
        condition: service_healthy
      frontend:
        condition: service_healthy

  backend:
    image: neocentral/services:latest
    container_name: neocentral-backend
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      REDIS_URL: redis://redis:6379
      GOTENBERG_URL: http://gotenberg:3000
      SIA_BASE_URL: http://sia:4000
    volumes:
      - uploads:/app/uploads
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      redis:
        condition: service_healthy
      gotenberg:
        condition: service_started
      sia:
        condition: service_healthy
    networks:
      - neocentral-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 40s

  frontend:
    image: neocentral/website:latest
    container_name: neocentral-frontend
    restart: unless-stopped
    networks:
      - neocentral-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  sia:
    image: neocentral/dummy-sia:latest
    container_name: neocentral-sia
    restart: unless-stopped
    environment:
      PORT: 4000
      API_TOKEN: ${SIA_API_TOKEN}
    networks:
      - neocentral-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:4000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  redis:
    image: redis:7-alpine
    container_name: neocentral-redis
    restart: unless-stopped
    command: redis-server --save 60 1 --loglevel warning
    volumes:
      - redis-data:/data
    networks:
      - neocentral-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  gotenberg:
    image: gotenberg/gotenberg:8
    container_name: neocentral-gotenberg
    restart: unless-stopped
    command:
      - gotenberg
      - "--chromium-disable-routes=false"
      - "--api-timeout=60s"
    networks:
      - neocentral-net

volumes:
  uploads:
  redis-data:

networks:
  neocentral-net:
    driver: bridge
COMPOSEEOF
    echo "✅ docker-compose.yml created"
else
    echo "✅ docker-compose.yml already exists (will be updated by backend CI/CD)"
fi

# ── 7. Install GitHub Actions self-hosted runner ────────────────
echo "🏃 Setting up GitHub Actions self-hosted runner..."
if [ ! -d "$RUNNER_DIR" ]; then
    mkdir -p "$RUNNER_DIR"
    chown -R ${SUDO_USER:-$USER}:${SUDO_USER:-$USER} "$RUNNER_DIR"
    echo "📁 Runner directory created: $RUNNER_DIR"
    echo ""
    echo "⚠️  You need to manually configure the runner:"
    echo "   1. Go to https://github.com/organizations/NeoCentralSI/settings/actions/runners/new"
    echo "   2. Select Linux → x64"
    echo "   3. Follow the download & configure steps (run as ${SUDO_USER:-$USER}, NOT root)"
    echo "   4. Install as service: sudo ./svc.sh install ${SUDO_USER:-$USER}"
    echo "   5. Start service:      sudo ./svc.sh start"
    echo ""
else
    echo "✅ Runner directory already exists"
fi

# ── 8. Firewall ─────────────────────────────────────────────────
if command -v ufw &> /dev/null; then
    echo "🔥 Configuring firewall..."
    ufw allow 22/tcp    # SSH
    # No need to open 80/443 — Cloudflare Tunnel connects outbound
    ufw --force enable
    echo "✅ Firewall configured (SSH only, tunnel is outbound)"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "✅ VM setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit $DEPLOY_DIR/.env with your actual values"
echo "     - CLOUDFLARE_TUNNEL_TOKEN (from Cloudflare Zero Trust)"
echo "     - DATABASE_URL, JWT secrets, etc."
echo ""
echo "  2. Install GitHub Actions self-hosted runner:"
echo "     a. Go to: github.com/organizations/NeoCentralSI/settings/actions/runners/new"
echo "     b. cd $RUNNER_DIR"
echo "     c. Follow download & configure steps (as ${SUDO_USER:-$USER}, NOT root)"
echo "     d. sudo ./svc.sh install ${SUDO_USER:-$USER}"
echo "     e. sudo ./svc.sh start"
echo ""
echo "  3. Configure Cloudflare Tunnel routes in dashboard:"
echo "     - neocentral.dev     → http://frontend:80"
echo "     - api.neocentral.dev → http://backend:3000"
echo ""
echo "  4. For website (frontend) repo, add GitHub Secrets:"
echo "     - VITE_API_BASE_URL (https://api.neocentral.dev)"
echo "     - VITE_FIREBASE_* secrets"
echo ""
echo "  5. Create 'production' environment in each repo:"
echo "     Settings → Environments → New environment → production"
echo ""
echo "  6. Push to main branch in any repo to trigger deployment"
echo "═══════════════════════════════════════════"
