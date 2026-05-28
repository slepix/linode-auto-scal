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
