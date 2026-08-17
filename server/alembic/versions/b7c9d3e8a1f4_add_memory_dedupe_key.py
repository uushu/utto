"""add_memory_dedupe_key

Revision ID: b7c9d3e8a1f4
Revises: a4b6e1d2f9c0
Create Date: 2026-08-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7c9d3e8a1f4"
down_revision: Union[str, None] = "a4b6e1d2f9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("memories", sa.Column("dedupe_key", sa.String(length=80), nullable=True))
    op.create_index("ix_memories_dedupe_key", "memories", ["dedupe_key"])


def downgrade() -> None:
    op.drop_index("ix_memories_dedupe_key", table_name="memories")
    op.drop_column("memories", "dedupe_key")
