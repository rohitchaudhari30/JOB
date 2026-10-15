"""application status CHECK constraints and resume label snapshot

DB-04: only valid workflow_state / outcome_status values can be stored.
DB-05: remember the label of the resume used, even if the resume is later deleted
       (applications.resume_id becomes NULL on delete).

The value lists are written out on purpose: a migration must describe the schema
at that moment, not whatever the enums contain later.

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

WORKFLOW_STATES = ('DISCOVERED', 'MATCHING', 'MATCHED', 'SHORTLISTED', 'APPROVAL_REQUIRED', 'APPROVED', 'APPLYING', 'FORM_DETECTED', 'FORM_FILLED', 'QUESTIONS_PENDING', 'READY_TO_SUBMIT', 'SUBMITTING', 'APPLIED', 'PAUSED_OTP', 'PAUSED_CAPTCHA', 'PAUSED_USER_INPUT', 'PAUSED_AUTH_EXPIRED', 'PAUSED_SESSION', 'PAUSED_LIMIT', 'RETRY_QUEUED', 'SUBMISSION_UNKNOWN', 'RECONCILIATION_REQUIRED', 'FAILED', 'SKIPPED', 'REJECTED', 'EXPIRED')
OUTCOME_STATUSES = ('NOT_SUBMITTED', 'UNKNOWN', 'SUBMITTED', 'RESPONDED', 'INTERVIEWING', 'OFFERED', 'REJECTED', 'ARCHIVED')


def upgrade() -> None:
    with op.batch_alter_table("applications") as batch_op:
        batch_op.add_column(sa.Column("resume_label_snapshot", sa.String(length=255), nullable=True))
        batch_op.create_check_constraint(
            "ck_applications_workflow_state", "workflow_state IN (" + ", ".join(repr(v) for v in WORKFLOW_STATES) + ")"
        )
        batch_op.create_check_constraint(
            "ck_applications_outcome_status", "outcome_status IN (" + ", ".join(repr(v) for v in OUTCOME_STATUSES) + ")"
        )
    # Fill the snapshot for applications that already point at a resume.
    op.execute(
        "UPDATE applications SET resume_label_snapshot = "
        "(SELECT label FROM resumes WHERE resumes.id = applications.resume_id) "
        "WHERE resume_id IS NOT NULL"
    )


def downgrade() -> None:
    with op.batch_alter_table("applications") as batch_op:
        batch_op.drop_constraint("ck_applications_outcome_status", type_="check")
        batch_op.drop_constraint("ck_applications_workflow_state", type_="check")
        batch_op.drop_column("resume_label_snapshot")
