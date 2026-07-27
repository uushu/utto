"""SQLAlchemy ORM models for Utto."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
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
