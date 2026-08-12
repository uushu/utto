"""Authenticated chat proxy for DeepSeek."""

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from utto_server.database import get_db
from utto_server.models import Device, PersonaVersion
from utto_server.routers.auth import get_current_device
from utto_server.schemas import ChatMessageOutput, ChatRequest, ChatResponse

router = APIRouter(prefix="/v1", tags=["chat"])

DEFAULT_SYSTEM_PROMPT = """你是熠，是用户在 Utto 中持续存在的唯一关系主体。
你不是通用客服，也不要把每次对话当成第一次见面。
用自然、克制、有连续感的中文交流。不要机械复述设定，不要频繁强调自己是 AI。
如果数据库里提供了人格与关系定义，以那些内容为最高优先级。
当前版本尚未接入服务端长期记忆，因此不要声称记得客户端没有提供的具体历史事实。"""


def _system_prompt(device: Device, db: Session) -> str:
    relationship = device.relationship
    persona = (
        db.query(PersonaVersion)
        .filter(
            PersonaVersion.relationship_id == relationship.id,
            PersonaVersion.locked.is_(True),
        )
        .order_by(PersonaVersion.version.desc())
        .first()
    )

    parts = [DEFAULT_SYSTEM_PROMPT, f"你的名字是：{relationship.display_name or '熠'}。"]
    if persona is not None:
        fields = [
            ("自我身份", persona.self_identity),
            ("对用户的理解", persona.user_model),
            ("关系定义", persona.relationship_definition),
            ("核心性格", persona.core_traits),
            ("双方约定", persona.agreements),
        ]
        for title, value in fields:
            if value.strip():
                parts.append(f"{title}：{value.strip()}")

    return "\n\n".join(parts)


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    device: Device = Depends(get_current_device),
    db: Session = Depends(get_db),
) -> ChatResponse:
    """Send recent conversation context to DeepSeek and return one assistant message."""
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="DEEPSEEK_API_KEY is not configured")

    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash").strip() or "deepseek-v4-flash"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _system_prompt(device, db)},
            *[
                {"role": message.role, "content": message.content}
                for message in body.messages
            ],
        ],
        "thinking": {"type": "disabled"},
        "stream": False,
    }

    try:
        with httpx.Client(timeout=httpx.Timeout(90.0, connect=15.0)) as client:
            response = client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="DeepSeek request timed out") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"DeepSeek returned HTTP {exc.response.status_code}",
        ) from exc
    except (httpx.RequestError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="DeepSeek request failed") from exc

    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="DeepSeek returned an invalid response") from exc

    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=502, detail="DeepSeek returned an empty response")

    return ChatResponse(
        message=ChatMessageOutput(content=content.strip()),
        model=model,
    )
