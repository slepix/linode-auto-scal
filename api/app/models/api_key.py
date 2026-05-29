from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from ..db.base import Base


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(String, primary_key=True, default=lambda: __import__("uuid").uuid4().hex)
    name = Column(String, nullable=False)
    key_hash = Column(String, nullable=False, unique=True, index=True)
    role = Column(String, nullable=False, default="readonly")
    enabled = Column(Boolean, default=True, nullable=False)
    allowed_groups_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
