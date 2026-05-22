from sqlalchemy import Column, String, Integer, DateTime, Text
from sqlalchemy.sql import func
from ..db.base import Base


class ScaleRequest(Base):
    __tablename__ = "scale_requests"

    id = Column(String, primary_key=True, default=lambda: __import__("uuid").uuid4().hex)
    group_id = Column(String, nullable=False, index=True)
    request_type = Column(String, nullable=False)
    desired_count = Column(Integer, nullable=True)
    action = Column(String, nullable=True)
    amount = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="queued", index=True)
    reason = Column(Text, nullable=True)
    source = Column(String, nullable=True)
    idempotency_key = Column(String, nullable=True, index=True)
    request_hash = Column(String, nullable=True)
    created_by_api_key_id = Column(String, nullable=True)
    dry_run = Column(String, nullable=False, default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
