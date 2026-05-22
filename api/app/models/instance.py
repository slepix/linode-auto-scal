from sqlalchemy import Column, String, Boolean, Integer, DateTime, Text
from sqlalchemy.sql import func
from ..db.base import Base


class Instance(Base):
    __tablename__ = "instances"

    id = Column(String, primary_key=True, default=lambda: __import__("uuid").uuid4().hex)
    group_id = Column(String, nullable=False, index=True)
    linode_id = Column(Integer, nullable=True, index=True)
    linode_label = Column(String, nullable=True)
    region = Column(String, nullable=True)
    type = Column(String, nullable=True)
    image = Column(String, nullable=True)
    public_ipv4 = Column(String, nullable=True)
    private_ipv4 = Column(String, nullable=True)
    vpc_ipv4 = Column(String, nullable=True)
    vpc_id = Column(Integer, nullable=True)
    subnet_id = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="creating", index=True)
    created_by = Column(String, nullable=False, default="autoscaler")
    protected = Column(Boolean, default=False, nullable=False)
    encrypted_root_password = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)
