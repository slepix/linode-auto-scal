from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ApiKeyCreate(BaseModel):
    name: str
    role: str = "readonly"
    allowed_groups: Optional[List[str]] = None


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    role: str
    enabled: bool
    allowed_groups: Optional[List[str]]
    created_at: datetime
    last_used_at: Optional[datetime]

    class Config:
        from_attributes = True


class ApiKeyCreatedResponse(ApiKeyResponse):
    key: str
