from fastapi import APIRouter
from fastapi.responses import PlainTextResponse
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST, Counter, Gauge, Histogram
import time

router = APIRouter(tags=["System"])

# Prometheus metrics
groups_total = Gauge("autoscaler_groups_total", "Total number of groups")
instances_total = Gauge("autoscaler_instances_total", "Total number of instances tracked")
instances_active = Gauge("autoscaler_instances_active", "Active instances")
scale_requests_total = Counter("autoscaler_scale_requests_total", "Total scale requests", ["group_id", "type", "status"])
scale_failures_total = Counter("autoscaler_scale_failures_total", "Scale failures", ["group_id"])
drift_records_total = Gauge("autoscaler_drift_records_total", "Open drift records")
linode_api_errors_total = Counter("autoscaler_linode_api_errors_total", "Linode API errors", ["group_id", "operation"])
nodebalancer_update_errors_total = Counter("autoscaler_nodebalancer_update_errors_total", "NB update errors", ["group_id"])
reconciliation_duration = Histogram("autoscaler_reconciliation_duration_seconds", "Reconciliation duration", ["group_id"])

_start_time = time.time()


@router.get("/healthz")
def healthz():
    return {"status": "ok", "uptime_seconds": int(time.time() - _start_time)}


@router.get("/readyz")
def readyz():
    return {"status": "ready"}


@router.get("/metrics", response_class=PlainTextResponse)
def metrics():
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)
