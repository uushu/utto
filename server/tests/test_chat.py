"""Tests for the authenticated DeepSeek chat proxy."""

import base64
from typing import Any

from fastapi.testclient import TestClient

from utto_server.routers import chat as chat_router


class FakeResponse:
    def __init__(self, payload: dict[str, Any]):
        self._payload = payload
        self.status_code = 200

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._payload


class FakeClient:
    last_request: dict[str, Any] | None = None

    def __init__(self, *args: Any, **kwargs: Any):
        pass

    def __enter__(self) -> "FakeClient":
        return self

    def __exit__(self, *args: Any) -> None:
        return None

    def post(self, url: str, **kwargs: Any) -> FakeResponse:
        FakeClient.last_request = {"url": url, **kwargs}
        return FakeResponse(
            {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "我在。你想从哪里说起？",
                        }
                    }
                ]
            }
        )


def test_chat_requires_auth(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    response = client.post(
        "/v1/chat",
        json={"messages": [{"role": "user", "content": "在吗"}]},
    )
    assert response.status_code == 401


def test_chat_requires_server_api_key(
    client: TestClient,
    auth_headers: dict[str, str],
    monkeypatch,
) -> None:
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    response = client.post(
        "/v1/chat",
        headers=auth_headers,
        json={"messages": [{"role": "user", "content": "在吗"}]},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "DEEPSEEK_API_KEY is not configured"


def test_chat_proxies_recent_context_to_deepseek(
    client: TestClient,
    auth_headers: dict[str, str],
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setattr(chat_router.httpx, "Client", FakeClient)

    response = client.post(
        "/v1/chat",
        headers=auth_headers,
        json={
            "messages": [
                {"role": "assistant", "content": "你来了。"},
                {"role": "user", "content": "今天有点累。"},
            ]
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": {"role": "assistant", "content": "我在。你想从哪里说起？"},
        "model": "deepseek-v4-flash",
    }

    request = FakeClient.last_request
    assert request is not None
    assert request["url"] == "https://api.deepseek.com/chat/completions"
    assert request["headers"]["Authorization"] == "Bearer test-key"
    payload = request["json"]
    assert payload["model"] == "deepseek-v4-flash"
    assert payload["thinking"] == {"type": "disabled"}
    assert payload["stream"] is False
    assert payload["messages"][0]["role"] == "system"
    assert "熠" in payload["messages"][0]["content"]
    assert payload["messages"][-1] == {"role": "user", "content": "今天有点累。"}


def test_chat_forwards_uploaded_document_content(
    client: TestClient,
    auth_headers: dict[str, str],
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setattr(chat_router.httpx, "Client", FakeClient)
    upload = client.post(
        "/v1/attachments",
        headers=auth_headers,
        json={
            "filename": "important.txt",
            "mime_type": "text/plain",
            "content_base64": base64.b64encode("只喝无糖豆浆".encode()).decode(),
        },
    )
    assert upload.status_code == 201

    response = client.post(
        "/v1/chat",
        headers=auth_headers,
        json={
            "messages": [{"role": "user", "content": "记住这个"}],
            "attachments": [{"id": upload.json()["id"]}],
        },
    )

    assert response.status_code == 200
    request = FakeClient.last_request
    assert request is not None
    assert "important.txt" in request["json"]["messages"][0]["content"]
    assert "只喝无糖豆浆" in request["json"]["messages"][0]["content"]


def test_attachment_only_message_asks_the_model_to_inspect_the_file(
    client: TestClient,
    auth_headers: dict[str, str],
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setattr(chat_router.httpx, "Client", FakeClient)
    upload = client.post(
        "/v1/attachments",
        headers=auth_headers,
        json={
            "filename": "note.txt",
            "mime_type": "text/plain",
            "content_base64": base64.b64encode("附件内容".encode()).decode(),
        },
    )
    assert upload.status_code == 201

    response = client.post(
        "/v1/chat",
        headers=auth_headers,
        json={
            "messages": [{"role": "user", "content": "请查看我附带的文件。"}],
            "attachments": [{"id": upload.json()["id"]}],
        },
    )

    assert response.status_code == 200
    request = FakeClient.last_request
    assert request is not None
    assert request["json"]["messages"][-1] == {
        "role": "user",
        "content": "请查看我附带的文件。",
    }


def test_stream_chat_forwards_uploaded_document_content(
    client: TestClient,
    auth_headers: dict[str, str],
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    captured: dict[str, Any] = {}

    def fake_stream_deepseek(**kwargs: Any):
        captured.update(kwargs)
        yield 'data: {"content":"收到"}\n\n'
        yield "data: [DONE]\n\n"

    monkeypatch.setattr(chat_router, "_stream_deepseek", fake_stream_deepseek)
    upload = client.post(
        "/v1/attachments",
        headers=auth_headers,
        json={
            "filename": "stream-note.txt",
            "mime_type": "text/plain",
            "content_base64": base64.b64encode("流式附件内容".encode()).decode(),
        },
    )
    assert upload.status_code == 201

    response = client.post(
        "/v1/chat/stream",
        headers=auth_headers,
        json={
            "messages": [{"role": "user", "content": "看一下附件"}],
            "attachments": [{"id": upload.json()["id"]}],
        },
    )

    assert response.status_code == 200
    assert "收到" in response.text
    assert "stream-note.txt" in captured["payload"]["messages"][0]["content"]
    assert "流式附件内容" in captured["payload"]["messages"][0]["content"]
