"""working slots: fixed start times per weekday

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "working_slots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("master_id", sa.String(36), sa.ForeignKey("masters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.UniqueConstraint("master_id", "weekday", "start_time"),
    )
    op.create_index("ix_working_slots_master_id", "working_slots", ["master_id"])


def downgrade() -> None:
    op.drop_table("working_slots")
