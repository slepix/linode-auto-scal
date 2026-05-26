import json
import uuid
import hashlib
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from ..models.scale_request import ScaleRequest
from ..models.scale_event import ScaleEvent
from ..models.group import Group
from ..models.instance import Instance


def _request_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def _check_concurrent(db: Session, group_id: str) -> None:
    active = db.query(ScaleRequest).filter(
        ScaleRequest.group_id == group_id,
        ScaleRequest.status.in_(["queued", "validating", "running"]),
    ).first()
    if active:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "scaling_event_in_progress",
                "message": f"Group {group_id} already has a scaling event in progress.",
                "active_event_id": active.id,
            },
        )


def _check_idempotency(db: Session, group_id: str, key: str, req_hash: str) -> Optional[ScaleRequest]:
    existing = db.query(ScaleRequest).filter(
        ScaleRequest.group_id == group_id,
        ScaleRequest.idempotency_key == key,
    ).first()
    if existing:
        if existing.request_hash != req_hash:
            raise HTTPException(status_code=409, detail="Idempotency key reused with different request body")
        return existing
    return None


def create_scale_request(
    db: Session,
    group_id: str,
    request_type: str,
    payload: dict,
    idempotency_key: Optional[str],
    api_key_id: str,
    dry_run: bool = False,
) -> ScaleRequest:
    group = db.query(Group).filter(Group.group_id == group_id, Group.deleted_at == None).first()
    if not group:
        raise HTTPException(status_code=404, detail=f"Group '{group_id}' not found")
    if not group.enabled:
        raise HTTPException(status_code=400, detail="Group is disabled")

    req_hash = _request_hash(payload)

    if idempotency_key:
        existing = _check_idempotency(db, group_id, idempotency_key, req_hash)
        if existing:
            return existing

    if not dry_run:
        _check_concurrent(db, group_id)

    instance_ids = payload.get("instance_ids")
    instance_ids_json = json.dumps(instance_ids) if instance_ids else None

    req = ScaleRequest(
        id=uuid.uuid4().hex,
        group_id=group_id,
        request_type=request_type,
        desired_count=payload.get("desired_count"),
        action=payload.get("action"),
        amount=payload.get("amount"),
        reason=payload.get("reason"),
        source=payload.get("source"),
        instance_ids_json=instance_ids_json,
        idempotency_key=idempotency_key,
        request_hash=req_hash,
        created_by_api_key_id=api_key_id,
        dry_run="true" if dry_run else "false",
        status="queued",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def get_group_status(db: Session, group_id: str) -> dict:
    group = db.query(Group).filter(Group.group_id == group_id, Group.deleted_at == None).first()
    if not group:
        raise HTTPException(status_code=404, detail=f"Group '{group_id}' not found")

    total = db.query(Instance).filter(
        Instance.group_id == group_id,
        Instance.deleted_at == None,
    ).count()
    active = db.query(Instance).filter(
        Instance.group_id == group_id,
        Instance.status == "active",
        Instance.deleted_at == None,
    ).count()
    creating = db.query(Instance).filter(
        Instance.group_id == group_id,
        Instance.status.in_(["creating", "booting", "waiting_initial_delay", "checking_tcp", "checking_http", "attaching_to_nodebalancer"]),
        Instance.deleted_at == None,
    ).count()
    draining = db.query(Instance).filter(
        Instance.group_id == group_id,
        Instance.status.in_(["draining", "deleting"]),
        Instance.deleted_at == None,
    ).count()
    failed = db.query(Instance).filter(
        Instance.group_id == group_id,
        Instance.status == "failed",
        Instance.deleted_at == None,
    ).count()

    active_request = db.query(ScaleRequest).filter(
        ScaleRequest.group_id == group_id,
        ScaleRequest.status.in_(["queued", "validating", "running"]),
    ).first()

    return {
        "group_id": group_id,
        "enabled": group.enabled,
        "desired_count": group.desired_count,
        "min_instances": group.min_instances,
        "max_instances": group.max_instances,
        "total_instances": total,
        "active_instances": active,
        "creating_instances": creating,
        "draining_instances": draining,
        "failed_instances": failed,
        "active_scale_request": active_request.id if active_request else None,
    }
