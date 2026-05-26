# Group Configuration Reference

## Creating a Group

```bash
curl -X POST http://localhost:8000/v1/groups \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "group_id": "web-prod",
  "enabled": true,
  "region": "eu-central",
  "type": "g6-nanode-1",
  "image": "linode/ubuntu24.04",
  "min_instances": 2,
  "max_instances": 8,
  "desired_count": 4,
  "max_scale_step": 3,
  "label_prefix": "web-prod-as",
  "linode_token": "",
  "network": {
    "mode": "vpc_ipv4",
    "vpc_id": 111,
    "subnet_id": 222,
    "fallback_private_ipv4": true
  },
  "nodebalancer": {
    "id": 12345,
    "bindings": [
      {
        "config_id": 456,
        "backend_address_template": "{vpc_ipv4}:80",
        "subnet_id": 222,
        "active_mode": "accept",
        "drain_mode": "drain",
        "drain_wait_seconds": 60
      }
    ]
  },
  "boot": {
    "root_password_strategy": "generate_and_encrypt",
    "authorized_keys": ["ssh-rsa AAAA..."],
    "cloud_init_user_data": "#cloud-config\npackage_update: true\n"
  },
  "readiness": {
    "initial_wait_seconds": 90,
    "tcp": {"enabled": true, "port": 80, "timeout_seconds": 5},
    "http": {"enabled": true, "url": "http://{vpc_ipv4}:80/health", "expected_status": 200},
    "retry_count": 3,
    "delay_between_attempts_seconds": 60
  },
  "cooldowns": {
    "scale_up_seconds": 300,
    "scale_down_seconds": 600
  }
}
EOF
```

## Metric-Based Scaling

Configure the autoscaler to poll an external monitoring system and scale automatically based on metric values. Supported source types: `prometheus`, `zabbix`, `nagios`, `elasticsearch`, `datadog`, `custom_http`.

```bash
curl -X PATCH "$AUTOSCALER_URL/v1/groups/web-prod" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "metric_scaling": {
      "enabled": true,
      "source_type": "prometheus",
      "endpoint": "http://prometheus.internal:9090",
      "auth_type": "none",
      "query": "avg(cpu_usage_percent{group=\"web-prod\"})",
      "value_path": "",
      "poll_interval_seconds": 30,
      "rule": {
        "scale_up_threshold": 80,
        "scale_up_amount": 2,
        "scale_down_threshold": 20,
        "scale_down_amount": 1,
        "evaluation_window_seconds": 120
      }
    }
  }'
```

### Metric Scaling Fields

| Field | Description |
|---|---|
| `enabled` | Whether metric-based scaling is active |
| `source_type` | Monitoring system template: `prometheus`, `zabbix`, `nagios`, `elasticsearch`, `datadog`, `custom_http` |
| `endpoint` | Base URL of the monitoring system API |
| `auth_type` | Authentication method: `none`, `bearer`, `basic`, `api_key_header` |
| `auth_header` | Custom header name when using `api_key_header` auth (default: `X-API-Key`) |
| `auth_token_ref` | Token, API key, or `user:pass` credentials for authentication |
| `query` | Source-specific query (PromQL for Prometheus, item ID for Zabbix, JSON body for Elasticsearch, etc.) |
| `value_path` | Dot-separated JSONPath to extract numeric value from response (used for `elasticsearch`, `custom_http`, `nagios`) |
| `poll_interval_seconds` | How often to fetch the metric (minimum: 10s) |
| `rule.scale_up_threshold` | Average metric value above which to scale up |
| `rule.scale_up_amount` | Number of instances to add when scaling up |
| `rule.scale_down_threshold` | Average metric value below which to scale down |
| `rule.scale_down_amount` | Number of instances to remove when scaling down |
| `rule.evaluation_window_seconds` | Time window for averaging samples before evaluating thresholds |

### Source Type Templates

| Source | Query Format | Value Extraction |
|---|---|---|
| `prometheus` | PromQL expression | Automatic (first result value) |
| `zabbix` | Item ID (numeric) | Automatic (`lastvalue`) |
| `nagios` | Service/host identifier | Via `value_path` |
| `elasticsearch` | JSON query body | Via `value_path` (e.g. `aggregations.avg_cpu.value`) |
| `datadog` | Datadog metric query | Automatic (last point in series) |
| `custom_http` | URL query params | Via `value_path` or plain numeric response body |

### How It Works

1. The Go controller runs a metric poller as a separate non-blocking goroutine
2. For each group with metric scaling enabled, it fetches the metric at the configured interval
3. Samples are collected into a sliding time window (`evaluation_window_seconds`)
4. The average of all samples in the window is compared against thresholds
5. If the average exceeds `scale_up_threshold`, a scale-up request is submitted to the queue
6. If the average falls below `scale_down_threshold`, a scale-down request is submitted
7. Scale requests go through the normal queue and respect cooldowns, min/max instances, and concurrent operation limits

---

## Key Fields

| Field | Description |
|---|---|
| `group_id` | Unique identifier. Used in Linode tags: `autoscaler:group:<group_id>` |
| `linode_token` | Linode API token for this group (encrypted on store, never returned) |
| `min_instances` | Minimum instances — scale-down will not go below this |
| `max_instances` | Maximum instances — scale-up will not exceed this |
| `max_scale_step` | Maximum instances to create/destroy in a single scale event |
| `protected_tag` | Linodes with this tag are never deleted (default: `autoscaler:protected`) |
| `label_prefix` | Prefix for generated instance labels |

## Instance Label Format

```
<group_id>-as-<region>-<unix_timestamp>-<short_id>
# Example: web-prod-as-eu-central-1749214021-a8f3
```

## Managed Tags

The autoscaler automatically adds these tags to every instance it creates:
- `autoscaler:managed`
- `autoscaler:group:<group_id>`

Deletion requires both tags plus the instance being in the autoscaler DB.
