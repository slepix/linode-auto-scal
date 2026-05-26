from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ScaleRequest(BaseModel):
    desired_count: Optional[int] = None
    action: Optional[str] = None
    amount: Optional[int] = None
    reason: Optional[str] = None
    source: Optional[str] = None


class ScaleUpRequest(BaseModel):
    amount: int = 1
    reason: Optional[str] = None


class ScaleDownRequest(BaseModel):
    amount: int = 1
    reason: Optional[str] = None


class WebhookScalePayload(BaseModel):
    group_id: str
    desired_count: Optional[int] = None
    action: Optional[str] = None
    amount: Optional[int] = None
    source: Optional[str] = None
    reason: Optional[str] = None


class ScaleRequestResponse(BaseModel):
    id: str
    group_id: str
    request_type: str
    desired_count: Optional[int]
    action: Optional[str]
    amount: Optional[int]
    status: str
    reason: Optional[str]
    source: Optional[str]
    idempotency_key: Optional[str]
    dry_run: str
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True
