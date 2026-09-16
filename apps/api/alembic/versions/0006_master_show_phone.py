"""master can hide their phone from the public page

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-16
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("masters") as batch:
        batch.add_column(sa.Column("show_phone", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    with op.batch_alter_table("masters") as batch:
        batch.drop_column("show_phone")
