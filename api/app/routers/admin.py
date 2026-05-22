import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db.base import get_db
from ..middleware.auth import require_permission
from ..models.instance import Instance
from ..models.scale_request import ScaleRequest
from ..models.scale_event import ScaleEvent
from ..models.drift_record import DriftRecord
from ..models.group import Group
from ..schemas.instance import RootPasswordResponse
from ..core.crypto import decrypt

router = APIRouter(prefix="/v1/groups", tags=["Admin"])


@router.post("/{group_id}/force-reconcile")
def force_reconcile(
    group_id: str,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("force:ops")),
):
    group = db.query(Group).filter(Group.group_id == group_id, Group.deleted_at == None).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    event = ScaleEvent(
        id=uuid.uuid4().hex,
        group_id=group_id,
        event_type="reconcile_triggered",
        severity="info",
        message="Manual reconcile triggered via admin API",
    )
    db.add(event)
    db.commit()
    return {"message": f"Reconciliation triggered for group '{group_id}'"}


@router.post("/{group_id}/instances/{instance_id}/force-delete")
def force_delete_instance(
    group_id: str,
    instance_id: str,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("force:ops")),
):
    instance = db.query(Instance).filter(
        Instance.id == instance_id,
        Instance.group_id == group_id,
        Instance.deleted_at == None,
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    event = ScaleEvent(
        id=uuid.uuid4().hex,
        group_id=group_id,
        instance_id=instance_id,
        event_type="force_delete_triggered",
        severity="warning",
        message=f"Force delete triggered for instance {instance_id} (linode_id={instance.linode_id})",
    )
    db.add(event)
    instance.status = "deleting"
    db.commit()
    return {"message": f"Force delete triggered for instance '{instance_id}'"}


@router.post("/{group_id}/instances/{instance_id}/purge")
def purge_instance(
    group_id: str,
    instance_id: str,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("force:ops")),
):
    instance = db.query(Instance).filter(
        Instance.id == instance_id,
        Instance.group_id == group_id,
        Instance.deleted_at == None,
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    event = ScaleEvent(
        id=uuid.uuid4().hex,
        group_id=group_id,
        instance_id=instance_id,
        event_type="instance_purged",
        severity="warning",
        message=f"Instance {instance_id} (linode_id={instance.linode_id}) purged from DB via admin API",
    )
    db.add(event)
    instance.status = "deleted"
    instance.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": f"Instance '{instance_id}' purged from tracking"}


@router.post("/{group_id}/clear-cooldown")
def clear_cooldown(
    group_id: str,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("force:ops")),
):
    event = ScaleEvent(
        id=uuid.uuid4().hex,
        group_id=group_id,
        event_type="cooldown_cleared",
        severity="info",
        message="Cooldown cleared via admin API",
    )
    db.add(event)
    db.commit()
    return {"message": f"Cooldown cleared for group '{group_id}'"}


@router.get("/{group_id}/instances/{instance_id}/root-password", response_model=RootPasswordResponse)
def get_root_password(
    group_id: str,
    instance_id: str,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("root_password:read")),
):
    instance = db.query(Instance).filter(
        Instance.id == instance_id,
        Instance.group_id == group_id,
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    if not instance.encrypted_root_password:
        raise HTTPException(status_code=404, detail="No root password stored for this instance")
    try:
        password = decrypt(instance.encrypted_root_password)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt root password")
    return RootPasswordResponse(
        instance_id=instance.id,
        linode_id=instance.linode_id,
        linode_label=instance.linode_label,
        root_password=password,
    )


@router.post("/{group_id}/instances/{linode_id}/import")
def import_instance(
    group_id: str,
    linode_id: int,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("force:ops")),
):
    group = db.query(Group).filter(Group.group_id == group_id, Group.deleted_at == None).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    existing = db.query(Instance).filter(
        Instance.linode_id == linode_id,
        Instance.group_id == group_id,
        Instance.deleted_at == None,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Linode already tracked in this group")

    # Mark as import pending - controller will validate and complete
    instance = Instance(
        id=uuid.uuid4().hex,
        group_id=group_id,
        linode_id=linode_id,
        status="creating",
        created_by="import",
    )
    db.add(instance)

    drift = db.query(DriftRecord).filter(
        DriftRecord.group_id == group_id,
        DriftRecord.linode_id == linode_id,
        DriftRecord.status == "open",
    ).first()
    if drift:
        drift.status = "importing"
        drift.resolved_at = datetime.now(timezone.utc)

    db.commit()
    return {"message": f"Import of linode {linode_id} into group '{group_id}' initiated", "instance_id": instance.id}
