"""Pydantic request and response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


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


class ChatMessageInput(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessageInput] = Field(min_length=1, max_length=20)


class ChatMessageOutput(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str


class ChatResponse(BaseModel):
    message: ChatMessageOutput
    model: str
