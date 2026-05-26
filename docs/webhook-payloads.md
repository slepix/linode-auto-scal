# Webhook Payloads

## Inbound Scale Webhooks

### Set Exact Desired Count

```json
POST /v1/webhooks/scale
Authorization: Bearer <webhook_key>

{
  "group_id": "web-prod",
  "desired_count": 5,
  "reason": "deployment load test"
}
```

### Relative Scale

```json
POST /v1/webhooks/scale
Authorization: Bearer <webhook_key>

{
  "group_id": "web-prod",
  "action": "scale_up",
  "amount": 2,
  "source": "grafana",
  "reason": "high latency p99 > 500ms"
}
```

### Targeted Scale-Down

Remove specific Linode instances by ID:

```json
POST /v1/webhooks/scale
Authorization: Bearer <webhook_key>

{
  "group_id": "web-prod",
  "action": "scale_down",
  "amount": 2,
  "instance_ids": [97994040, 97994055],
  "source": "orchestrator",
  "reason": "decommissioning specific nodes"
}
```

When `instance_ids` is provided, the controller targets those Linodes for deletion instead of using the default newest-first selection strategy.

Supported `action` values: `scale_up`, `scale_down`, `set_desired_count`

## Outbound Alert Webhooks

When a group's `alerting.enabled = true`, the autoscaler POSTs to `alerting.webhook_url`:

```json
{
  "event_type": "scale_failed",
  "severity": "critical",
  "group_id": "web-prod",
  "event_id": "evt_123",
  "message": "Scale-up failed after 3 readiness attempts.",
  "timestamp": "2026-05-21T12:00:00Z"
}
```

### Alert Event Types

| Event | Severity | When |
|---|---|---|
| `scale_failed` | critical | Scale-up or down failed |
| `readiness_failed` | error | Instance failed readiness checks |
| `drift_detected` | warning | Unmanaged or missing Linodes found |
| `reconcile_failed` | error | Reconciliation loop failed |
| `nodebalancer_update_failed` | error | Could not update NB node |
| `linode_api_rate_limited` | warning | Hit Linode API 429 |
| `metric_fetch_failed` | warning | Failed to fetch metric from external monitoring system |
| `metric_scale_triggered` | info | Metric threshold breached, scale request submitted |

### Alerting Config

```json
{
  "alerting": {
    "enabled": true,
    "webhook_url": "https://example.com/oncall/autoscaler",
    "headers": {
      "X-Autoscaler-Alert": "shared-static-value"
    },
    "bearer_token_ref": "encrypted-bearer-token",
    "send_on": ["scale_failed", "readiness_failed", "drift_detected"]
  }
}
```

## Grafana Webhook Integration

In Grafana → Alerting → Contact points:
- Type: Webhook
- URL: `http://your-autoscaler:8000/v1/webhooks/scale`
- Custom headers: `Authorization: Bearer <webhook_key>`
- Message body (template):
  ```json
  {"group_id": "web-prod", "action": "scale_up", "amount": 2, "source": "grafana", "reason": "{{ $values.A }}"}
  ```
