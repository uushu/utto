"""add attachment audio transcripts

Revision ID: d9e2f8c3b5a7
Revises: c2e4f6a8b0d1
Create Date: 2026-08-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d9e2f8c3b5a7"
down_revision: Union[str, None] = "c2e4f6a8b0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("attachments", sa.Column("audio_transcript", sa.Text(), nullable=True))
    op.add_column(
        "attachments",
        sa.Column(
            "audio_transcript_state",
            sa.String(length=16),
            nullable=False,
            server_default="pending",
        ),
    )
    op.alter_column("attachments", "audio_transcript_state", server_default=None)


def downgrade() -> None:
    op.drop_column("attachments", "audio_transcript_state")
    op.drop_column("attachments", "audio_transcript")
