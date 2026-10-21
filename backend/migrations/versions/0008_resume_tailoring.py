"""Job-specific resume tailoring: tailored_resumes, resume_confirmed_facts, applications.tailored_resume_id

Revision ID: 0008
Revises: 0007
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

_STATUSES = (
    "QUEUED", "ANALYZING", "AWAITING_INPUT", "GENERATE_QUEUED", "GENERATING", "READY_FOR_REVIEW",
    "SAVED", "DISCARDED", "FAILED", "CANCELLED", "STALE",
)
_IN_FLIGHT = "status IN ('QUEUED','ANALYZING','AWAITING_INPUT','GENERATE_QUEUED','GENERATING','READY_FOR_REVIEW')"


def upgrade() -> None:
    op.create_table(
        "tailored_resumes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("master_resume_id", sa.String(36), sa.ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("master_label_snapshot", sa.String(255), nullable=True),
        sa.Column("master_file_hash", sa.String(64), nullable=False),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_description_hash", sa.String(64), nullable=False),
        sa.Column("job_title_snapshot", sa.String(255), nullable=True),
        sa.Column("company_snapshot", sa.String(255), nullable=True),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("mode", sa.String(24), nullable=False),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column("analysis", sa.JSON, nullable=True),
        sa.Column("edit_plan", sa.JSON, nullable=True),
        sa.Column("approved_edit_ids", sa.JSON, nullable=True),
        sa.Column("validation", sa.JSON, nullable=True),
        sa.Column("file_path", sa.String(512), nullable=True),
        sa.Column("pdf_file_path", sa.String(512), nullable=True),
        sa.Column("file_name", sa.String(255), nullable=True),
        sa.Column("file_hash", sa.String(64), nullable=True),
        sa.Column("provider", sa.String(32), nullable=True),
        sa.Column("model_name", sa.String(64), nullable=True),
        sa.Column("prompt_version", sa.String(16), nullable=True),
        sa.Column("error_code", sa.String(48), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("attempt_count", sa.Integer, nullable=False),
        sa.Column("lease_owner", sa.String(64), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("user_id", "master_resume_id", "job_id", "version", name="uq_tailored_version"),
        sa.CheckConstraint("status IN (" + ", ".join(repr(s) for s in _STATUSES) + ")", name="ck_tailored_resumes_status"),
        sa.CheckConstraint("mode IN ('EDIT', 'SUGGESTIONS_ONLY')", name="ck_tailored_resumes_mode"),
    )
    op.create_index("ix_tailored_resumes_user_id", "tailored_resumes", ["user_id"])
    op.create_index("ix_tailored_resumes_master_resume_id", "tailored_resumes", ["master_resume_id"])
    op.create_index("ix_tailored_resumes_job_id", "tailored_resumes", ["job_id"])
    op.create_index("ix_tailored_resumes_status", "tailored_resumes", ["status"])
    op.create_index("ix_tailored_resumes_input_hash", "tailored_resumes", ["input_hash"])
    op.create_index("ix_tailored_user_job", "tailored_resumes", ["user_id", "job_id"])
    op.create_index(
        "uq_tailored_one_in_flight",
        "tailored_resumes",
        ["user_id", "master_resume_id", "job_id"],
        unique=True,
        sqlite_where=sa.text(_IN_FLIGHT),
        postgresql_where=sa.text(_IN_FLIGHT),
    )

    op.create_table(
        "resume_confirmed_facts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("master_resume_id", sa.String(36), sa.ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("term", sa.String(120), nullable=False),
        sa.Column("normalized_term", sa.String(120), nullable=False),
        sa.Column("details", sa.Text, nullable=False),
        sa.Column("source", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "master_resume_id", "normalized_term", name="uq_confirmed_fact_term"),
    )
    op.create_index("ix_resume_confirmed_facts_user_id", "resume_confirmed_facts", ["user_id"])
    op.create_index("ix_resume_confirmed_facts_master_resume_id", "resume_confirmed_facts", ["master_resume_id"])

    with op.batch_alter_table("applications") as batch_op:
        batch_op.add_column(sa.Column("tailored_resume_id", sa.String(36), nullable=True))
        batch_op.create_foreign_key(
            "fk_applications_tailored_resume", "tailored_resumes", ["tailored_resume_id"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    with op.batch_alter_table("applications") as batch_op:
        batch_op.drop_constraint("fk_applications_tailored_resume", type_="foreignkey")
        batch_op.drop_column("tailored_resume_id")
    op.drop_table("resume_confirmed_facts")
    op.drop_table("tailored_resumes")
