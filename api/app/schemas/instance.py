from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class InstanceResponse(BaseModel):
    id: str
    group_id: str
    linode_id: Optional[int]
    linode_label: Optional[str]
    region: Optional[str]
    type: Optional[str]
    image: Optional[str]
    public_ipv4: Optional[str]
    private_ipv4: Optional[str]
    vpc_ipv4: Optional[str]
    status: str
    protected: bool
    created_by: str
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime]

    class Config:
        from_attributes = True


class RootPasswordResponse(BaseModel):
    instance_id: str
    linode_id: Optional[int]
    linode_label: Optional[str]
    root_password: str
