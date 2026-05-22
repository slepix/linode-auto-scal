import json
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from ..db.base import get_db
from ..middleware.auth import require_permission
from ..models.instance import Instance
from ..models.scale_event import ScaleEvent
from ..models.scale_request import ScaleRequest
from ..models.nodebalancer_binding import NodebalancerBinding
from ..models.drift_record import DriftRecord
from ..models.group import Group
from ..services.scale_service import get_group_status
from ..schemas.instance import InstanceResponse

router = APIRouter(prefix="/v1/groups", tags=["Status"])


@router.get("/{group_id}/status")
def group_status(
    group_id: str,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("status:read")),
):
    return get_group_status(db, group_id)


@router.get("/{group_id}/capacity")
def group_capacity(
    group_id: str,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("status:read")),
):
    group = db.query(Group).filter(Group.group_id == group_id, Group.deleted_at == None).first()
    if not group:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Group not found")
    active = db.query(Instance).filter(
        Instance.group_id == group_id,
        Instance.status == "active",
        Instance.deleted_at == None,
    ).count()
    return {
        "group_id": group_id,
        "min_instances": group.min_instances,
        "max_instances": group.max_instances,
        "desired_count": group.desired_count,
        "active_instances": active,
        "available_scale_up": group.max_instances - active,
        "available_scale_down": max(0, active - group.min_instances),
    }


@router.get("/{group_id}/cooldown")
def group_cooldown(
    group_id: str,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("status:read")),
):
    group = db.query(Group).filter(Group.group_id == group_id, Group.deleted_at == None).first()
    if not group:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Group not found")

    cooldown_cfg = {}
    if group.cooldown_config_json:
        cooldown_cfg = json.loads(group.cooldown_config_json)

    last_scale_up = db.query(ScaleEvent).filter(
        ScaleEvent.group_id == group_id,
        ScaleEvent.event_type == "scale_up_completed",
    ).order_by(desc(ScaleEvent.created_at)).first()

    last_scale_down = db.query(ScaleEvent).filter(
        ScaleEvent.group_id == group_id,
        ScaleEvent.event_type == "scale_down_completed",
    ).order_by(desc(ScaleEvent.created_at)).first()

    now = datetime.now(timezone.utc)
    up_seconds = cooldown_cfg.get("scale_up_seconds", 300)
    down_seconds = cooldown_cfg.get("scale_down_seconds", 600)

    up_remaining = 0
    down_remaining = 0

    if last_scale_up and last_scale_up.created_at:
        elapsed = (now - last_scale_up.created_at.replace(tzinfo=timezone.utc)).total_seconds()
        up_remaining = max(0, up_seconds - elapsed)

    if last_scale_down and last_scale_down.created_at:
        elapsed = (now - last_scale_down.created_at.replace(tzinfo=timezone.utc)).total_seconds()
        down_remaining = max(0, down_seconds - elapsed)

    return {
        "group_id": group_id,
        "scale_up_cooldown_seconds": up_seconds,
        "scale_down_cooldown_seconds": down_seconds,
        "scale_up_remaining_seconds": int(up_remaining),
        "scale_down_remaining_seconds": int(down_remaining),
        "scale_up_in_cooldown": up_remaining > 0,
        "scale_down_in_cooldown": down_remaining > 0,
    }


@router.get("/{group_id}/events")
def group_events(
    group_id: str,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("events:read")),
):
    events = db.query(ScaleEvent).filter(
        ScaleEvent.group_id == group_id,
    ).order_by(desc(ScaleEvent.created_at)).offset(offset).limit(limit).all()
    return [
        {
            "id": e.id,
            "group_id": e.group_id,
            "instance_id": e.instance_id,
            "event_type": e.event_type,
            "severity": e.severity,
            "message": e.message,
            "created_at": e.created_at,
        }
        for e in events
    ]


@router.get("/{group_id}/instances", response_model=List[InstanceResponse])
def group_instances(
    group_id: str,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("status:read")),
):
    q = db.query(Instance).filter(Instance.group_id == group_id)
    if not include_deleted:
        q = q.filter(Instance.deleted_at == None)
    return q.order_by(desc(Instance.created_at)).all()


@router.get("/{group_id}/nodebalancer")
def group_nodebalancer(
    group_id: str,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("status:read")),
):
    bindings = db.query(NodebalancerBinding).filter(
        NodebalancerBinding.group_id == group_id,
        NodebalancerBinding.deleted_at == None,
    ).all()
    return [
        {
            "id": b.id,
            "instance_id": b.instance_id,
            "nodebalancer_id": b.nodebalancer_id,
            "config_id": b.config_id,
            "node_id": b.node_id,
            "address": b.address,
            "mode": b.mode,
            "status": b.status,
        }
        for b in bindings
    ]


@router.get("/{group_id}/drift")
def group_drift(
    group_id: str,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("status:read")),
):
    records = db.query(DriftRecord).filter(
        DriftRecord.group_id == group_id,
        DriftRecord.status == "open",
    ).order_by(desc(DriftRecord.created_at)).all()
    return [
        {
            "id": r.id,
            "group_id": r.group_id,
            "linode_id": r.linode_id,
            "drift_type": r.drift_type,
            "status": r.status,
            "message": r.message,
            "created_at": r.created_at,
        }
        for r in records
    ]
