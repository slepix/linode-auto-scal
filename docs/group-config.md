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
