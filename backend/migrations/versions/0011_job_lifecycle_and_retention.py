"""Job Lifecycle, Application Job Snapshots, and User-Job States

Revision ID: 0011
Revises: 0010
"""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add lifecycle state and timestamp columns to jobs table
    with op.batch_alter_table("jobs") as batch_op:
        batch_op.add_column(sa.Column("lifecycle_state", sa.String(32), server_default="ACTIVE", nullable=False))
        batch_op.add_column(sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index("ix_jobs_lifecycle_state", ["lifecycle_state"])
        batch_op.create_index("ix_jobs_lifecycle_updated", ["lifecycle_state", "updated_at"])
        batch_op.create_index("ix_jobs_active_last_seen", ["is_active", "last_seen_at"])

    # 2. Add durable frozen job snapshots to applications table
    with op.batch_alter_table("applications") as batch_op:
        batch_op.add_column(sa.Column("job_title_snapshot", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("company_snapshot", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("location_snapshot", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("apply_url_snapshot", sa.Text(), nullable=True))

    # 3. Create user_job_states table for user bookmarks, notes, and dismissals
    op.create_table(
        "user_job_states",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("is_saved", sa.Boolean(), server_default=sa.text("0"), nullable=False, index=True),
        sa.Column("is_dismissed", sa.Boolean(), server_default=sa.text("0"), nullable=False, index=True),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "job_id", name="uq_user_job_state"),
    )
    op.create_index("ix_user_job_state_lookup", "user_job_states", ["user_id", "is_saved", "is_dismissed"])


def downgrade() -> None:
    op.drop_index("ix_user_job_state_lookup", table_name="user_job_states")
    op.drop_table("user_job_states")

    with op.batch_alter_table("applications") as batch_op:
        batch_op.drop_column("apply_url_snapshot")
        batch_op.drop_column("location_snapshot")
        batch_op.drop_column("company_snapshot")
        batch_op.drop_column("job_title_snapshot")

    with op.batch_alter_table("jobs") as batch_op:
        batch_op.drop_index("ix_jobs_active_last_seen")
        batch_op.drop_index("ix_jobs_lifecycle_updated")
        batch_op.drop_index("ix_jobs_lifecycle_state")
        batch_op.drop_column("archived_at")
        batch_op.drop_column("closed_at")
        batch_op.drop_column("last_verified_at")
        batch_op.drop_column("lifecycle_state")
