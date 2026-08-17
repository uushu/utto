"""Tests for private chat file uploads."""

import base64
import io
from typing import Any

import av
import httpx
from fastapi.testclient import TestClient
from openpyxl import Workbook
from PIL import Image

from utto_server import attachments as attachments_module
from utto_server.attachments import (
    MAX_VISION_RESPONSE_TOKENS,
    _audio_transcription,
    _image_content_parts,
    _video_content_parts,
    attachment_context,
    extract_text,
    is_audio_attachment,
    is_video_attachment,
)
from utto_server.models import Attachment


def test_attachment_upload_requires_auth(client: TestClient) -> None:
    response = client.post(
        "/v1/attachments",
        json={"filename": "note.txt", "mime_type": "text/plain", "content_base64": "aGVsbG8="},
    )
    assert response.status_code == 401


def test_text_attachment_upload_returns_safe_metadata(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    response = client.post(
        "/v1/attachments",
        headers=auth_headers,
        json={
            "filename": "note.txt",
            "mime_type": "text/plain",
            "content_base64": base64.b64encode("你好，熠".encode()).decode(),
        },
    )
    assert response.status_code == 201
    attachment = response.json()
    assert attachment["filename"] == "note.txt"
    assert attachment["readable_as_text"] is True
    assert attachment["size_bytes"] > 0


def test_attachment_rejects_invalid_base64(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    response = client.post(
        "/v1/attachments",
        headers=auth_headers,
        json={"filename": "bad.txt", "mime_type": "text/plain", "content_base64": "not base64!"},
    )
    assert response.status_code == 422


def test_binary_attachment_upload_accepts_gif_like_bytes(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    response = client.post(
        "/v1/attachments",
        params={"filename": "loop.gif", "mime_type": "image/gif"},
        headers={**auth_headers, "Content-Type": "image/gif"},
        content=b"GIF89a\x01\x00\x01\x00",
    )
    assert response.status_code == 201
    assert response.json()["filename"] == "loop.gif"
    assert response.json()["mime_type"] == "image/gif"


def test_spreadsheet_text_is_extracted_before_chat() -> None:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "事项"
    worksheet.append(["日期", "安排"])
    worksheet.append(["周五", "和熠看电影"])
    content = io.BytesIO()
    workbook.save(content)
    attachment = Attachment(
        id="a" * 32,
        relationship_id="r" * 32,
        filename="安排.xlsx",
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes=len(content.getvalue()),
        content=content.getvalue(),
    )

    assert "和熠看电影" in extract_text(attachment)


def test_attachment_context_includes_text_for_the_chat_model(db) -> None:
    attachment = Attachment(
        id="b" * 32,
        relationship_id="r" * 32,
        filename="note.txt",
        mime_type="text/plain",
        size_bytes=12,
        content="明天提醒我喝水".encode(),
    )
    db.add(attachment)
    db.commit()

    context = attachment_context(db, "r" * 32, [attachment.id])

    assert "note.txt" in context
    assert "明天提醒我喝水" in context


def test_malformed_document_does_not_break_chat_context() -> None:
    attachment = Attachment(
        id="c" * 32,
        relationship_id="r" * 32,
        filename="broken.pdf",
        mime_type="application/pdf",
        size_bytes=4,
        content=b"nope",
    )

    assert extract_text(attachment) == ""


def test_gif_produces_image_parts_for_vision() -> None:
    image = io.BytesIO()
    Image.new("RGB", (4, 4), (12, 34, 56)).save(image, format="GIF")
    attachment = Attachment(
        id="d" * 32,
        relationship_id="r" * 32,
        filename="loop.gif",
        mime_type="image/gif",
        size_bytes=len(image.getvalue()),
        content=image.getvalue(),
    )

    parts = _image_content_parts(attachment, 8)

    assert any(part.get("type") == "image_url" for part in parts)


def test_video_is_identified_for_visual_analysis() -> None:
    attachment = Attachment(
        id="f" * 32,
        relationship_id="r" * 32,
        filename="clip.mp4",
        mime_type="video/mp4",
        size_bytes=1,
        content=b"x",
    )

    assert is_video_attachment(attachment) is True


def test_audio_is_identified_for_local_transcription() -> None:
    attachment = Attachment(
        id="h" * 32,
        relationship_id="r" * 32,
        filename="voice.m4a",
        mime_type="audio/mp4",
        size_bytes=1,
        content=b"x",
    )

    assert is_audio_attachment(attachment) is True


def test_cached_audio_transcript_does_not_load_the_model() -> None:
    attachment = Attachment(
        id="i" * 32,
        relationship_id="r" * 32,
        filename="voice.mp3",
        mime_type="audio/mpeg",
        size_bytes=1,
        content=b"x",
        audio_transcript="明天十点开会。",
        audio_transcript_state="ready",
    )

    assert _audio_transcription(attachment) == "明天十点开会。"


def test_short_video_produces_sample_frames_for_vision() -> None:
    output = io.BytesIO()
    with av.open(output, mode="w", format="mp4") as container:
        stream = container.add_stream("mpeg4", rate=2)
        stream.width = 32
        stream.height = 32
        stream.pix_fmt = "yuv420p"
        for color in ((12, 34, 56), (56, 34, 12), (34, 56, 12)):
            frame = av.VideoFrame.from_image(Image.new("RGB", (32, 32), color))
            for packet in stream.encode(frame):
                container.mux(packet)
        for packet in stream.encode():
            container.mux(packet)

    attachment = Attachment(
        id="g" * 32,
        relationship_id="r" * 32,
        filename="clip.mp4",
        mime_type="video/mp4",
        size_bytes=len(output.getvalue()),
        content=output.getvalue(),
    )

    parts = _video_content_parts(attachment, 3)

    assert any(part.get("type") == "image_url" for part in parts)


def test_image_is_marked_readable_when_vision_is_configured(
    client: TestClient,
    auth_headers: dict[str, str],
    monkeypatch,
) -> None:
    monkeypatch.setenv("UTTO_VISION_BASE_URL", "https://vision.example.test/v1")
    monkeypatch.setenv("UTTO_VISION_MODEL", "vision-test")
    response = client.post(
        "/v1/attachments",
        params={"filename": "photo.jpg", "mime_type": "image/jpeg"},
        headers={**auth_headers, "Content-Type": "image/jpeg"},
        content=b"image-bytes",
    )

    assert response.status_code == 201
    assert response.json()["readable_as_text"] is True


def test_video_is_marked_readable_when_vision_is_configured(
    client: TestClient,
    auth_headers: dict[str, str],
    monkeypatch,
) -> None:
    monkeypatch.setenv("UTTO_VISION_BASE_URL", "https://vision.example.test/v1")
    monkeypatch.setenv("UTTO_VISION_MODEL", "vision-test")
    response = client.post(
        "/v1/attachments",
        params={"filename": "clip.mp4", "mime_type": "video/mp4"},
        headers={**auth_headers, "Content-Type": "video/mp4"},
        content=b"video-bytes",
    )

    assert response.status_code == 201
    assert response.json()["readable_as_text"] is True


def test_audio_is_marked_readable_when_local_transcription_is_configured(
    client: TestClient,
    auth_headers: dict[str, str],
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("UTTO_AUDIO_MODEL", str(tmp_path))
    response = client.post(
        "/v1/attachments",
        params={"filename": "voice.m4a", "mime_type": "audio/mp4"},
        headers={**auth_headers, "Content-Type": "audio/mp4"},
        content=b"audio-bytes",
    )

    assert response.status_code == 201
    assert response.json()["readable_as_text"] is True


class _VisionResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return {"choices": [{"message": {"content": "画面里有一只猫。"}}]}


class _VisionClient:
    request: dict[str, Any] | None = None

    def __init__(self, *args: Any, **kwargs: Any):
        pass

    def __enter__(self) -> "_VisionClient":
        return self

    def __exit__(self, *args: Any) -> None:
        return None

    def post(self, url: str, **kwargs: Any) -> _VisionResponse:
        _VisionClient.request = {"url": url, **kwargs}
        return _VisionResponse()


def test_image_description_is_injected_for_the_chat_model(db, monkeypatch) -> None:
    image = io.BytesIO()
    Image.new("RGB", (4, 4), (12, 34, 56)).save(image, format="JPEG")
    attachment = Attachment(
        id="e" * 32,
        relationship_id="r" * 32,
        filename="cat.jpg",
        mime_type="image/jpeg",
        size_bytes=len(image.getvalue()),
        content=image.getvalue(),
    )
    db.add(attachment)
    db.commit()
    monkeypatch.setenv("UTTO_VISION_BASE_URL", "https://vision.example.test/v1")
    monkeypatch.setenv("UTTO_VISION_API_KEY", "vision-key")
    monkeypatch.setenv("UTTO_VISION_MODEL", "vision-test")
    monkeypatch.setattr(attachments_module.httpx, "Client", _VisionClient)

    context = attachment_context(db, "r" * 32, [attachment.id])

    assert "cat.jpg" in context
    assert "画面里有一只猫。" in context
    assert _VisionClient.request is not None
    assert _VisionClient.request["url"] == "https://vision.example.test/v1/chat/completions"
    assert _VisionClient.request["headers"]["Authorization"] == "Bearer vision-key"
    assert _VisionClient.request["json"]["max_tokens"] == MAX_VISION_RESPONSE_TOKENS


class _RecoveringVisionResponse:
    def __init__(self, data: dict[str, Any]):
        self.data = data

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self.data


class _RecoveringVisionClient:
    requests: list[dict[str, Any]] = []
    chat_requests = 0

    def __init__(self, *args: Any, **kwargs: Any):
        pass

    def __enter__(self) -> "_RecoveringVisionClient":
        return self

    def __exit__(self, *args: Any) -> None:
        return None

    def post(self, url: str, **kwargs: Any) -> _RecoveringVisionResponse:
        type(self).requests.append({"url": url, **kwargs})
        if url.endswith("/v1/chat/completions"):
            type(self).chat_requests += 1
            content = "@@@@@@@@" if type(self).chat_requests == 1 else "画面里有一只猫。"
            return _RecoveringVisionResponse({"choices": [{"message": {"content": content}}]})
        if url.endswith("/api/generate"):
            return _RecoveringVisionResponse({"done": True})
        raise AssertionError(f"Unexpected vision URL: {url}")


def test_corrupt_local_vision_reply_resets_and_retries(db, monkeypatch) -> None:
    image = io.BytesIO()
    Image.new("RGB", (4, 4), (12, 34, 56)).save(image, format="JPEG")
    attachment = Attachment(
        id="k" * 32,
        relationship_id="r" * 32,
        filename="cat.jpg",
        mime_type="image/jpeg",
        size_bytes=len(image.getvalue()),
        content=image.getvalue(),
    )
    db.add(attachment)
    db.commit()
    _RecoveringVisionClient.requests = []
    _RecoveringVisionClient.chat_requests = 0
    monkeypatch.setenv("UTTO_VISION_BASE_URL", "http://host.docker.internal:11434/v1")
    monkeypatch.setenv("UTTO_VISION_MODEL", "qwen2.5vl:3b")
    monkeypatch.setattr(attachments_module.httpx, "Client", _RecoveringVisionClient)

    context = attachment_context(db, "r" * 32, [attachment.id])

    assert "画面里有一只猫。" in context
    assert [request["url"] for request in _RecoveringVisionClient.requests] == [
        "http://host.docker.internal:11434/v1/chat/completions",
        "http://host.docker.internal:11434/api/generate",
        "http://host.docker.internal:11434/v1/chat/completions",
    ]


class _TimeoutThenRecoverVisionClient:
    requests: list[dict[str, Any]] = []
    chat_requests = 0

    def __init__(self, *args: Any, **kwargs: Any):
        pass

    def __enter__(self) -> "_TimeoutThenRecoverVisionClient":
        return self

    def __exit__(self, *args: Any) -> None:
        return None

    def post(self, url: str, **kwargs: Any) -> _RecoveringVisionResponse:
        type(self).requests.append({"url": url, **kwargs})

        if url.endswith("/v1/chat/completions"):
            type(self).chat_requests += 1

            if type(self).chat_requests == 1:
                raise httpx.ReadTimeout("vision timeout")

            return _RecoveringVisionResponse(
                {"choices": [{"message": {"content": "恢复后识别到一只猫。"}}]}
            )

        if url.endswith("/api/generate"):
            return _RecoveringVisionResponse({"done": True})

        raise AssertionError(f"Unexpected vision URL: {url}")


def test_vision_timeout_resets_and_retries(db, monkeypatch) -> None:
    image = io.BytesIO()
    Image.new("RGB", (4, 4), (12, 34, 56)).save(image, format="JPEG")
    attachment = Attachment(
        id="m" * 32,
        relationship_id="r" * 32,
        filename="cat.jpg",
        mime_type="image/jpeg",
        size_bytes=len(image.getvalue()),
        content=image.getvalue(),
    )
    db.add(attachment)
    db.commit()

    _TimeoutThenRecoverVisionClient.requests = []
    _TimeoutThenRecoverVisionClient.chat_requests = 0

    monkeypatch.setenv(
        "UTTO_VISION_BASE_URL",
        "http://host.docker.internal:11434/v1",
    )
    monkeypatch.setenv(
        "UTTO_VISION_MODEL",
        "qwen2.5vl:3b",
    )
    monkeypatch.setattr(
        attachments_module.httpx,
        "Client",
        _TimeoutThenRecoverVisionClient,
    )

    context = attachment_context(
        db,
        "r" * 32,
        [attachment.id],
    )

    assert "恢复后识别到一只猫。" in context
    assert [request["url"] for request in _TimeoutThenRecoverVisionClient.requests] == [
        "http://host.docker.internal:11434/v1/chat/completions",
        "http://host.docker.internal:11434/api/generate",
        "http://host.docker.internal:11434/v1/chat/completions",
    ]


class _CpuFallbackVisionClient:
    requests: list[dict[str, Any]] = []

    def __init__(self, *args: Any, **kwargs: Any):
        pass

    def __enter__(self) -> "_CpuFallbackVisionClient":
        return self

    def __exit__(self, *args: Any) -> None:
        return None

    def post(self, url: str, **kwargs: Any) -> _RecoveringVisionResponse:
        type(self).requests.append({"url": url, **kwargs})

        if url.endswith("/v1/chat/completions"):
            return _RecoveringVisionResponse({"choices": [{"message": {"content": "@@@@@@@@"}}]})

        if url.endswith("/api/generate"):
            return _RecoveringVisionResponse({"done": True})

        if url.endswith("/api/chat"):
            return _RecoveringVisionResponse({"message": {"content": "CPU 回退成功识别到一只猫。"}})

        raise AssertionError(f"Unexpected vision URL: {url}")


def test_corrupt_vision_falls_back_to_cpu_ollama(db, monkeypatch) -> None:
    image = io.BytesIO()
    Image.new("RGB", (4, 4), (12, 34, 56)).save(image, format="JPEG")
    attachment = Attachment(
        id="n" * 32,
        relationship_id="r" * 32,
        filename="cat.jpg",
        mime_type="image/jpeg",
        size_bytes=len(image.getvalue()),
        content=image.getvalue(),
    )
    db.add(attachment)
    db.commit()

    _CpuFallbackVisionClient.requests = []

    monkeypatch.setenv(
        "UTTO_VISION_BASE_URL",
        "http://host.docker.internal:11434/v1",
    )
    monkeypatch.setenv(
        "UTTO_VISION_MODEL",
        "qwen2.5vl:3b",
    )
    monkeypatch.setattr(
        attachments_module.httpx,
        "Client",
        _CpuFallbackVisionClient,
    )

    context = attachment_context(
        db,
        "r" * 32,
        [attachment.id],
    )

    assert "CPU 回退成功识别到一只猫。" in context

    assert [request["url"] for request in _CpuFallbackVisionClient.requests] == [
        "http://host.docker.internal:11434/v1/chat/completions",
        "http://host.docker.internal:11434/api/generate",
        "http://host.docker.internal:11434/v1/chat/completions",
        "http://host.docker.internal:11434/api/chat",
    ]

    cpu_request = _CpuFallbackVisionClient.requests[-1]

    assert cpu_request["json"]["keep_alive"] == 0
    assert cpu_request["json"]["stream"] is False
    assert cpu_request["json"]["options"]["num_gpu"] == 0
    assert cpu_request["json"]["options"]["num_ctx"] == 4096
    assert cpu_request["json"]["options"]["num_predict"] == MAX_VISION_RESPONSE_TOKENS


def test_audio_transcript_is_injected_for_the_chat_model(db, monkeypatch) -> None:
    attachment = Attachment(
        id="j" * 32,
        relationship_id="r" * 32,
        filename="voice.m4a",
        mime_type="audio/mp4",
        size_bytes=10,
        content=b"audio-bytes",
    )
    db.add(attachment)
    db.commit()
    monkeypatch.setattr(
        attachments_module,
        "_audio_transcription",
        lambda current: "我明天上午十点有一场面试。" if current.id == attachment.id else "",
    )

    context = attachment_context(db, "r" * 32, [attachment.id])

    assert "voice.m4a" in context
    assert "我明天上午十点有一场面试。" in context
