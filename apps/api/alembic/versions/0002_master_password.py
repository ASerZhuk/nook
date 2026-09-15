"""master password login

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("masters") as batch:
        batch.add_column(sa.Column("password_hash", sa.String(255)))


def downgrade() -> None:
    with op.batch_alter_table("masters") as batch:
        batch.drop_column("password_hash")
