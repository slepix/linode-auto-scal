# Linode Instance Autoscaler

A self-hosted, API-first autoscaling system for Linode Compute Instances. Automatically scales instance groups based on external metrics, manual triggers, or webhook events, with full NodeBalancer integration and drift reconciliation.

## Features

- **Metric-based autoscaling** -- Poll Prometheus, Zabbix, Datadog, Elasticsearch, Nagios, or any HTTP endpoint to scale automatically
- **Manual and webhook scaling** -- REST API and inbound webhooks for CI/CD and external triggers
- **NodeBalancer integration** -- Automatic attach/drain/detach with configurable drain wait times
- **VPC networking** -- Full support for Linode VPC interfaces with NAT 1:1 and firewall assignment
- **Drift reconciliation** -- Detects and auto-replaces missing instances, flags unmanaged Linodes
- **Readiness checks** -- TCP and HTTP health checks before marking instances active
- **Cooldown management** -- Configurable per-group cooldowns to prevent thrashing
- **Role-based API keys** -- Admin, operator, webhook, and readonly roles
- **Prometheus metrics** -- Full instrumentation of scale operations, API errors, and reconciliation timing
- **Dashboard UI** -- React + Material UI frontend for managing groups, viewing instances, and monitoring events

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Linode VM                        │
│                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  nginx   │  │  FastAPI     │  │  Go Ctrl  │  │
│  │  :80     │  │  :8000       │  │  :9090    │  │
│  │  (SPA)   │  │  REST API    │  │  Scaler   │  │
│  └──────────┘  │  Webhooks    │  │  Reconcile│  │
│                │  OpenAPI     │  │  Metrics   │  │
│                └──────┬───────┘  └─────┬─────┘  │
│                       └──────┬─────────┘        │
│                         ┌────▼────────┐         │
│                         │ PostgreSQL  │         │
│                         │ (Managed)   │         │
│                         └─────────────┘         │
└──────────────────────────────────────────────────┘
```

- **Frontend** -- React + Material UI SPA served by nginx
- **API** -- Python FastAPI service handling REST endpoints, webhooks, and API key auth
- **Controller** -- Go service that processes scale requests, runs reconciliation, and polls metrics
- **Database** -- Linode Managed PostgreSQL (or Docker Compose for local dev)

## Quick Start

### Terraform (recommended)

```bash
cd terraform/
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your Linode token and SSH key

terraform init
terraform plan
terraform apply
```

This provisions the VPC, managed database, firewall, and autoscaler VM. See [docs/deployment.md](docs/deployment.md) for details.

### Local Development

```bash
# Start the database
docker compose up -d postgres

# Install frontend dependencies
npm install

# Start the frontend dev server
npm run dev

# Start the API (in a separate terminal)
cd api && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## API Usage

All endpoints require a Bearer token. Create your first key using the bootstrap process described in [docs/deployment.md](docs/deployment.md).

```bash
export AUTOSCALER_URL="https://your-autoscaler.example.com"
export AUTOSCALER_KEY="your-api-key"

# Get group status
curl -H "Authorization: Bearer $AUTOSCALER_KEY" "$AUTOSCALER_URL/v1/groups/web-prod/status"

# Scale up
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale-up" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"amount": 2, "reason": "traffic spike"}'

# Set desired count
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"desired_count": 6}'
```

See [docs/api-examples.md](docs/api-examples.md) for comprehensive examples.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, data flows, and metrics reference |
| [Deployment](docs/deployment.md) | Terraform and Docker Compose deployment guides |
| [API Examples](docs/api-examples.md) | Copy-paste curl examples for all endpoints |
| [API Auth](docs/api-auth.md) | Authentication, roles, and API key management |
| [Group Config](docs/group-config.md) | Full group configuration reference |
| [Integrations](docs/integrations.md) | Prometheus, Grafana, GitHub Actions, Slack, PagerDuty |
| [Webhook Payloads](docs/webhook-payloads.md) | Inbound and outbound webhook formats |

## Project Structure

```
├── api/                    # Python FastAPI service
│   ├── app/
│   │   ├── routers/        # API endpoints
│   │   ├── services/       # Business logic
│   │   ├── models/         # SQLAlchemy models
│   │   └── middleware/     # Auth middleware
│   └── migrations/         # SQL schema migrations
├── controller/             # Go controller service
│   ├── cmd/controller/     # Entrypoint
│   └── internal/
│       ├── scaler/         # Scale-up/down orchestration
│       ├── reconciler/     # Drift detection and auto-replace
│       ├── metricpoller/   # External metric polling
│       ├── linode/         # Linode API client
│       ├── nodebalancer/   # NodeBalancer operations
│       ├── metrics/        # Prometheus instrumentation
│       └── readiness/      # TCP/HTTP health checks
├── src/                    # React frontend (Vite + Material UI)
│   ├── components/
│   ├── api/
│   ├── hooks/
│   └── types/
├── terraform/              # Infrastructure as code
├── docs/                   # Documentation
└── docker-compose.yml      # Local development stack
```

## License

Private. All rights reserved.
