# Architecture

## Overview

The Linode Instance Autoscaler is a self-hosted, API-first autoscaling system for Linode Compute Instances. It runs as two services on a single Linode VM via Docker Compose.

```
┌──────────────────────────────────────────────────┐
│                  Linode VM                        │
│                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  nginx   │  │  FastAPI     │  │  Go Ctrl  │  │
│  │  :80     │  │  :8000       │  │  :9090    │  │
│  │  (SPA)   │  │  REST API    │  │  Scaler   │  │
│  └──────────┘  │  Webhooks    │  │  Reconcile│  │
│                │  OpenAPI     │  │  NB ops   │  │
│                └──────┬───────┘  └─────┬─────┘  │
│                       └──────┬─────────┘        │
│                         ┌────▼────────┐         │
│                         │ PostgreSQL  │         │
│                         │ (Managed)   │         │
│                         └─────────────┘         │
└──────────────────────────────────────────────────┘
              │                   │
              ▼                   ▼
       Linode API          NodeBalancer API
       (per-group token)   (via group token)
```

## Components

### Frontend (nginx on :80)
- React + Material UI single-page application built with Vite
- Served as static files by nginx with SPA fallback routing
- Communicates with the FastAPI backend at `:8000`
- Public IP discovered at boot via the Linode Metadata Service and baked into the JS bundle as `VITE_API_URL`

### FastAPI Service (`/api`)
- REST API for group management, scaling, status, and admin ops
- Webhook receiver for external scale triggers (Grafana, Prometheus, etc.)
- API key authentication with role-based access control
- Auto-generated OpenAPI docs at `/docs` and `/redoc`
- Prometheus metrics at `/metrics`

### Go Controller (`/controller`)
- Polls `scale_requests` table every 5 seconds for pending requests
- Executes scale-up and scale-down workflows asynchronously
- Runs per-group reconciliation loop (default: every 60s)
- Emits structured events to `scale_events` table
- Sends outbound alert webhooks on failures
- Exposes Prometheus metrics on :9090

### PostgreSQL (Linode Managed PostgreSQL v2 / Docker for local dev)
- Single source of truth for all state
- Groups, instances, NB bindings, scale requests, events, drift records, API keys
- Connected via VPC private networking in production

## Data Flow: Scale-Up
1. External caller → `POST /v1/groups/{id}/scale-up`
2. API validates auth, idempotency, cooldown, concurrent op check
3. `ScaleRequest` inserted with `status=queued`
4. Go controller polls and picks up the request
5. Creates Linode via group's decrypted token
6. Waits for boot, runs TCP/HTTP readiness checks
7. Attaches to all configured NodeBalancer configs
8. Sets instance `status=active`, emits events

## Data Flow: Scale-Down
1. External caller → `POST /v1/groups/{id}/scale-down`
2. Cooldown + min_instances + healthy capacity checks
3. Select newest non-protected active instance
4. Set NodeBalancer node mode to `drain`
5. Wait `drain_wait_seconds`
6. Delete NB node, delete Linode, mark instance deleted
