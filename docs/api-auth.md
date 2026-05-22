# API Authentication

## Bearer Token Auth

All API endpoints require:

```
Authorization: Bearer <autoscaler_api_key>
```

API keys are stored as SHA-256 hashes. The plaintext key is only returned once at creation time.

## Roles

| Role | Permissions |
|---|---|
| `admin` | Full access: group management, force ops, root password, API key management |
| `operator` | Scale groups, read status and events |
| `webhook` | Trigger scale requests only |
| `readonly` | Read status and dashboard endpoints only |

## Creating API Keys

```bash
# Create an operator key
curl -X POST http://localhost:8000/v1/api-keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "grafana-webhook", "role": "webhook"}'

# Response includes the raw key (only shown once):
# {"id": "...", "name": "grafana-webhook", "role": "webhook", "key": "sk-..."}
```

## Webhook Auth

Webhooks use the same Bearer token mechanism. Create a `webhook`-role key and use it in your Grafana/Prometheus alerting.

## Idempotency

Add `Idempotency-Key: <unique-string>` header to scale requests:
- Same key + same body → returns previous result (safe retry)
- Same key + different body → 409 Conflict
- Missing key → allowed but not retry-safe
