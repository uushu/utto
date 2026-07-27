"""Pydantic request and response schemas."""

from datetime import datetime

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str


class PairExchangeRequest(BaseModel):
    pairing_code: str


class PairExchangeResponse(BaseModel):
    device_token: str
    relationship_id: str
    display_name: str
    message: str


class BootstrapResponse(BaseModel):
    relationship_id: str
    display_name: str
    persona: dict | None
    device_last_seen: datetime | None
