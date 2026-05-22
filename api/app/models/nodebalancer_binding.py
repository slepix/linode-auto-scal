from sqlalchemy import Column, String, Integer, DateTime, Text
from sqlalchemy.sql import func
from ..db.base import Base


class NodebalancerBinding(Base):
    __tablename__ = "nodebalancer_bindings"

    id = Column(String, primary_key=True, default=lambda: __import__("uuid").uuid4().hex)
    group_id = Column(String, nullable=False, index=True)
    instance_id = Column(String, nullable=False, index=True)
    nodebalancer_id = Column(Integer, nullable=False)
    config_id = Column(Integer, nullable=False)
    node_id = Column(Integer, nullable=True)
    address = Column(String, nullable=True)
    subnet_id = Column(Integer, nullable=True)
    mode = Column(String, nullable=False, default="accept")
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)
