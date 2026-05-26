from pydantic import BaseModel, model_validator
from typing import Optional
from datetime import datetime


class ScaleRequest(BaseModel):
    desired_count: Optional[int] = None
    action: Optional[str] = None
    amount: Optional[int] = None
    reason: Optional[str] = None
    source: Optional[str] = None
    target_instance_ids: Optional[list[str]] = None


class ScaleUpRequest(BaseModel):
    amount: int = 1
    reason: Optional[str] = None


class ScaleDownRequest(BaseModel):
    amount: int = 1
    reason: Optional[str] = None
    target_instance_ids: Optional[list[str]] = None

    @model_validator(mode="after")
    def validate_target_count(self):
        if self.target_instance_ids and len(self.target_instance_ids) != self.amount:
            raise ValueError(
                f"target_instance_ids length ({len(self.target_instance_ids)}) "
                f"must match amount ({self.amount})"
            )
        return self


class WebhookScalePayload(BaseModel):
    group_id: str
    desired_count: Optional[int] = None
    action: Optional[str] = None
    amount: Optional[int] = None
    source: Optional[str] = None
    reason: Optional[str] = None
    target_instance_ids: Optional[list[str]] = None


class ScaleRequestResponse(BaseModel):
    id: str
    group_id: str
    request_type: str
    desired_count: Optional[int]
    action: Optional[str]
    amount: Optional[int]
    target_instance_ids: Optional[str]
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
