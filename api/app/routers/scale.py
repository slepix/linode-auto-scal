from fastapi import APIRouter, Depends, Query, Header
from sqlalchemy.orm import Session
from typing import Optional
from ..db.base import get_db
from ..middleware.auth import require_permission
from ..schemas.scale import ScaleRequest, ScaleUpRequest, ScaleDownRequest, ScaleRequestResponse
from ..services.scale_service import create_scale_request

router = APIRouter(prefix="/v1/groups", tags=["Scaling"])


@router.post("/{group_id}/scale", response_model=ScaleRequestResponse, status_code=202)
def scale_group(
    group_id: str,
    payload: ScaleRequest,
    dry_run: bool = Query(default=False),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    api_key=Depends(require_permission("scale")),
):
    req = create_scale_request(
        db, group_id, "scale",
        payload.model_dump(exclude_none=True),
        idempotency_key, api_key.id, dry_run
    )
    return req


@router.post("/{group_id}/scale-up", response_model=ScaleRequestResponse, status_code=202)
def scale_up_group(
    group_id: str,
    payload: ScaleUpRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    api_key=Depends(require_permission("scale")),
):
    req = create_scale_request(
        db, group_id, "scale_up",
        {"action": "scale_up", "amount": payload.amount, "reason": payload.reason},
        idempotency_key, api_key.id
    )
    return req


@router.post("/{group_id}/scale-down", response_model=ScaleRequestResponse, status_code=202)
def scale_down_group(
    group_id: str,
    payload: ScaleDownRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    api_key=Depends(require_permission("scale")),
):
    data = {"action": "scale_down", "amount": payload.amount, "reason": payload.reason}
    if payload.target_instance_ids:
        data["target_instance_ids"] = payload.target_instance_ids
    req = create_scale_request(
        db, group_id, "scale_down",
        data,
        idempotency_key, api_key.id
    )
    return req
