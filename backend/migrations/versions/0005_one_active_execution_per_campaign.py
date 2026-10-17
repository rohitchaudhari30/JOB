"""one active execution per campaign (database guard)

IMP-052: the application already checks for an active execution before creating one,
but two concurrent requests could both pass that check. A partial unique index makes
the database refuse the second one.

If an existing database already holds two active executions for the same campaign
(which the guard would have prevented), the index is NOT created: the migration logs
the campaign ids and leaves the data alone, because choosing which execution to
end is a decision for a person. The application-level check keeps working either way.

Revision ID: 0005
Revises: 0004
"""
import logging

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

INDEX_NAME = "uq_campaign_one_active_execution"
ACTIVE_WHERE = (
    "status IN ('INITIALIZING','RUNNING','RECOVERY_PENDING','PAUSED_OTP','PAUSED_CAPTCHA',"
    "'PAUSED_SESSION','PAUSED_LIMIT','PAUSED_USER')"
)
log = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    bind = op.get_bind()
    dupes = bind.execute(
        sa.text(
            "SELECT campaign_id, COUNT(*) FROM campaign_executions "
            f"WHERE {ACTIVE_WHERE} GROUP BY campaign_id HAVING COUNT(*) > 1"
        )
    ).fetchall()
    if dupes:
        log.warning(
            "Skipping %s: campaigns with more than one active execution: %s. "
            "End the extra executions, then re-create the index.",
            INDEX_NAME,
            [row[0] for row in dupes],
        )
        return
    op.create_index(
        INDEX_NAME,
        "campaign_executions",
        ["campaign_id"],
        unique=True,
        sqlite_where=sa.text(ACTIVE_WHERE),
        postgresql_where=sa.text(ACTIVE_WHERE),
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {INDEX_NAME}")
