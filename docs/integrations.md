# External Integrations

This guide shows how to connect external monitoring, CI/CD, and alerting systems to the Linode Instance Autoscaler.

---

## Table of Contents

- [Grafana (Metric-Based Autoscaling)](#grafana-metric-based-autoscaling)
- [Prometheus (Scraping Metrics)](#prometheus-scraping-metrics)
- [GitHub Actions (Deploy-Time Scaling)](#github-actions-deploy-time-scaling)
- [GitLab CI/CD](#gitlab-cicd)
- [Terraform (Infrastructure as Code)](#terraform-infrastructure-as-code)
- [Slack (Alert Notifications)](#slack-alert-notifications)
- [PagerDuty (Incident Alerting)](#pagerduty-incident-alerting)
- [Custom Webhook Consumers](#custom-webhook-consumers)
- [Cron-Based Scheduled Scaling](#cron-based-scheduled-scaling)
- [HAProxy / Nginx Health Checks](#haproxy--nginx-health-checks)

---

## Grafana (Metric-Based Autoscaling)

Use Grafana alerting to trigger autoscaling based on application metrics (CPU, memory, request rate, queue depth, etc).

### Setup

1. Create a webhook-role API key:

```bash
curl -X POST "$AUTOSCALER_URL/v1/api-keys" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "grafana-webhook", "role": "webhook"}'
```

2. In Grafana, create a Contact Point:
   - **Type**: Webhook
   - **URL**: `https://your-autoscaler.example.com/v1/webhooks/scale`
   - **HTTP Method**: POST
   - **Authorization Header**: `Bearer <webhook-key>`

3. Create alert rules that fire based on your metrics.

### Grafana Alert Rule Template (Custom Webhook)

For more control, use Grafana's webhook template to send structured payloads:

```json
{
  "group_id": "web-prod",
  "action": "scale_up",
  "amount": 2,
  "source": "grafana",
  "reason": "CPU utilization > 80% across fleet for 5 minutes"
}
```

### Full Example: CPU-Based Scaling

**Alert Rule (scale up)**:
- Query: `avg(cpu_usage{group="web-prod"}) > 80`
- Duration: 5 minutes
- Contact Point: autoscaler-webhook

**Alert Rule (scale down)**:
- Query: `avg(cpu_usage{group="web-prod"}) < 30`
- Duration: 10 minutes
- Contact Point: autoscaler-scale-down

For scale-down, configure a separate contact point with:

```json
{
  "group_id": "web-prod",
  "action": "scale_down",
  "amount": 1,
  "source": "grafana",
  "reason": "CPU utilization < 30% for 10 minutes"
}
```

### Request Queue Depth Scaling

```json
{
  "group_id": "worker-pool",
  "action": "scale_up",
  "amount": 3,
  "source": "grafana",
  "reason": "Queue depth > 10000 messages"
}
```

---

## Prometheus (Scraping Metrics)

The autoscaler exposes Prometheus-compatible metrics at `/metrics`.

### prometheus.yml

```yaml
scrape_configs:
  - job_name: "linode-autoscaler"
    scrape_interval: 30s
    static_configs:
      - targets: ["autoscaler.internal:8000"]
    metrics_path: /metrics
```

### Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `autoscaler_groups_total` | Gauge | Total number of groups |
| `autoscaler_instances_total` | Gauge | Total instances across all groups |
| `autoscaler_instances_active` | Gauge | Currently active instances |
| `autoscaler_scale_requests_total` | Counter | Scale requests by group/type/status |
| `autoscaler_scale_failures_total` | Counter | Failed scale operations |
| `autoscaler_drift_records_total` | Gauge | Active drift records |
| `autoscaler_linode_api_errors_total` | Counter | Linode API errors |
| `autoscaler_reconciliation_duration_seconds` | Histogram | Reconciliation loop timing |

### Example PromQL Queries

```promql
# Scale failure rate (last hour)
rate(autoscaler_scale_failures_total[1h])

# Active instances per group
autoscaler_instances_active

# P99 reconciliation duration
histogram_quantile(0.99, rate(autoscaler_reconciliation_duration_seconds_bucket[5m]))

# Scale requests per minute
rate(autoscaler_scale_requests_total[5m]) * 60
```

### Grafana Dashboard

Import these panels for a complete autoscaler dashboard:

- **Instance Counts**: `autoscaler_instances_active` grouped by `group_id`
- **Scale Activity**: `rate(autoscaler_scale_requests_total[5m])` stacked by `type`
- **Failure Rate**: `rate(autoscaler_scale_failures_total[5m])`
- **Reconciliation Health**: `histogram_quantile(0.99, ...)`

---

## GitHub Actions (Deploy-Time Scaling)

Scale up before deployments and scale down after to handle increased load during rolling updates.

### .github/workflows/deploy.yml

```yaml
name: Deploy with Pre-Scaling

on:
  push:
    branches: [main]

env:
  AUTOSCALER_URL: ${{ secrets.AUTOSCALER_URL }}
  AUTOSCALER_KEY: ${{ secrets.AUTOSCALER_KEY }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Scale up before deploy
      - name: Pre-scale for deployment
        run: |
          curl -sf -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale-up" \
            -H "Authorization: Bearer $AUTOSCALER_KEY" \
            -H "Content-Type: application/json" \
            -H "Idempotency-Key: deploy-${{ github.sha }}" \
            -d '{
              "amount": 2,
              "reason": "pre-deploy capacity (commit ${{ github.sha }})"
            }'

      # Wait for instances to become active
      - name: Wait for capacity
        run: |
          for i in $(seq 1 30); do
            STATUS=$(curl -sf "$AUTOSCALER_URL/v1/groups/web-prod/status" \
              -H "Authorization: Bearer $AUTOSCALER_KEY")
            CREATING=$(echo "$STATUS" | jq '.creating_instances')
            if [ "$CREATING" = "0" ]; then
              echo "All instances ready"
              break
            fi
            echo "Waiting for $CREATING instances to become active..."
            sleep 10
          done

      # Your deployment steps here
      - name: Deploy application
        run: |
          echo "Running deployment..."
          # ./deploy.sh

      # Scale back down after deploy
      - name: Post-deploy scale down
        if: success()
        run: |
          curl -sf -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale-down" \
            -H "Authorization: Bearer $AUTOSCALER_KEY" \
            -H "Content-Type: application/json" \
            -d '{
              "amount": 2,
              "reason": "post-deploy scale-down (commit ${{ github.sha }})"
            }'
```

### Canary Deployment Pattern

```yaml
      # Scale up canary group
      - name: Scale canary
        run: |
          curl -sf -X POST "$AUTOSCALER_URL/v1/groups/web-canary/scale" \
            -H "Authorization: Bearer $AUTOSCALER_KEY" \
            -H "Content-Type: application/json" \
            -d '{"desired_count": 2, "reason": "canary deployment"}'

      # Run smoke tests against canary
      - name: Smoke tests
        run: ./run-smoke-tests.sh --target canary

      # If tests pass, scale production
      - name: Scale production
        if: success()
        run: |
          curl -sf -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale" \
            -H "Authorization: Bearer $AUTOSCALER_KEY" \
            -H "Content-Type: application/json" \
            -d '{"desired_count": 6, "reason": "canary passed, scaling prod"}'
```

---

## GitLab CI/CD

### .gitlab-ci.yml

```yaml
variables:
  AUTOSCALER_URL: ${AUTOSCALER_URL}
  AUTOSCALER_KEY: ${AUTOSCALER_KEY}

stages:
  - pre-deploy
  - deploy
  - post-deploy

scale-up:
  stage: pre-deploy
  script:
    - |
      curl -sf -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale-up" \
        -H "Authorization: Bearer $AUTOSCALER_KEY" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: gitlab-$CI_PIPELINE_ID" \
        -d "{\"amount\": 2, \"reason\": \"pre-deploy pipeline $CI_PIPELINE_ID\"}"
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

deploy:
  stage: deploy
  script:
    - ./deploy.sh
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

scale-down:
  stage: post-deploy
  script:
    - |
      curl -sf -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale-down" \
        -H "Authorization: Bearer $AUTOSCALER_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"amount\": 2, \"reason\": \"post-deploy pipeline $CI_PIPELINE_ID\"}"
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  when: on_success
```

---

## Terraform (Infrastructure as Code)

Manage autoscaler groups alongside your infrastructure using Terraform's HTTP provider.

### terraform/autoscaler.tf

```hcl
variable "autoscaler_url" {
  type = string
}

variable "autoscaler_key" {
  type      = string
  sensitive = true
}

resource "terraform_data" "autoscaler_group" {
  input = {
    group_id      = "web-prod"
    desired_count = var.desired_instance_count
    min_instances = var.min_instances
    max_instances = var.max_instances
  }

  provisioner "local-exec" {
    command = <<-EOT
      curl -sf -X PATCH "${var.autoscaler_url}/v1/groups/web-prod" \
        -H "Authorization: Bearer ${var.autoscaler_key}" \
        -H "Content-Type: application/json" \
        -d '{
          "desired_count": ${var.desired_instance_count},
          "min_instances": ${var.min_instances},
          "max_instances": ${var.max_instances}
        }'
    EOT
  }
}
```

### Creating Groups via Terraform

```hcl
resource "terraform_data" "autoscaler_group_create" {
  input = var.group_config

  provisioner "local-exec" {
    command = <<-EOT
      curl -sf -X POST "${var.autoscaler_url}/v1/groups" \
        -H "Authorization: Bearer ${var.autoscaler_key}" \
        -H "Content-Type: application/json" \
        -d '${jsonencode(var.group_config)}'
    EOT
  }

  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      curl -sf -X DELETE "${var.autoscaler_url}/v1/groups/${self.input.group_id}?force=true" \
        -H "Authorization: Bearer ${var.autoscaler_key}"
    EOT
  }
}
```

---

## Slack (Alert Notifications)

### Direct Slack Webhook

Configure the autoscaler group to send alerts to Slack:

```bash
curl -X PATCH "$AUTOSCALER_URL/v1/groups/web-prod" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "alerting": {
      "enabled": true,
      "webhook_url": "",
      "send_on": [
        "scale_failed",
        "readiness_failed",
        "drift_detected",
        "reconcile_failed"
      ]
    }
  }'
```

### Alert Payload Format

The autoscaler sends this JSON to your webhook:

```json
{
  "event_type": "scale_failed",
  "severity": "critical",
  "group_id": "web-prod",
  "event_id": "evt-1749214021",
  "message": "Scale-up failed: Linode API returned 429",
  "timestamp": "2025-06-06T14:30:21Z"
}
```

### Slack Middleware (Format as Slack Blocks)

If you want rich Slack formatting, deploy a small middleware that transforms the autoscaler payload into Slack Block Kit format:

```python
# slack_formatter.py - Deploy as a small service or serverless function
from flask import Flask, request
import requests

app = Flask(__name__)
SLACK_WEBHOOK = ""

SEVERITY_EMOJI = {
    "critical": ":rotating_light:",
    "error": ":x:",
    "warning": ":warning:",
    "info": ":information_source:",
}

@app.route("/webhook", methods=["POST"])
def handle():
    data = request.json
    emoji = SEVERITY_EMOJI.get(data["severity"], ":grey_question:")
    
    slack_payload = {
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} Autoscaler Alert: {data['event_type']}"
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Group:*\n`{data['group_id']}`"},
                    {"type": "mrkdwn", "text": f"*Severity:*\n{data['severity']}"},
                    {"type": "mrkdwn", "text": f"*Message:*\n{data['message']}"},
                    {"type": "mrkdwn", "text": f"*Time:*\n{data['timestamp']}"},
                ]
            }
        ]
    }
    
    requests.post(SLACK_WEBHOOK, json=slack_payload)
    return "", 200
```

Then point the autoscaler alerting config at your middleware URL.

---

## PagerDuty (Incident Alerting)

### Using PagerDuty Events API v2

Configure alerts to go through a PagerDuty integration:

```bash
curl -X PATCH "$AUTOSCALER_URL/v1/groups/web-prod" \
  -H "Authorization: Bearer $AUTOSCALER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "alerting": {
      "enabled": true,
      "webhook_url": "https://events.pagerduty.com/v2/enqueue",
      "headers": {
        "Content-Type": "application/json"
      },
      "send_on": ["scale_failed", "reconcile_failed"]
    }
  }'
```

### PagerDuty Adapter

Since PagerDuty expects a specific payload format, use a thin adapter:

```python
# pagerduty_adapter.py
from flask import Flask, request
import requests

app = Flask(__name__)
PD_ROUTING_KEY = ""

SEVERITY_MAP = {
    "critical": "critical",
    "error": "error",
    "warning": "warning",
    "info": "info",
}

@app.route("/webhook", methods=["POST"])
def handle():
    data = request.json
    
    pd_payload = {
        "routing_key": PD_ROUTING_KEY,
        "event_action": "trigger",
        "payload": {
            "summary": f"[{data['group_id']}] {data['event_type']}: {data['message']}",
            "severity": SEVERITY_MAP.get(data["severity"], "warning"),
            "source": f"autoscaler-{data['group_id']}",
            "component": "linode-autoscaler",
            "group": data["group_id"],
            "custom_details": data,
        },
        "dedup_key": f"autoscaler-{data['group_id']}-{data['event_type']}",
    }
    
    requests.post("https://events.pagerduty.com/v2/enqueue", json=pd_payload)
    return "", 200
```

---

## Custom Webhook Consumers

### Generic Webhook Receiver Pattern

Build any custom integration by consuming autoscaler alerts:

```python
from flask import Flask, request
import logging

app = Flask(__name__)
log = logging.getLogger(__name__)

@app.route("/autoscaler-events", methods=["POST"])
def handle_event():
    event = request.json
    
    event_type = event["event_type"]
    group_id = event["group_id"]
    severity = event["severity"]
    message = event["message"]
    
    # Route based on event type
    if event_type == "scale_failed" and severity == "critical":
        # Page on-call engineer
        page_oncall(group_id, message)
    
    elif event_type == "drift_detected":
        # Log for audit trail
        log.warning(f"Drift in {group_id}: {message}")
        record_drift_metric(group_id)
    
    elif event_type == "auto_replace_triggered":
        # Notify team
        send_team_notification(group_id, message)
    
    return "", 200
```

### Outbound Alert Event Types

| Event Type | Severity | Trigger |
|---|---|---|
| `scale_failed` | critical | Scale-up or scale-down failed |
| `readiness_failed` | error | New instance failed health checks |
| `drift_detected` | warning | Unmanaged or missing Linodes |
| `reconcile_failed` | error | Reconciliation loop encountered error |
| `nodebalancer_update_failed` | error | Could not update NodeBalancer |
| `linode_api_rate_limited` | warning | Hit Linode API rate limit |
| `auto_replace_triggered` | info | Auto-replacement queued |
| `auto_scale_down_triggered` | info | Auto-scale-down queued |
| `instance_created` | info | New instance provisioned |
| `instance_deleted` | info | Instance removed |
| `instance_active` | info | Instance passed readiness |

---

## Cron-Based Scheduled Scaling

Scale on a time-based schedule for predictable traffic patterns.

### Systemd Timer

```ini
# /etc/systemd/system/autoscaler-morning.service
[Unit]
Description=Scale up for business hours

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -sf -X POST https://autoscaler.example.com/v1/groups/web-prod/scale \
  -H "Authorization: Bearer %AUTOSCALER_KEY%" \
  -H "Content-Type: application/json" \
  -d '{"desired_count": 8, "reason": "scheduled: business hours start"}'
```

```ini
# /etc/systemd/system/autoscaler-morning.timer
[Unit]
Description=Scale up at 8am weekdays

[Timer]
OnCalendar=Mon..Fri 08:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

### Crontab

```cron
# Scale up weekdays at 8am
0 8 * * 1-5 curl -sf -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"desired_count": 8, "reason": "scheduled: peak hours"}'

# Scale down weekdays at 8pm
0 20 * * 1-5 curl -sf -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"desired_count": 3, "reason": "scheduled: off-peak"}'

# Weekend minimum
0 0 * * 6 curl -sf -X POST "$AUTOSCALER_URL/v1/groups/web-prod/scale" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"desired_count": 2, "reason": "scheduled: weekend"}'
```

### Python Scheduler (APScheduler)

```python
from apscheduler.schedulers.blocking import BlockingScheduler
import requests

AUTOSCALER_URL = "https://autoscaler.example.com"
API_KEY = ""
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

def set_desired(group_id: str, count: int, reason: str):
    requests.post(
        f"{AUTOSCALER_URL}/v1/groups/{group_id}/scale",
        headers=HEADERS,
        json={"desired_count": count, "reason": reason},
    )

scheduler = BlockingScheduler()

# Business hours: scale up
scheduler.add_job(
    set_desired, "cron",
    args=["web-prod", 8, "scheduled: business hours"],
    day_of_week="mon-fri", hour=8, minute=0,
)

# Evening: scale down
scheduler.add_job(
    set_desired, "cron",
    args=["web-prod", 3, "scheduled: off-peak"],
    day_of_week="mon-fri", hour=20, minute=0,
)

# Weekend minimum
scheduler.add_job(
    set_desired, "cron",
    args=["web-prod", 2, "scheduled: weekend"],
    day_of_week="sat", hour=0, minute=0,
)

scheduler.start()
```

---

## HAProxy / Nginx Health Checks

Use the autoscaler's health endpoints for load balancer health checks.

### HAProxy Backend

```haproxy
backend autoscaler_api
    option httpchk GET /healthz
    http-check expect status 200
    server autoscaler1 10.0.1.10:8000 check inter 5s fall 3 rise 2
```

### Nginx Upstream

```nginx
upstream autoscaler {
    server 10.0.1.10:8000;
    # Health check (requires nginx plus or third-party module)
}

server {
    location /autoscaler/ {
        proxy_pass http://autoscaler/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Kubernetes Liveness/Readiness

If running the autoscaler in Kubernetes:

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /readyz
    port: 8000
  initialDelaySeconds: 3
  periodSeconds: 5
```

---

## Complete Example: Multi-Signal Scaling

Combine multiple signals for production-grade autoscaling:

```
                    +-------------------+
                    |   Grafana Alert   |
                    | (CPU > 80% 5min) |
                    +--------+----------+
                             |
                             v
+------------------+    +----+----+    +------------------+
| GitHub Actions   +--->+         +<---+ Cron Scheduler   |
| (deploy scale)   |    |  Auto-  |    | (time-of-day)    |
+------------------+    | scaler  |    +------------------+
                        |   API   |
+------------------+    |         |    +------------------+
| Custom App       +--->+         +--->+ Slack            |
| (queue depth)    |    +---------+    | (alerts)         |
+------------------+         |         +------------------+
                             |
                             v
                    +--------+----------+
                    |   Linode Cloud    |
                    | (instances, NB)   |
                    +-------------------+
```

1. **Grafana** monitors application metrics and triggers scale-up/down webhooks
2. **GitHub Actions** pre-scales before deployments
3. **Cron** handles predictable time-of-day patterns
4. **Custom app logic** can scale based on business metrics (queue depth, active users)
5. **Slack/PagerDuty** receive notifications about failures and drift
6. **Prometheus** scrapes autoscaler metrics for dashboards

Each system uses its own API key with appropriate role (webhook, operator, or readonly) for least-privilege access.
