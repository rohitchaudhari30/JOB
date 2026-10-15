"""saved automation schedules

AUT-17: schedules used to live only in memory and vanished on every restart.

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "automation_schedules",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("config_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_automation_schedules_user_id", "automation_schedules", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_automation_schedules_user_id", table_name="automation_schedules")
    op.drop_table("automation_schedules")
