"""one active automation run per user (database guard)

The orchestrator keeps one live run per user in memory, so two requests arriving together
could both start one. A partial unique index makes the database refuse the second.

If an existing database already holds two live runs for one user, the index is NOT created:
the migration logs the user ids and leaves the data alone (which run to end is a person's call).
Runs left "live" by a crash are cleared at application start-up (see init_db), so they do not
block anyone.

Revision ID: 0006
Revises: 0005
"""
import logging

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

INDEX_NAME = "uq_automation_run_one_active_per_user"
ACTIVE_WHERE = "status IN ('STARTING','RUNNING','PAUSED')"
log = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    bind = op.get_bind()
    dupes = bind.execute(
        sa.text(
            "SELECT user_id, COUNT(*) FROM automation_runs "
            f"WHERE {ACTIVE_WHERE} GROUP BY user_id HAVING COUNT(*) > 1"
        )
    ).fetchall()
    if dupes:
        log.warning(
            "Skipping %s: users with more than one live run: %s. End the extra runs, then re-create the index.",
            INDEX_NAME,
            [row[0] for row in dupes],
        )
        return
    op.create_index(
        INDEX_NAME,
        "automation_runs",
        ["user_id"],
        unique=True,
        sqlite_where=sa.text(ACTIVE_WHERE),
        postgresql_where=sa.text(ACTIVE_WHERE),
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {INDEX_NAME}")
