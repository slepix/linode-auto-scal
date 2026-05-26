# API Usage Examples

This document provides detailed, copy-paste-ready examples for interacting with the Linode Instance Autoscaler API.

## Prerequisites

Set these environment variables before running the examples:

```bash
export AUTOSCALER_URL="https://your-autoscaler.example.com"
export AUTOSCALER_KEY=""
```

---

## Authentication

All requests require a Bearer token:

```bash
curl -H "Authorization: Bearer $AUTOSCALER_KEY" \
  "$AUTOSCALER_URL/v1/groups"
```

### Creating an API Key

```bash
curl -X POST "$AUTOSCALER_URL/v1/api-keys" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ci-deploy-key",
    "role": "operator"
  }'
```

Response:

```json
{
  "id": "key-1749214021",
  "name": "ci-deploy-key",
  "role": "operator",
  "enabled": true,
  "created_at": "2025-06-06T10:00:21Z",
  "key": ""
}
```

> The `key` field is only returned once at creation time. Store it securely.

### Available Roles

| Role       | Use case                                    |
|------------|---------------------------------------------|
| `admin`    | Full access, managing groups and keys       |
| `operator` | Scale operations and status monitoring      |
| `webhook`  | External systems triggering scale requests  |
| `readonly` | Dashboards and monitoring only              |

---

## Group Management

### Create a Group

```bash
curl -X POST "$AUTOSCALER_URL/v1/groups" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": "web-prod",
    "enabled": true,
    "region": "eu-central",
    "type": "g6-standard-2",
    "image": "linode/ubuntu24.04",
    "min_instances": 2,
    "max_instances": 10,
    "desired_count": 3,
    "max_scale_step": 3,
    "label_prefix": "web-prod",
    "tags": ["env:production", "team:platform"],
    "linode_token": "",
    "network": {
      "mode": "vpc_ipv4",
      "vpc_id": 12345,
      "subnet_id": 67890,
      "firewall_id": 11111
    },
    "nodebalancer": {
      "id": 55555,
      "bindings": [{
        "config_id": 44444,
        "backend_address_template": "{vpc_ipv4}:8080",
        "subnet_id": 67890,
        "active_mode": "accept",
        "drain_mode": "drain",
        "drain_wait_seconds": 30,
        "drain_parallelism": 3
      }]
    },
    "boot": {
      "root_password_strategy": "generate_and_encrypt",
      "authorized_keys": [
        ""
      ],
      "cloud_init_user_data": "#!/bin/bash\napt-get update && apt-get install -y nginx"
    },
    "readiness": {
      "initial_wait_seconds": 60,
      "tcp": {
        "enabled": true,
        "port": 8080,
        "timeout_seconds": 5
      },
      "http": {
        "enabled": true,
        "url": "http://{vpc_ipv4}:8080/health",
        "expected_status": 200,
        "timeout_seconds": 10
      },
      "overall_timeout_seconds": 300,
      "retry_count": 5,
      "delay_between_attempts_seconds": 30
    },
    "cooldowns": {
      "scale_up_seconds": 120,
      "scale_down_seconds": 300
    },
    "reconciliation": {
      "enabled": true,
      "interval_seconds": 60,
      "auto_replace": true
    },
    "alerting": {
      "enabled": true,
      "webhook_url": "",
      "headers": {"X-Custom": "value"},
      "send_on": ["scale_failed", "readiness_failed", "drift_detected"]
    }
  }'
```

### Update a Group

Partial updates are supported -- only include the fields you want to change:

```bash
curl -X PATCH "$AUTOSCALER_URL/v1/groups/web-prod" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "desired_count": 5,
    "max_instances": 12
  }'
```

### Update Drain Settings

```bash
curl -X PATCH "$AUTOSCALER_URL/v1/groups/web-prod" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "nodebalancer": {
      "id": 55555,
      "bindings": [{
        "config_id": 44444,
        "backend_address_template": "{vpc_ipv4}:8080",
        "subnet_id": 67890,
        "active_mode": "accept",
        "drain_mode": "drain",
        "drain_wait_seconds": 15,
        "drain_parallelism": 5
      }]
    }
  }'
```

### Disable a Group (Pause Autoscaling)

```bash
curl -X PATCH "$AUTOSCALER_URL/v1/groups/web-prod" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

### List All Groups

```bash
curl "$AUTOSCALER_URL/v1/groups" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

### Delete a Group

```bash
# Safe delete (fails if instances still exist)
curl -X DELETE "$AUTOSCALER_URL/v1/groups/web-prod" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"

# Force delete (removes group record even with active instances)
curl -X DELETE "$AUTOSCALER_URL/v1/groups/web-prod?force=true" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

---

## Scaling Operations

### Scale Up by Amount

```bash
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale-up" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 2,
    "reason": "traffic spike from marketing campaign"
  }'
```

### Scale Down by Amount

Scale down requires specifying which instances to remove via `target_instance_ids`. The number of IDs must match `amount`:

```bash
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale-down" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 2,
    "target_instance_ids": ["inst-abc123", "inst-def456"],
    "reason": "traffic returned to baseline"
  }'
```

If `target_instance_ids` is omitted, the controller falls back to the default strategy (newest-first: the most recently created non-protected instances are removed first).

```bash
# Fallback: remove 1 instance using newest-first strategy
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale-down" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1,
    "reason": "traffic returned to baseline"
  }'
```

### Set Exact Desired Count

```bash
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "desired_count": 6,
    "reason": "scheduled capacity increase for peak hours"
  }'
```

### Dry Run (Preview Without Executing)

```bash
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale?dry_run=true" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "desired_count": 8,
    "reason": "testing"
  }'
```

### Idempotent Requests

Use the `Idempotency-Key` header for safe retries:

```bash
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale-up" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: deploy-2025-06-06-v3" \
  -d '{
    "amount": 2,
    "reason": "pre-deploy capacity increase"
  }'
```

Repeating this request with the same key and body returns the original response instead of creating a duplicate.

---

## Monitoring & Status

### Group Status

```bash
curl "$AUTOSCALER_URL/v1/groups/web-prod/status" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

Response:

```json
{
  "group_id": "web-prod",
  "enabled": true,
  "desired_count": 5,
  "min_instances": 2,
  "max_instances": 10,
  "total_instances": 5,
  "active_instances": 5,
  "creating_instances": 0,
  "draining_instances": 0,
  "failed_instances": 0,
  "active_scale_request": null
}
```

### Capacity

```bash
curl "$AUTOSCALER_URL/v1/groups/web-prod/capacity" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

Response:

```json
{
  "group_id": "web-prod",
  "min_instances": 2,
  "max_instances": 10,
  "desired_count": 5,
  "active_instances": 5,
  "available_scale_up": 5,
  "available_scale_down": 3
}
```

### Cooldown Status

```bash
curl "$AUTOSCALER_URL/v1/groups/web-prod/cooldown" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

Response:

```json
{
  "group_id": "web-prod",
  "scale_up_cooldown_seconds": 120,
  "scale_down_cooldown_seconds": 300,
  "scale_up_remaining_seconds": 0,
  "scale_down_remaining_seconds": 87,
  "scale_up_in_cooldown": false,
  "scale_down_in_cooldown": true
}
```

### List Instances

```bash
# Active instances only
curl "$AUTOSCALER_URL/v1/groups/web-prod/instances" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"

# Include deleted
curl "$AUTOSCALER_URL/v1/groups/web-prod/instances?include_deleted=true" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

### Scale Events (Audit Log)

```bash
curl "$AUTOSCALER_URL/v1/groups/web-prod/events?limit=20&offset=0" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

### Drift Records

```bash
curl "$AUTOSCALER_URL/v1/groups/web-prod/drift" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

### NodeBalancer Bindings

```bash
curl "$AUTOSCALER_URL/v1/groups/web-prod/nodebalancer" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

---

## Admin Operations

### Force Reconciliation

Trigger an immediate reconciliation cycle (doesn't wait for the next interval):

```bash
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/force-reconcile" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

### Force Delete an Instance

Bypasses drain and cooldown -- triggers immediate deletion of the Linode:

```bash
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/instances/inst-1749214021/force-delete" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

### Purge an Instance from Tracking

Removes an instance record from the database without touching the Linode VM. Use this for instances stuck in `draining` or `deleting` state where you intend to handle the VM manually:

```bash
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/instances/inst-1749214021/purge" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

> **Warning:** The Linode will continue running. You are responsible for manually deleting it.

### Clear Cooldown

Remove active cooldown timers to allow immediate scaling:

```bash
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/clear-cooldown" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

### Import an Existing Linode

Bring an already-running Linode under autoscaler management:

```bash
curl -X POST "$AUTOSCALER_URL/v1/groups/web-prod/instances/97994040/import" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

### Retrieve Root Password

For instances where the password was generated and encrypted:

```bash
curl "$AUTOSCALER_URL/v1/groups/web-prod/instances/inst-1749214021/root-password" \
  -H "Authorization: Bearer $AUTOSCALER_KEY"
```

---

## Health & Metrics

These endpoints require no authentication:

```bash
# Health check
curl "$AUTOSCALER_URL/healthz"

# Readiness probe
curl "$AUTOSCALER_URL/readyz"

# Prometheus metrics
curl "$AUTOSCALER_URL/metrics"
```

---

## Webhook Endpoint (Inbound)

External systems can trigger scaling via the webhook endpoint using a `webhook`-role key:

```bash
curl -X POST "$AUTOSCALER_URL/v1/webhooks/scale" \
  -H "Authorization: Bearer $WEBHOOK_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: grafana-alert-12345" \
  -d '{
    "group_id": "web-prod",
    "action": "scale_up",
    "amount": 2,
    "source": "grafana",
    "reason": "CPU > 80% for 5 minutes"
  }'
```

---

## Error Handling

All errors return a JSON body with a `detail` field:

```json
{
  "detail": "Group 'web-prod' not found"
}
```

Common status codes:

| Code | Meaning                              |
|------|--------------------------------------|
| 400  | Invalid request body or parameters   |
| 401  | Missing or invalid API key           |
| 403  | API key lacks required permission    |
| 404  | Resource not found                   |
| 409  | Idempotency key conflict             |
| 429  | Rate limited                         |
| 500  | Internal server error                |

---

## Python Client Example

```python
import requests

class AutoscalerClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        })

    def get_status(self, group_id: str) -> dict:
        r = self.session.get(f"{self.base_url}/v1/groups/{group_id}/status")
        r.raise_for_status()
        return r.json()

    def scale_up(self, group_id: str, amount: int = 1, reason: str = "") -> dict:
        r = self.session.post(
            f"{self.base_url}/v1/groups/{group_id}/scale-up",
            json={"amount": amount, "reason": reason},
        )
        r.raise_for_status()
        return r.json()

    def scale_down(self, group_id: str, amount: int = 1, reason: str = "",
                   target_instance_ids: list[str] | None = None) -> dict:
        payload = {"amount": amount, "reason": reason}
        if target_instance_ids:
            payload["target_instance_ids"] = target_instance_ids
        r = self.session.post(
            f"{self.base_url}/v1/groups/{group_id}/scale-down",
            json=payload,
        )
        r.raise_for_status()
        return r.json()

    def set_desired(self, group_id: str, count: int, reason: str = "") -> dict:
        r = self.session.post(
            f"{self.base_url}/v1/groups/{group_id}/scale",
            json={"desired_count": count, "reason": reason},
        )
        r.raise_for_status()
        return r.json()

    def get_instances(self, group_id: str) -> list:
        r = self.session.get(f"{self.base_url}/v1/groups/{group_id}/instances")
        r.raise_for_status()
        return r.json()

    def get_cooldown(self, group_id: str) -> dict:
        r = self.session.get(f"{self.base_url}/v1/groups/{group_id}/cooldown")
        r.raise_for_status()
        return r.json()


# Usage
client = AutoscalerClient("https://autoscaler.example.com", "")

status = client.get_status("web-prod")
print(f"Active: {status['active_instances']}/{status['desired_count']}")

if status["active_instances"] < status["desired_count"]:
    client.scale_up("web-prod", amount=1, reason="below desired count")
```

---

## Node.js / TypeScript Client Example

```typescript
interface ScaleResponse {
  id: string;
  group_id: string;
  status: string;
  request_type: string;
}

class AutoscalerClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`${res.status}: ${err.detail}`);
    }
    return res.json();
  }

  getStatus(groupId: string) {
    return this.request<Record<string, unknown>>("GET", `/v1/groups/${groupId}/status`);
  }

  scaleUp(groupId: string, amount = 1, reason = "") {
    return this.request<ScaleResponse>("POST", `/v1/groups/${groupId}/scale-up`, {
      amount,
      reason,
    });
  }

  scaleDown(groupId: string, amount = 1, reason = "") {
    return this.request<ScaleResponse>("POST", `/v1/groups/${groupId}/scale-down`, {
      amount,
      reason,
    });
  }

  setDesired(groupId: string, count: number, reason = "") {
    return this.request<ScaleResponse>("POST", `/v1/groups/${groupId}/scale`, {
      desired_count: count,
      reason,
    });
  }
}

// Usage
const client = new AutoscalerClient("https://autoscaler.example.com", "");

const status = await client.getStatus("web-prod");
console.log(`Active: ${status.active_instances}/${status.desired_count}`);
```
