"""campaign safety policy timezone

AUT-18: the operating window ("only apply 09:00-18:00") needs to know whose clock it uses.
Existing rows keep behaving as before because they default to UTC.

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("campaign_safety_policies") as batch_op:
        batch_op.add_column(sa.Column("timezone", sa.String(length=64), nullable=False, server_default="UTC"))


def downgrade() -> None:
    with op.batch_alter_table("campaign_safety_policies") as batch_op:
        batch_op.drop_column("timezone")
