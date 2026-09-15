"""schedule type (weekly | dates) and per-date schedule

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("masters") as batch:
        batch.add_column(sa.Column("schedule_type", sa.String(10)))
    # у кого уже есть недельный график — тип «постоянный»
    op.execute(
        "UPDATE masters SET schedule_type = 'weekly' "
        "WHERE id IN (SELECT master_id FROM working_hours UNION SELECT master_id FROM working_slots)"
    )
    op.create_table(
        "date_hours",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("master_id", sa.String(36), sa.ForeignKey("masters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
    )
    op.create_index("ix_date_hours_master_id", "date_hours", ["master_id"])
    op.create_table(
        "date_slots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("master_id", sa.String(36), sa.ForeignKey("masters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.UniqueConstraint("master_id", "date", "start_time"),
    )
    op.create_index("ix_date_slots_master_id", "date_slots", ["master_id"])


def downgrade() -> None:
    op.drop_table("date_slots")
    op.drop_table("date_hours")
    with op.batch_alter_table("masters") as batch:
        batch.drop_column("schedule_type")
