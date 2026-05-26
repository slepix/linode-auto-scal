from sqlalchemy import Column, String, Boolean, Integer, DateTime, Text
from sqlalchemy.sql import func
from ..db.base import Base


class Group(Base):
    __tablename__ = "groups"

    id = Column(String, primary_key=True, default=lambda: __import__("uuid").uuid4().hex)
    group_id = Column(String, unique=True, nullable=False, index=True)
    enabled = Column(Boolean, default=True, nullable=False)
    region = Column(String, nullable=False)
    type = Column(String, nullable=False)
    image = Column(String, nullable=False)
    min_instances = Column(Integer, nullable=False, default=1)
    max_instances = Column(Integer, nullable=False, default=10)
    desired_count = Column(Integer, nullable=False, default=1)
    max_scale_step = Column(Integer, nullable=False, default=3)
    label_prefix = Column(String, nullable=False)
    protected_tag = Column(String, nullable=False, default="autoscaler:protected")
    nodebalancer_id = Column(Integer, nullable=True)
    network_config_json = Column(Text, nullable=True)
    readiness_config_json = Column(Text, nullable=True)
    cooldown_config_json = Column(Text, nullable=True)
    reconciliation_config_json = Column(Text, nullable=True)
    alerting_config_json = Column(Text, nullable=True)
    boot_config_json = Column(Text, nullable=True)
    tags_json = Column(Text, nullable=True)
    nodebalancer_config_json = Column(Text, nullable=True)
    metric_scaling_config_json = Column(Text, nullable=True)
    encrypted_linode_token = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)
