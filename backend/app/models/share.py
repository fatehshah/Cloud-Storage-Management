from _sqlite3 import Column, Integer, String, DateTime, Boolean, ForeignKey
from datetime import datetime
from app.db import Base

class Share(Base):
    __tablename__ = "shares"

    id = Column(Integer, primary_key=True, index=True)

    # who created the link
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # what is being shared
    item_type = Column(String, nullable=False)   # "file" or "folder"
    item_id = Column(Integer, nullable=False, index=True)

    # the actual share token used in URL
    token = Column(String, unique=True, index=True, nullable=False)

    # permissions:
    # "view", "download", "upload" (upload only for folder, but we store it anyway)
    permission = Column(String, nullable=False, default="view")

    # link status
    is_active = Column(Boolean, default=True)

    # expiry options
    # A) fixed expiry time
    expires_at = Column(DateTime, nullable=True)

    # B) expire after first open (seconds)
    expire_after_open_seconds = Column(Integer, nullable=True)
    first_opened_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
