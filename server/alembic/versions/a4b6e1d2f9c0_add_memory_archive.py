"""add_memory_archive

Revision ID: a4b6e1d2f9c0
Revises: 52abeae6c0ae
Create Date: 2026-08-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a4b6e1d2f9c0"
down_revision: Union[str, None] = "52abeae6c0ae"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "memories",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("relationship_id", sa.String(length=32), nullable=False),
        sa.Column("category", sa.String(length=24), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("importance", sa.Integer(), nullable=False),
        sa.Column("sensitivity", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("source_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["relationship_id"], ["relationships.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memories_relationship_id", "memories", ["relationship_id"])
    op.create_table(
        "memory_states",
        sa.Column("relationship_id", sa.String(length=32), nullable=False),
        sa.Column("mind_summary", sa.Text(), nullable=False),
        sa.Column("mind_summary_watermark", sa.DateTime(), nullable=True),
        sa.Column("last_session_summary_at", sa.DateTime(), nullable=True),
        sa.Column("mood", sa.String(length=48), nullable=False),
        sa.Column("mood_score", sa.Integer(), nullable=False),
        sa.Column("desire", sa.String(length=48), nullable=False),
        sa.Column("desire_score", sa.Integer(), nullable=False),
        sa.Column("latest_dream", sa.Text(), nullable=False),
        sa.Column("last_capture_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["relationship_id"], ["relationships.id"]),
        sa.PrimaryKeyConstraint("relationship_id"),
    )


def downgrade() -> None:
    op.drop_table("memory_states")
    op.drop_index("ix_memories_relationship_id", table_name="memories")
    op.drop_table("memories")
