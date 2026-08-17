"""add_chat_attachments

Revision ID: c2e4f6a8b0d1
Revises: b7c9d3e8a1f4
Create Date: 2026-08-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c2e4f6a8b0d1"
down_revision: Union[str, None] = "b7c9d3e8a1f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "attachments",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("relationship_id", sa.String(length=32), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["relationship_id"], ["relationships.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_attachments_relationship_id", "attachments", ["relationship_id"])


def downgrade() -> None:
    op.drop_index("ix_attachments_relationship_id", table_name="attachments")
    op.drop_table("attachments")
