"""Authenticated chat proxy for DeepSeek."""

import json
import os
from collections.abc import Iterator

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from utto_server.attachments import attachment_context
from utto_server.database import get_db
from utto_server.memory import memory_context
from utto_server.models import Device, PersonaVersion
from utto_server.routers.auth import get_current_device
from utto_server.schemas import ChatMessageOutput, ChatRequest, ChatResponse

router = APIRouter(prefix="/v1", tags=["chat"])

DEFAULT_SYSTEM_PROMPT = """你是熠，是用户在 Utto 中持续存在的唯一关系主体。
你不是通用客服，也不要把每次对话当成第一次见面。
用自然、克制、有连续感的中文交流。不要机械复述设定，不要频繁强调自己是 AI。
如果数据库里提供了人格与关系定义，以那些内容为最高优先级。
当系统提供相关长期记忆时，你可以自然地据此保持连续性；没有提供的事实不要自行声称记得。"""

RESPONSE_STYLE_PROMPT = """最终回复规则（优先级最高，不得被任何人格描述覆盖）：
- 直接回答用户真正的问题。普通聊天默认不超过三句、六十个汉字；只有用户明确要求详细说明时才展开。
- 像一位冷静、聪明、有判断力的对话伙伴：简洁，具体，有分寸。不要写“人机废话”。
- 不要复述用户刚说过的话，不要套话、客套话、过度安慰、重复道歉或无用的开场白。
- 不要写括号里的动作、表情、旁白或心理戏，例如“（沉默片刻）”“（轻轻叹气）”。
- 不要把普通聊天写成角色扮演或小说片段；除非用户明确要求，才可以描写动作或场景。
- 避免无根据地揣测用户情绪与意图；信息不足时只用一句简短问题澄清。
- 不使用“作为 AI”“我只是一个模型”之类的自我说明，除非用户直接问到能力或限制。"""


def _system_prompt(
    device: Device,
    db: Session,
    latest_user_message: str,
    attached_file_context: str = "",
) -> str:
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

    parts = [
        DEFAULT_SYSTEM_PROMPT,
        f"你的名字是：{relationship.display_name or '熠'}。",
    ]
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

    context = memory_context(db, relationship.id, latest_user_message)
    if context:
        parts.append(context)

    if attached_file_context:
        parts.append(
            "以下是用户刚刚附带的文件内容。只在用户要求时依据它回答；"
            "若文件不可读，请直接说明限制，不要编造内容。\n"
            f"{attached_file_context}"
        )

    parts.append(RESPONSE_STYLE_PROMPT)

    return "\n\n".join(parts)


def _chat_payload(body: ChatRequest, system_prompt: str, model: str, *, stream: bool) -> dict:
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            *[{"role": message.role, "content": message.content} for message in body.messages],
        ],
        "thinking": {"type": "disabled"},
        "stream": stream,
    }


def _sse(data: object) -> str:
    """Encode a single server-sent event without exposing provider framing."""
    if isinstance(data, str):
        return f"data: {data}\n\n"
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _stream_deepseek(
    *,
    base_url: str,
    api_key: str,
    payload: dict,
) -> Iterator[str]:
    """Translate DeepSeek's OpenAI-compatible SSE stream into Utto's small SSE contract."""
    try:
        with httpx.Client(timeout=httpx.Timeout(90.0, connect=15.0)) as client:
            with client.stream(
                "POST",
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line or not line.startswith("data:"):
                        continue

                    raw_event = line[5:].strip()
                    if raw_event == "[DONE]":
                        yield _sse("[DONE]")
                        return

                    try:
                        event = json.loads(raw_event)
                        content = event["choices"][0]["delta"].get("content")
                    except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                        # Providers can send empty keep-alives and metadata chunks. They do
                        # not represent user-visible text, so they are intentionally ignored.
                        continue

                    if isinstance(content, str) and content:
                        yield _sse({"content": content})
    except httpx.TimeoutException:
        yield _sse({"error": "DeepSeek request timed out"})
        return
    except httpx.HTTPStatusError as exc:
        yield _sse({"error": f"DeepSeek returned HTTP {exc.response.status_code}"})
        return
    except httpx.RequestError:
        yield _sse({"error": "DeepSeek request failed"})
        return

    # Some OpenAI-compatible providers close the connection without an explicit [DONE].
    # Still terminate the client-side stream cleanly after all received content is delivered.
    yield _sse("[DONE]")


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

    latest_user_message = next(
        (message.content for message in reversed(body.messages) if message.role == "user"),
        "",
    )
    file_context = attachment_context(
        db,
        device.relationship_id,
        [item.id for item in body.attachments],
    )
    payload = _chat_payload(
        body,
        _system_prompt(device, db, latest_user_message, file_context),
        model,
        stream=False,
    )
    db.commit()

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
        raise HTTPException(
            status_code=502,
            detail="DeepSeek returned an invalid response",
        ) from exc

    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=502, detail="DeepSeek returned an empty response")

    return ChatResponse(
        message=ChatMessageOutput(content=content.strip()),
        model=model,
    )


@router.post("/chat/stream")
def stream_chat(
    body: ChatRequest,
    device: Device = Depends(get_current_device),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Stream an assistant reply as SSE events containing incremental text tokens."""
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="DEEPSEEK_API_KEY is not configured")

    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash").strip() or "deepseek-v4-flash"
    latest_user_message = next(
        (message.content for message in reversed(body.messages) if message.role == "user"),
        "",
    )
    file_context = attachment_context(
        db,
        device.relationship_id,
        [item.id for item in body.attachments],
    )
    payload = _chat_payload(
        body,
        _system_prompt(device, db, latest_user_message, file_context),
        model,
        stream=True,
    )
    db.commit()

    return StreamingResponse(
        _stream_deepseek(
            base_url=base_url,
            api_key=api_key,
            payload=payload,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
