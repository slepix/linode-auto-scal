from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST, Gauge
from sqlalchemy.orm import Session
from sqlalchemy import text
import time

from ..db.base import get_db

router = APIRouter(tags=["System"])

# Prometheus metrics (gauges refreshed from DB on each scrape)
groups_total = Gauge("autoscaler_groups_total", "Total number of groups")
instances_total = Gauge("autoscaler_instances_total", "Total number of instances tracked")
instances_active = Gauge("autoscaler_instances_active", "Active instances")
scale_requests_succeeded = Gauge("autoscaler_scale_requests_succeeded_total", "Succeeded scale requests")
scale_requests_failed = Gauge("autoscaler_scale_requests_failed_total", "Failed scale requests")
drift_records_total = Gauge("autoscaler_drift_records_total", "Open drift records")

# New high-value metrics
scale_request_queue_depth = Gauge(
    "autoscaler_scale_request_queue_depth", "Pending scale requests in queue"
)
scale_blocked_cooldown = Gauge(
    "autoscaler_scale_blocked_by_cooldown_total", "Scale requests blocked by cooldown"
)
scale_blocked_max = Gauge(
    "autoscaler_scale_blocked_by_max_instances_total", "Scale requests blocked by max instances"
)
scale_blocked_min = Gauge(
    "autoscaler_scale_blocked_by_min_instances_total", "Scale requests blocked by min instances"
)
instance_creation_avg_seconds = Gauge(
    "autoscaler_instance_creation_avg_seconds",
    "Average instance creation duration (created_at to active) over last 24h",
)
metric_fetch_errors = Gauge(
    "autoscaler_metric_fetch_errors_total", "Metric fetch failures (last 24h)"
)
readiness_check_failures = Gauge(
    "autoscaler_readiness_check_failures_total", "Readiness check failures (last 24h)"
)

_start_time = time.time()


def _refresh_gauges(db: Session) -> None:
    groups_total.set(
        db.execute(text("SELECT COUNT(*) FROM groups WHERE deleted_at IS NULL")).scalar() or 0
    )
    instances_total.set(
        db.execute(text("SELECT COUNT(*) FROM instances WHERE deleted_at IS NULL")).scalar() or 0
    )
    instances_active.set(
        db.execute(text("SELECT COUNT(*) FROM instances WHERE status = 'active' AND deleted_at IS NULL")).scalar() or 0
    )
    drift_records_total.set(
        db.execute(text("SELECT COUNT(*) FROM drift_records WHERE status = 'open'")).scalar() or 0
    )
    scale_requests_succeeded.set(
        db.execute(text("SELECT COUNT(*) FROM scale_requests WHERE status = 'succeeded'")).scalar() or 0
    )
    scale_requests_failed.set(
        db.execute(text("SELECT COUNT(*) FROM scale_requests WHERE status = 'failed'")).scalar() or 0
    )

    # Queue depth: pending/queued requests
    scale_request_queue_depth.set(
        db.execute(text(
            "SELECT COUNT(*) FROM scale_requests WHERE status IN ('queued', 'pending')"
        )).scalar() or 0
    )

    # Blocked reasons
    scale_blocked_cooldown.set(
        db.execute(text(
            "SELECT COUNT(*) FROM scale_requests WHERE status = 'blocked_by_cooldown'"
        )).scalar() or 0
    )
    scale_blocked_max.set(
        db.execute(text(
            "SELECT COUNT(*) FROM scale_requests WHERE status = 'blocked_by_max_instances'"
        )).scalar() or 0
    )
    scale_blocked_min.set(
        db.execute(text(
            "SELECT COUNT(*) FROM scale_requests WHERE status = 'blocked_by_min_instances'"
        )).scalar() or 0
    )

    # Average instance creation duration (last 24h, instances that reached active)
    avg_duration = db.execute(text(
        "SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) "
        "FROM instances WHERE status = 'active' AND deleted_at IS NULL "
        "AND created_at > NOW() - INTERVAL '24 hours'"
    )).scalar()
    instance_creation_avg_seconds.set(avg_duration or 0)

    # Metric fetch errors (last 24h from scale_events)
    metric_fetch_errors.set(
        db.execute(text(
            "SELECT COUNT(*) FROM scale_events "
            "WHERE event_type = 'metric_fetch_failed' "
            "AND created_at > NOW() - INTERVAL '24 hours'"
        )).scalar() or 0
    )

    # Readiness check failures (last 24h from scale_events)
    readiness_check_failures.set(
        db.execute(text(
            "SELECT COUNT(*) FROM scale_events "
            "WHERE event_type = 'readiness_failed' "
            "AND created_at > NOW() - INTERVAL '24 hours'"
        )).scalar() or 0
    )


@router.get("/healthz")
def healthz():
    return {"status": "ok", "uptime_seconds": int(time.time() - _start_time)}


@router.get("/readyz")
def readyz():
    return {"status": "ready"}


@router.get("/metrics", response_class=PlainTextResponse)
def metrics(db: Session = Depends(get_db)):
    _refresh_gauges(db)
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)
