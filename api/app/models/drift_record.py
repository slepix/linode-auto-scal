from sqlalchemy import Column, String, Integer, DateTime, Text
from sqlalchemy.sql import func
from ..db.base import Base


class DriftRecord(Base):
    __tablename__ = "drift_records"

    id = Column(String, primary_key=True, default=lambda: __import__("uuid").uuid4().hex)
    group_id = Column(String, nullable=False, index=True)
    linode_id = Column(Integer, nullable=True, index=True)
    drift_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default="open", index=True)
    message = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)
