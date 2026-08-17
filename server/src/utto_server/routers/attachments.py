"""Authenticated chat attachment uploads."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from utto_server.attachments import (
    audio_enabled,
    decode_upload,
    is_audio_bearing_attachment,
    is_image_attachment,
    is_text_attachment,
    is_video_attachment,
    validate_upload,
    vision_enabled,
)
from utto_server.database import get_db
from utto_server.models import Attachment, Device
from utto_server.routers.auth import get_current_device
from utto_server.schemas import AttachmentOutput, AttachmentUploadRequest

router = APIRouter(prefix="/v1/attachments", tags=["attachments"])


@router.post("", response_model=AttachmentOutput, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    request: Request,
    device: Device = Depends(get_current_device),
    db: Session = Depends(get_db),
    filename: str | None = Query(default=None, min_length=1, max_length=255),
    mime_type: str = Query(default="application/octet-stream", min_length=1, max_length=120),
) -> AttachmentOutput:
    if request.headers.get("content-type", "").startswith("application/json"):
        body = AttachmentUploadRequest.model_validate(await request.json())
        filename = body.filename
        mime_type = body.mime_type
        content = decode_upload(body.content_base64)
    else:
        if not filename:
            raise HTTPException(status_code=422, detail="filename is required")
        content = validate_upload(await request.body())

    attachment = Attachment(
        relationship_id=device.relationship_id,
        filename=filename.strip(),
        mime_type=mime_type.strip().lower(),
        size_bytes=len(content),
        content=content,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return AttachmentOutput(
        id=attachment.id,
        filename=attachment.filename,
        mime_type=attachment.mime_type,
        size_bytes=attachment.size_bytes,
        readable_as_text=is_text_attachment(attachment)
        or (
            (is_image_attachment(attachment) or is_video_attachment(attachment))
            and vision_enabled()
        )
        or (is_audio_bearing_attachment(attachment) and audio_enabled()),
        created_at=attachment.created_at,
    )
