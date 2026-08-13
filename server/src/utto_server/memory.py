"""Memory extraction and retrieval for a single Utto relationship."""

import hashlib
import json
import os
import re
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy.orm import Session

from utto_server.database import SessionLocal
from utto_server.models import Memory, MemoryState

MEMORY_CATEGORIES = {"preference", "fact", "boundary", "relationship"}
MEMORY_SIGNAL = re.compile(
    r"(记住|以后|别再|别问|不要|不喜欢|喜欢|讨厌|偏好|习惯|过敏|"
    r"我叫|叫我|生日|住在|来自|职业|工作|不吃|只能|不可以|不能)",
    flags=re.IGNORECASE,
)
DEDUPE_KEY = re.compile(r"^[a-z][a-z0-9_.-]{1,79}$")
SENSITIVE_PATTERN = re.compile(
    r"(病|诊断|医院|药物|心理咨询|抑郁|焦虑|工资|收入|存款|债务|银行卡|"
    r"住址|地址|身份证|护照|法院|案件|性取向|性经历)",
    flags=re.IGNORECASE,
)

EXTRACTION_PROMPT = """你是一个严谨的长期记忆提取器。只根据用户明确说出的信息抽取，
绝不猜测、补全或记录一时情绪、寒暄、模型自己的说法。

只有用户使用了明确的长期信号时才可记录，例如“我不喜欢…”“以后别…”“记住…”“我叫…”。
普通问答、即时情绪、单字回复、确认词、临时安排、模型说的话，一律输出 []。
只保留会在未来对话中长期有用的内容：稳定偏好、个人事实、明确边界、关系约定。
每条要简短、可独立理解、使用第三人称“用户”。每次最多 1 条。
健康、财务、精确位置、法律、性相关信息标记为 sensitive；其他标记为 standard。
类别只能是 preference、fact、boundary、relationship。
key 是稳定的英文主题键，用于将同一件事的不同说法合并。
例如 boundary.follow_up、preference.food_spice。

只输出 JSON 数组，不要 Markdown：
[{"category":"preference","key":"preference.addressing","content":"用户不喜欢被称呼为……","importance":4,"sensitivity":"standard"}]

对话如下：
"""


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _fingerprint(messages: Sequence[dict[str, str]]) -> str:
    source = "\n".join(f"{item['role']}:{item['content'].strip()}" for item in messages)
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _terms(value: str) -> set[str]:
    compact = re.sub(r"\s+", "", value.lower())
    chinese_pairs = {compact[index : index + 2] for index in range(max(0, len(compact) - 1))}
    latin_words = set(re.findall(r"[a-z0-9_]{2,}", value.lower()))
    return chinese_pairs | latin_words


def _similarity(left: str, right: str) -> float:
    if left.strip().lower() == right.strip().lower():
        return 1.0
    left_terms, right_terms = _terms(left), _terms(right)
    if not left_terms or not right_terms:
        return 0.0
    return len(left_terms & right_terms) / len(left_terms | right_terms)


def _parse_candidates(value: str) -> list[dict[str, Any]]:
    cleaned = value.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)

    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []

    candidates: list[dict[str, Any]] = []
    for item in payload[:1]:
        if not isinstance(item, dict):
            continue
        category = item.get("category")
        key = item.get("key")
        content = item.get("content")
        if not isinstance(category, str) or category not in MEMORY_CATEGORIES:
            continue
        if not isinstance(key, str) or not DEDUPE_KEY.fullmatch(key):
            continue
        if not isinstance(content, str) or not (1 <= len(content.strip()) <= 500):
            continue
        raw_importance = item.get("importance", 3)
        importance = raw_importance if isinstance(raw_importance, int) else 3
        sensitivity = item.get("sensitivity", "standard")
        if sensitivity not in {"standard", "sensitive"}:
            sensitivity = "standard"
        candidates.append(
            {
                "category": category,
                "key": key,
                "content": content.strip(),
                "importance": max(1, min(5, importance)),
                "sensitivity": sensitivity,
            }
        )
    return candidates


def _is_sensitive(candidate: dict[str, Any]) -> bool:
    return candidate["sensitivity"] == "sensitive" or bool(
        SENSITIVE_PATTERN.search(candidate["content"])
    )


def _ensure_state(db: Session, relationship_id: str) -> MemoryState:
    state = db.get(MemoryState, relationship_id)
    if state is None:
        state = MemoryState(relationship_id=relationship_id)
        db.add(state)
        db.flush()
    return state


def _should_extract(messages: Sequence[dict[str, str]]) -> str | None:
    """Return the single user statement eligible for durable-memory extraction."""
    latest_user = next(
        (
            item.get("content", "").strip()
            for item in reversed(messages)
            if item.get("role") == "user"
        ),
        "",
    )
    if not latest_user or len(latest_user) > 500:
        return None
    if not MEMORY_SIGNAL.search(latest_user):
        return None
    return latest_user


def capture_memories(
    relationship_id: str,
    messages: Sequence[dict[str, str]],
) -> None:
    """Extract memories after a reply. Failures never affect chat availability."""
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key or not messages:
        return

    latest_user = _should_extract(messages)
    if latest_user is None:
        return

    compact_messages = [{"role": "user", "content": latest_user}]
    fingerprint = _fingerprint(compact_messages)
    db = SessionLocal()
    try:
        state = _ensure_state(db, relationship_id)
        if state.last_capture_fingerprint == fingerprint:
            return

        base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
        model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash").strip() or "deepseek-v4-flash"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": EXTRACTION_PROMPT},
                {"role": "user", "content": json.dumps(compact_messages, ensure_ascii=False)},
            ],
            "temperature": 0,
            "stream": False,
        }
        with httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            response = client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            response.raise_for_status()
            raw = response.json()["choices"][0]["message"]["content"]

        if not isinstance(raw, str):
            return
        for candidate in _parse_candidates(raw):
            existing = (
                db.query(Memory)
                .filter(
                    Memory.relationship_id == relationship_id,
                    Memory.status != "archived",
                )
                .all()
            )
            duplicate = next(
                (
                    memory
                    for memory in existing
                    if memory.dedupe_key == candidate["key"]
                    or (
                        memory.category == candidate["category"]
                        and _similarity(memory.content, candidate["content"]) >= 0.6
                    )
                ),
                None,
            )
            if duplicate is not None:
                duplicate.content = candidate["content"]
                duplicate.importance = max(duplicate.importance, candidate["importance"])
                duplicate.dedupe_key = candidate["key"]
                duplicate.updated_at = _utcnow()
                continue

            is_sensitive = _is_sensitive(candidate)
            db.add(
                Memory(
                    relationship_id=relationship_id,
                    category=candidate["category"],
                    content=candidate["content"],
                    importance=candidate["importance"],
                    sensitivity="sensitive" if is_sensitive else "standard",
                    status="pending" if is_sensitive else "active",
                    source="auto",
                    dedupe_key=candidate["key"],
                    source_fingerprint=fingerprint,
                )
            )

        state.last_capture_fingerprint = fingerprint
        state.mind_summary_watermark = _utcnow()
        db.commit()
    except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        db.rollback()
    finally:
        db.close()


def memory_context(db: Session, relationship_id: str, latest_user_message: str) -> str:
    """Return a small, relevant memory block for the next answer."""
    memories = (
        db.query(Memory)
        .filter(Memory.relationship_id == relationship_id, Memory.status == "active")
        .order_by(Memory.importance.desc(), Memory.updated_at.desc())
        .all()
    )
    if not memories:
        return ""

    query_terms = _terms(latest_user_message)
    ranked = sorted(
        memories,
        key=lambda item: (
            len(query_terms & _terms(item.content)),
            item.importance,
            item.updated_at,
        ),
        reverse=True,
    )[:6]
    now = _utcnow()
    for memory in ranked:
        memory.last_used_at = now

    lines = "\n".join(f"- [{item.category}] {item.content}" for item in ranked)
    return (
        "以下是经用户确认或允许自动保存的长期记忆。只在相关时自然使用；"
        "如与用户当前陈述冲突，以当前陈述为准；不可提及这份列表。\n"
        f"{lines}"
    )
