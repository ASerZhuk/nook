"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-15
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TENANT_TABLES = ("services", "working_hours", "time_off", "bookings", "clients")


def _id() -> sa.Column:
    return sa.Column("id", sa.String(36), primary_key=True)


def _master_fk() -> sa.Column:
    return sa.Column("master_id", sa.String(36), sa.ForeignKey("masters.id", ondelete="CASCADE"), nullable=False)


def upgrade() -> None:
    op.create_table(
        "masters",
        _id(),
        sa.Column("phone", sa.String(20), nullable=False, unique=True),
        sa.Column("slug", sa.String(40), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("specialty", sa.String(120), nullable=False),
        sa.Column("address", sa.String(255), nullable=False),
        sa.Column("onboarded", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "auth_codes",
        _id(),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "client_accounts",
        _id(),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "services",
        _id(),
        _master_fk(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "working_hours",
        _id(),
        _master_fk(),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
    )
    op.create_table(
        "time_off",
        _id(),
        _master_fk(),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time()),
        sa.Column("end_time", sa.Time()),
        sa.Column("reason", sa.String(255)),
    )
    op.create_table(
        "bookings",
        _id(),
        _master_fk(),
        sa.Column("service_id", sa.String(36), sa.ForeignKey("services.id"), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("client_accounts.id", ondelete="SET NULL")),
        sa.Column("client_name", sa.String(120), nullable=False),
        sa.Column("client_phone", sa.String(20), nullable=False),
        sa.Column("start_at", sa.DateTime(), nullable=False),
        sa.Column("end_at", sa.DateTime(), nullable=False),
        sa.Column("status", sa.Enum("confirmed", "cancelled", name="booking_status", native_enum=False, length=20), nullable=False),
        sa.Column("cancelled_by", sa.String(10)),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "clients",
        _id(),
        _master_fk(),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("master_id", "phone"),
    )
    op.create_table(
        "push_subscriptions",
        _id(),
        sa.Column("owner_type", sa.String(10), nullable=False),
        sa.Column("owner_id", sa.String(36), nullable=False),
        sa.Column("endpoint", sa.String(500), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(200), nullable=False),
        sa.Column("auth", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    for table in TENANT_TABLES:
        op.create_index(f"ix_{table}_master_id", table, ["master_id"])
    op.create_index("ix_auth_codes_phone", "auth_codes", ["phone"])
    op.create_index("ix_bookings_start_at", "bookings", ["start_at"])
    op.create_index("ix_bookings_account_id", "bookings", ["account_id"])
    op.create_index("ix_push_subscriptions_owner_id", "push_subscriptions", ["owner_id"])


def downgrade() -> None:
    op.drop_table("push_subscriptions")
    for table in ("clients", "bookings", "time_off", "working_hours", "services"):
        op.drop_table(table)
    op.drop_table("client_accounts")
    op.drop_table("auth_codes")
    op.drop_table("masters")
