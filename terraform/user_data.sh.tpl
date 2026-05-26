#!/bin/bash
set -euo pipefail
exec > >(tee /var/log/autoscaler-init.log) 2>&1

export DEBIAN_FRONTEND=noninteractive

# ─── System packages ──────────────────────────────────────────────────────────
apt-get update -qq
apt-get install -y -qq git curl ca-certificates nginx jq postgresql-client

# ─── Node.js (for building the frontend) ─────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs

# ─── Docker ───────────────────────────────────────────────────────────────────
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Docker Compose plugin (v2)
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# ─── Clone repo ───────────────────────────────────────────────────────────────
REPO_DIR=/opt/autoscaler

if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" pull --ff-only
else
  git clone https://github.com/slepix/linode-auto-scal.git "$REPO_DIR"
fi

cd "$REPO_DIR"

# ─── Discover public IP via Linode Metadata Service ──────────────────────────
echo "Checking public IP"
METADATA_TOKEN=$(curl -s -X PUT -H "Metadata-Token-Expiry-Seconds: 60" http://169.254.169.254/v1/token)
PUBLIC_IP=$(curl -s -H "Metadata-Token: $${METADATA_TOKEN}" -H "Accept: application/json" http://169.254.169.254/v1/network | jq -r '.ipv4.public[0]' | cut -d/ -f1)

# ─── Provision database and app user ─────────────────────────────────────────
# Connect as root to create the application database and a least-privilege user.
export PGPASSWORD='${db_root_password}'
DB_ROOT_URL="postgresql://${db_root_user}:${db_root_password}@${db_host}:${db_port}/defaultdb?sslmode=require"

# Create the application database if it does not exist
psql "$${DB_ROOT_URL}" -tc "SELECT 1 FROM pg_database WHERE datname = '${db_name}'" | grep -q 1 || \
  psql "$${DB_ROOT_URL}" -c "CREATE DATABASE ${db_name};"

# Create the application user if it does not exist, then grant privileges
psql "$${DB_ROOT_URL}" -tc "SELECT 1 FROM pg_roles WHERE rolname = '${db_app_user}'" | grep -q 1 || \
  psql "$${DB_ROOT_URL}" -c "CREATE USER ${db_app_user} WITH PASSWORD '${db_app_password}';"

psql "postgresql://${db_root_user}:${db_root_password}@${db_host}:${db_port}/${db_name}?sslmode=require" <<'GRANTSQL'
GRANT CONNECT ON DATABASE ${db_name} TO ${db_app_user};
GRANT USAGE ON SCHEMA public TO ${db_app_user};
GRANT CREATE ON SCHEMA public TO ${db_app_user};
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${db_app_user};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${db_app_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${db_app_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${db_app_user};
GRANTSQL

# Run all schema migrations in order
DB_APP_URL="postgresql://${db_root_user}:${db_root_password}@${db_host}:${db_port}/${db_name}?sslmode=require"
for migration in $(ls "$REPO_DIR/api/migrations/"*.sql | sort); do
  echo "Applying migration: $migration"
  psql "$${DB_APP_URL}" -f "$migration"
done

# ─── Bootstrap admin API key ─────────────────────────────────────────────────
ADMIN_API_KEY="sk-$(openssl rand -hex 32)"
KEY_HASH=$(printf '%s' "$${ADMIN_API_KEY}" | sha256sum | awk '{print $1}')

psql "$${DB_APP_URL}" -c "
INSERT INTO api_keys (id, name, key_hash, role, enabled)
VALUES ('bootstrap', 'bootstrap-admin', '$${KEY_HASH}', 'admin', true)
ON CONFLICT (id) DO NOTHING;
"

mkdir -p /root/.autoscaler
echo "$${ADMIN_API_KEY}" > /root/.autoscaler/admin-api-key
chmod 600 /root/.autoscaler/admin-api-key

unset PGPASSWORD

# ─── Write .env ───────────────────────────────────────────────────────────────
# App containers connect as the limited app user, not root.
cat > .env <<ENVEOF
AUTOSCALER_SECRET_KEY=${autoscaler_secret_key}
DATABASE_URL=postgresql://${db_app_user}:${db_app_password}@${db_host}:${db_port}/${db_name}?sslmode=require
CONTROLLER_DATABASE_URL=postgres://${db_app_user}:${db_app_password}@${db_host}:${db_port}/${db_name}?sslmode=require
VITE_API_URL=http://$${PUBLIC_IP}:8000
ENVEOF

# ─── Build the frontend ───────────────────────────────────────────────────────
npm ci
VITE_API_URL="http://$${PUBLIC_IP}:8000" npm run build

# ─── Serve frontend with nginx ────────────────────────────────────────────────
# Copy build output to nginx webroot
rm -rf /var/www/html/*
cp -r dist/* /var/www/html/

# Write nginx site config: serve SPA, proxy /healthz for convenience
cat > /etc/nginx/sites-available/autoscaler <<'NGINXEOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /var/www/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Optional: surface API health via nginx
    location /healthz {
        proxy_pass http://127.0.0.1:8000/healthz;
        proxy_set_header Host $host;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/autoscaler /etc/nginx/sites-enabled/autoscaler
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# ─── Generate go.sum for controller ──────────────────────────────────────────
docker run --rm -v "$REPO_DIR/controller":/app -w /app golang:1.22-alpine go mod download

# ─── Build and start backend containers ──────────────────────────────────────
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api controller

echo "Autoscaler deployed at $(date)"
