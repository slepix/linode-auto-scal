from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.sql import func
from ..db.base import Base


class ScaleEvent(Base):
    __tablename__ = "scale_events"

    id = Column(String, primary_key=True, default=lambda: __import__("uuid").uuid4().hex)
    group_id = Column(String, nullable=False, index=True)
    instance_id = Column(String, nullable=True, index=True)
    event_type = Column(String, nullable=False, index=True)
    severity = Column(String, nullable=False, default="info")
    message = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
