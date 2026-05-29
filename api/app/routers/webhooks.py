from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from typing import Optional
from ..db.base import get_db
from ..middleware.auth import require_permission, check_group_access
from ..schemas.scale import WebhookScalePayload, ScaleRequestResponse
from ..services.scale_service import create_scale_request

router = APIRouter(prefix="/v1/webhooks", tags=["Webhooks"])


@router.post("/scale", response_model=ScaleRequestResponse, status_code=202)
def webhook_scale(
    payload: WebhookScalePayload,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    api_key=Depends(require_permission("scale")),
):
    data = payload.model_dump(exclude_none=True)
    group_id = data.pop("group_id")
    check_group_access(api_key, group_id)
    req_type = data.get("action", "scale")
    req = create_scale_request(db, group_id, req_type, data, idempotency_key, api_key.id)
    return req


@router.post("/alert")
def webhook_alert(payload: dict, _key=Depends(require_permission("scale"))):
    return {"received": True}
