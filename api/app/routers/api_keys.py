import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from ..db.base import get_db
from ..middleware.auth import require_permission
from ..models.api_key import ApiKey
from ..schemas.api_key import ApiKeyCreate, ApiKeyResponse, ApiKeyCreatedResponse
from ..core.crypto import generate_api_key, hash_api_key

router = APIRouter(prefix="/v1/api-keys", tags=["API Keys"])


def _parse_allowed_groups(raw: Optional[str]) -> Optional[List[str]]:
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _key_to_response(api_key: ApiKey) -> dict:
    return {
        "id": api_key.id,
        "name": api_key.name,
        "role": api_key.role,
        "enabled": api_key.enabled,
        "allowed_groups": _parse_allowed_groups(api_key.allowed_groups_json),
        "created_at": api_key.created_at,
        "last_used_at": api_key.last_used_at,
    }


@router.post("", response_model=ApiKeyCreatedResponse, status_code=201)
def create_api_key(
    payload: ApiKeyCreate,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("api_keys:manage")),
):
    valid_roles = {"admin", "operator", "webhook", "readonly"}
    if payload.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}")

    allowed_groups_json = None
    if payload.allowed_groups is not None:
        allowed_groups_json = json.dumps(payload.allowed_groups)

    raw_key = generate_api_key()
    key_hash = hash_api_key(raw_key)
    api_key = ApiKey(
        id=uuid.uuid4().hex,
        name=payload.name,
        key_hash=key_hash,
        role=payload.role,
        enabled=True,
        allowed_groups_json=allowed_groups_json,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    resp = _key_to_response(api_key)
    resp["key"] = raw_key
    return ApiKeyCreatedResponse(**resp)


@router.get("", response_model=List[ApiKeyResponse])
def list_api_keys(
    db: Session = Depends(get_db),
    _key=Depends(require_permission("api_keys:manage")),
):
    keys = db.query(ApiKey).filter(ApiKey.deleted_at == None).all()
    return [ApiKeyResponse(**_key_to_response(k)) for k in keys]


@router.delete("/{key_id}")
def delete_api_key(
    key_id: str,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("api_keys:manage")),
):
    api_key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.deleted_at == None).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
    api_key.deleted_at = datetime.now(timezone.utc)
    api_key.enabled = False
    db.commit()
    return {"message": f"API key '{key_id}' revoked"}
