"""SQLAlchemy ORM models for Utto."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _uuid() -> str:
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    pass


class Relationship(Base):
    __tablename__ = "relationships"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    singleton_key: Mapped[str] = mapped_column(String(1), unique=True, nullable=False, default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    status: Mapped[str] = mapped_column(String(20), default="active")
    display_name: Mapped[str] = mapped_column(String(100), default="")


class PairingCode(Base):
    __tablename__ = "pairing_codes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    relationship_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("relationships.id"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    apns_device_token: Mapped[str | None] = mapped_column(String(256), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    relationship: Mapped[Relationship] = relationship()


class PersonaVersion(Base):
    __tablename__ = "persona_versions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    relationship_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("relationships.id"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    self_identity: Mapped[str] = mapped_column(Text, default="")
    user_model: Mapped[str] = mapped_column(Text, default="")
    relationship_definition: Mapped[str] = mapped_column(Text, default="")
    core_traits: Mapped[str] = mapped_column(Text, default="")
    agreements: Mapped[str] = mapped_column(Text, default="")
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(20), default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class Memory(Base):
    """A durable, user-reviewable fact used to keep the relationship coherent."""

    __tablename__ = "memories"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    relationship_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("relationships.id"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(24), nullable=False, default="fact")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    importance: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    sensitivity: Mapped[str] = mapped_column(String(16), nullable=False, default="standard")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="auto")
    dedupe_key: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    source_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    relationship: Mapped[Relationship] = relationship()


class MemoryState(Base):
    """Private relationship state. Deliberation data stays out of the chat prompt."""

    __tablename__ = "memory_states"

    relationship_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("relationships.id"), primary_key=True
    )
    mind_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    mind_summary_watermark: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_session_summary_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    mood: Mapped[str] = mapped_column(String(48), nullable=False, default="steady")
    mood_score: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    desire: Mapped[str] = mapped_column(String(48), nullable=False, default="connection")
    desire_score: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    latest_dream: Mapped[str] = mapped_column(Text, nullable=False, default="")
    last_capture_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    relationship: Mapped[Relationship] = relationship()


class Attachment(Base):
    """An encrypted-at-rest-capable database record for a user-uploaded chat file."""

    __tablename__ = "attachments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    relationship_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("relationships.id"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(
        String(120), nullable=False, default="application/octet-stream"
    )
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    audio_transcript: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    audio_transcript_state: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    relationship: Mapped[Relationship] = relationship()
