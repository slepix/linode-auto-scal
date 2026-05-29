from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from ..db.base import get_db
from ..models.api_key import ApiKey
from ..core.crypto import hash_api_key
from ..core.logging import get_logger
from sqlalchemy.sql import func

logger = get_logger("auth")
security = HTTPBearer()

ROLE_PERMISSIONS = {
    "admin": {"groups:write", "groups:delete", "scale", "status:read", "events:read",
              "force:ops", "root_password:read", "api_keys:manage"},
    "operator": {"scale", "status:read", "events:read"},
    "webhook": {"scale"},
    "readonly": {"status:read", "events:read"},
}


def _get_api_key(credentials: HTTPAuthorizationCredentials, db: Session) -> ApiKey:
    token = credentials.credentials
    key_hash = hash_api_key(token)
    api_key = db.query(ApiKey).filter(
        ApiKey.key_hash == key_hash,
        ApiKey.enabled == True,
        ApiKey.deleted_at == None,
    ).first()
    if not api_key:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")
    db.execute(
        ApiKey.__table__.update()
        .where(ApiKey.id == api_key.id)
        .values(last_used_at=func.now())
    )
    db.commit()
    return api_key


def require_permission(permission: str):
    def _checker(
        credentials: HTTPAuthorizationCredentials = Security(security),
        db: Session = Depends(get_db),
    ) -> ApiKey:
        api_key = _get_api_key(credentials, db)
        allowed = ROLE_PERMISSIONS.get(api_key.role, set())
        if permission not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{api_key.role}' does not have permission '{permission}'"
            )
        return api_key
    return _checker


def get_current_key(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db),
) -> ApiKey:
    return _get_api_key(credentials, db)
