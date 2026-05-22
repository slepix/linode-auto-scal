#!/bin/bash
set -euo pipefail

REPO_DIR=/opt/autoscaler
LOG_FILE=/var/log/autoscaler-update.log

exec > >(tee -a "$LOG_FILE") 2>&1
echo "═══════════════════════════════════════════════════════════════════"
echo "Update started at $(date)"
echo "═══════════════════════════════════════════════════════════════════"

cd "$REPO_DIR"

# ─── Pull latest code ────────────────────────────────────────────────────────
echo "Pulling latest changes..."
git pull --ff-only

# ─── Rebuild frontend ────────────────────────────────────────────────────────
echo "Installing frontend dependencies..."
npm ci

# Read VITE_API_URL from existing .env
VITE_API_URL=$(grep '^VITE_API_URL=' .env | cut -d= -f2-)
echo "Building frontend (VITE_API_URL=$VITE_API_URL)..."
VITE_API_URL="$VITE_API_URL" npm run build

echo "Deploying frontend to /var/www/html/..."
rm -rf /var/www/html/*
cp -r dist/* /var/www/html/
systemctl reload nginx

# ─── Rebuild and restart backend containers ──────────────────────────────────
echo "Building backend containers..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache

echo "Restarting containers..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api controller

# ─── Run migrations if any ───────────────────────────────────────────────────
echo "Checking for new migrations..."
DB_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)

# Create tracking table if it doesn't exist (app user owns this one)
psql "$DB_URL" -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);" 2>/dev/null

# Seed existing migrations that were applied during initial provisioning
psql "$DB_URL" -c "
INSERT INTO schema_migrations (filename)
SELECT '001_initial_schema.sql'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '001_initial_schema.sql')
  AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'groups');
" 2>/dev/null

for migration in api/migrations/*.sql; do
  [ -f "$migration" ] || continue
  basename=$(basename "$migration")
  already=$(psql "$DB_URL" -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$basename'" 2>/dev/null)
  if [ "$already" = "1" ]; then
    echo "  Skipping $basename (already applied)"
    continue
  fi
  echo "  Applying $basename..."
  if psql "$DB_URL" -f "$migration"; then
    psql "$DB_URL" -c "INSERT INTO schema_migrations (filename) VALUES ('$basename')" 2>/dev/null
  else
    echo "  WARNING: $basename had errors"
  fi
done

# ─── Health check ────────────────────────────────────────────────────────────
echo "Waiting for services to become healthy..."
sleep 5

if curl -sf http://localhost:8000/healthz > /dev/null 2>&1; then
  echo "API: healthy"
else
  echo "API: NOT responding (check 'docker compose logs api')"
fi

if curl -sf http://localhost:9090/healthz > /dev/null 2>&1; then
  echo "Controller: healthy"
else
  echo "Controller: NOT responding (check 'docker compose logs controller')"
fi

echo "═══════════════════════════════════════════════════════════════════"
echo "Update completed at $(date)"
echo "═══════════════════════════════════════════════════════════════════"
