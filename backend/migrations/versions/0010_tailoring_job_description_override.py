"""Tailoring: let the user paste the job description when the saved posting has none

Revision ID: 0010
Revises: 0009
"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tailored_resumes") as batch_op:
        batch_op.add_column(sa.Column("job_description_override", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tailored_resumes") as batch_op:
        batch_op.drop_column("job_description_override")
