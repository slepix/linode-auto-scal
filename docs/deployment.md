# Deployment Guide

## Prerequisites

- Terraform >= 1.5
- A Linode account and API token with create VM, VPC and managed DB level permissions
- Docker + Docker Compose (auto-installed by Terraform user_data)

## Quick Start (Terraform)

```bash
cd terraform/

# Create terraform.tfvars
cat > terraform.tfvars <<EOF
linode_token   = ""
ssh_public_key = ""

# Optional — auto-generated if omitted
# autoscaler_secret_key = ""
# root_password         = ""
# postgres_password     = ""
EOF

terraform init
terraform plan
terraform apply

# Retrieve the generated secret key after apply:
terraform output -raw autoscaler_secret_key
```

Terraform provisions:
- VPC + subnet (`10.8.0.0/24` default) in the target region
- Linode Managed PostgreSQL v2 — connected via the VPC subnet (`allow_list = [vpc_subnet_cidr]`)
- Autoscaler VM with VPC interface + NAT 1:1; public IP discovered at boot via the Linode Metadata Service
- Firewall rules (SSH on 22, API on 8000, HTTP on 80, metrics on 9090)
- Optional DNS A record if `domain_id` is set

The database and VM are independent resources — no circular dependency. The DB's `allow_list` is set to the VPC subnet CIDR rather than the VM's IP, which is the correct pattern for Linode Managed DB + VPC networking.

## How the VM Discovers Its Public IP

The `user_data` boot script uses the [Linode Metadata Service](https://techdocs.akamai.com/linode-api/reference/get-metadata) at `169.254.169.254` to fetch the instance's public IPv4 address at runtime:

```bash
METADATA_TOKEN=$(curl -s -X PUT -H "Metadata-Token-Expiry-Seconds: 60" http://169.254.169.254/v1/token)
PUBLIC_IP=$(curl -s -H "Metadata-Token: $METADATA_TOKEN" http://169.254.169.254/v1/network | grep 'ipv4.public' | ...)
```

This avoids a self-referential dependency in Terraform (a resource cannot reference its own attributes in `user_data`). The public IP is used to set `VITE_API_URL` so the frontend knows where to reach the backend API.

## Manual Docker Compose Deployment

```bash
# On your Linode VM:
git clone https://github.com/your-org/linode-instance-autoscaler
cd linode-instance-autoscaler

cp .env.example .env
# Edit .env:
# AUTOSCALER_SECRET_KEY=<48+ char secret>
# DATABASE_URL=postgresql://user:pass@host:port/autoscaler?sslmode=require
# CONTROLLER_DATABASE_URL=postgres://user:pass@host:port/autoscaler?sslmode=require
# VITE_API_URL=http://<your-public-ip>:8000

# With bundled postgres (development / local):
docker compose up -d

# With Linode Managed PostgreSQL (production):
# Set DATABASE_URL and CONTROLLER_DATABASE_URL to point at your managed DB
docker compose up -d api controller
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AUTOSCALER_SECRET_KEY` | Yes | Encryption key for Linode tokens and root passwords (48+ chars) |
| `DATABASE_URL` | Yes (production) | Full PostgreSQL URL for the FastAPI service |
| `CONTROLLER_DATABASE_URL` | Yes (production) | Full PostgreSQL URL for the Go controller |
| `VITE_API_URL` | Yes (frontend build) | Public URL of the API (e.g. `http://<public-ip>:8000`) |
| `POSTGRES_PASSWORD` | Yes (local postgres) | PostgreSQL password for bundled container |
| `DEBUG` | No | Enable debug logging (default: false) |
| `POLL_INTERVAL_SECONDS` | No | Controller poll interval (default: 5) |
| `RECONCILE_INTERVAL_SECONDS` | No | Reconciliation interval (default: 60) |
| `METRICS_ADDR` | No | Controller metrics listen address (default: `:9090`) |

## Bootstrap First Admin API Key

After deployment, create an initial admin key by inserting directly into the database:

```bash
# Via docker-compose (local postgres)
docker compose exec postgres psql -U autoscaler -d autoscaler -c "
INSERT INTO api_keys (id, name, key_hash, role, enabled)
VALUES (
  'bootstrap',
  'bootstrap-admin',
  encode(sha256('sk-your-bootstrap-key'::bytea), 'hex'),
  'admin',
  true
);
"
```

Then use `sk-your-bootstrap-key` with `POST /v1/api-keys` to create permanent keys.

## Health Checks

```bash
curl http://your-vm:8000/healthz
curl http://your-vm:8000/readyz
curl http://your-vm:9090/healthz
```

## Terraform Variables Reference

| Variable | Default | Description |
|---|---|---|
| `linode_token` | — | Linode API token |
| `region` | `nl-ams` | Linode region |
| `label_prefix` | `linode-autoscaler` | Prefix for all resource names |
| `instance_type` | `g6-standard-1` | VM type for the autoscaler |
| `image` | `linode/ubuntu24.04` | Linode image for the VM |
| `db_type` | `g6-nanode-1` | Managed DB node type |
| `db_engine_id` | `postgresql/18` | PostgreSQL engine version |
| `db_updates_day_of_week` | `7` (Sunday) | Maintenance window day (1=Mon, 7=Sun) |
| `db_updates_hour_of_day` | `3` | Maintenance window UTC hour (0-23) |
| `vpc_subnet_cidr` | `10.8.0.0/24` | VPC subnet CIDR |
| `ssh_public_key` | — | SSH public key for VM access |
| `autoscaler_secret_key` | auto-generated | Encryption secret (48 chars) |
| `root_password` | auto-generated | VM root password |
| `postgres_password` | auto-generated | DB password override |
| `allowed_ssh_ips` | `["0.0.0.0/0"]` | CIDRs for SSH access |
| `allowed_api_ips` | `["0.0.0.0/0"]` | CIDRs for API port 8000 |
| `allowed_metrics_ips` | `["0.0.0.0/0"]` | CIDRs for metrics port 9090 |
| `domain_id` | `""` | Linode domain ID (DNS, optional) |
| `dns_subdomain` | `autoscaler` | DNS subdomain for the A record |
