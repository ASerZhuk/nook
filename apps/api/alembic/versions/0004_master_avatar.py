"""master avatar

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("masters") as batch:
        batch.add_column(sa.Column("avatar_url", sa.String(255)))


def downgrade() -> None:
    with op.batch_alter_table("masters") as batch:
        batch.drop_column("avatar_url")
