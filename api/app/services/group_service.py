import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..models.group import Group
from ..models.instance import Instance
from ..schemas.group import GroupCreate, GroupUpdate, GroupResponse, NetworkConfig, ReadinessConfig, CooldownConfig, ReconciliationConfig, AlertingConfig, NodebalancerConfig, BootConfig, MetricScalingConfig
from ..core.crypto import encrypt
from fastapi import HTTPException


def _label_prefix(group_id: str) -> str:
    return f"{group_id}-as"


def create_group(db: Session, payload: GroupCreate) -> Group:
    existing = db.query(Group).filter(Group.group_id == payload.group_id, Group.deleted_at == None).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Group '{payload.group_id}' already exists")

    # Remove any soft-deleted group with the same group_id to avoid unique constraint violation
    soft_deleted = db.query(Group).filter(
        Group.group_id == payload.group_id,
        Group.deleted_at != None,
    ).first()
    if soft_deleted:
        db.delete(soft_deleted)
        db.flush()

    encrypted_token = encrypt(payload.linode_token)
    label_prefix = payload.label_prefix or _label_prefix(payload.group_id)
    tags = list(set(payload.tags + ["autoscaler:managed", f"autoscaler:group:{payload.group_id}"]))

    # Encrypt alerting bearer token if present
    alerting_cfg = payload.alerting
    alerting_json = None
    if alerting_cfg:
        alerting_dict = alerting_cfg.model_dump()
        alerting_json = json.dumps(alerting_dict)

    group = Group(
        id=uuid.uuid4().hex,
        group_id=payload.group_id,
        enabled=payload.enabled,
        region=payload.region,
        type=payload.type,
        image=payload.image,
        min_instances=payload.min_instances,
        max_instances=payload.max_instances,
        desired_count=payload.desired_count,
        max_scale_step=payload.max_scale_step,
        label_prefix=label_prefix,
        protected_tag=payload.protected_tag,
        nodebalancer_id=payload.nodebalancer.id if payload.nodebalancer else None,
        encrypted_linode_token=encrypted_token,
        network_config_json=json.dumps(payload.network.model_dump()) if payload.network else None,
        nodebalancer_config_json=json.dumps(payload.nodebalancer.model_dump()) if payload.nodebalancer else None,
        readiness_config_json=json.dumps(payload.readiness.model_dump()) if payload.readiness else None,
        cooldown_config_json=json.dumps(payload.cooldowns.model_dump()) if payload.cooldowns else None,
        reconciliation_config_json=json.dumps(payload.reconciliation.model_dump()) if payload.reconciliation else None,
        alerting_config_json=alerting_json,
        boot_config_json=json.dumps(payload.boot.model_dump()) if payload.boot else None,
        metric_scaling_config_json=json.dumps(payload.metric_scaling.model_dump()) if payload.metric_scaling else None,
        tags_json=json.dumps(tags),
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


def get_groups(db: Session, skip: int = 0, limit: int = 100) -> List[Group]:
    return db.query(Group).filter(Group.deleted_at == None).offset(skip).limit(limit).all()


def get_group(db: Session, group_id: str) -> Group:
    group = db.query(Group).filter(Group.group_id == group_id, Group.deleted_at == None).first()
    if not group:
        raise HTTPException(status_code=404, detail=f"Group '{group_id}' not found")
    return group


def update_group(db: Session, group_id: str, payload: GroupUpdate) -> Group:
    group = get_group(db, group_id)
    updates = payload.model_dump(exclude_none=True)

    # Handle linode_token re-encryption
    if "linode_token" in updates:
        group.encrypted_linode_token = encrypt(updates.pop("linode_token"))

    # Handle network config
    if "network" in updates:
        group.network_config_json = json.dumps(updates.pop("network"))

    # Handle nodebalancer config
    if "nodebalancer" in updates:
        nb_data = updates.pop("nodebalancer")
        group.nodebalancer_config_json = json.dumps(nb_data)
        group.nodebalancer_id = nb_data.get("id")

    # Handle boot config
    if "boot" in updates:
        group.boot_config_json = json.dumps(updates.pop("boot"))

    # Handle other JSON configs
    for key in ["readiness", "cooldowns", "reconciliation", "alerting", "metric_scaling"]:
        if key in updates:
            if key == "cooldowns":
                json_key = "cooldown_config_json"
            elif key == "metric_scaling":
                json_key = "metric_scaling_config_json"
            else:
                json_key = f"{key}_config_json"
            setattr(group, json_key, json.dumps(updates.pop(key)))

    for k, v in updates.items():
        setattr(group, k, v)
    group.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(group)
    return group


def delete_group(db: Session, group_id: str, force: bool = False) -> dict:
    if not force:
        raise HTTPException(status_code=400, detail="Group deletion requires force=true")
    group = get_group(db, group_id)
    # Check for active instances
    active = db.query(Instance).filter(
        Instance.group_id == group_id,
        Instance.status.in_(["active", "creating", "booting", "draining"]),
        Instance.deleted_at == None,
    ).count()
    if active > 0 and not force:
        raise HTTPException(status_code=409, detail=f"Group has {active} active instances. Use force=true after draining.")
    group.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": f"Group '{group_id}' marked for deletion"}


def group_to_response(group: Group) -> GroupResponse:
    def _parse(json_str, model):
        if not json_str:
            return None
        try:
            return model(**json.loads(json_str))
        except Exception:
            return None

    return GroupResponse(
        id=group.id,
        group_id=group.group_id,
        enabled=group.enabled,
        region=group.region,
        type=group.type,
        image=group.image,
        min_instances=group.min_instances,
        max_instances=group.max_instances,
        desired_count=group.desired_count,
        max_scale_step=group.max_scale_step,
        label_prefix=group.label_prefix,
        protected_tag=group.protected_tag,
        nodebalancer_id=group.nodebalancer_id,
        network_config=_parse(group.network_config_json, NetworkConfig),
        nodebalancer_config=_parse(group.nodebalancer_config_json, NodebalancerConfig),
        boot_config=_parse(group.boot_config_json, BootConfig),
        readiness_config=_parse(group.readiness_config_json, ReadinessConfig),
        cooldown_config=_parse(group.cooldown_config_json, CooldownConfig),
        reconciliation_config=_parse(group.reconciliation_config_json, ReconciliationConfig),
        alerting_config=_parse(group.alerting_config_json, AlertingConfig),
        metric_scaling_config=_parse(group.metric_scaling_config_json, MetricScalingConfig),
        created_at=group.created_at,
        updated_at=group.updated_at,
    )
