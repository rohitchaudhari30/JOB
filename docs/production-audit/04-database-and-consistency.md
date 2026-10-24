# 04. Database Architecture & Data Consistency Audit

## Deep Schema Audit, Constraints, Migrations, and Cross-Workspace Consistency

This document analyzes the relational persistence layer, SQLAlchemy models, migration history, referential integrity constraints, concurrency locks, and metric reconciliations across AutoApply.ai.

---

### 1. Database Invariants and Referential Integrity

```
+-----------------------------------------------------------------------------------------+
|                                    Core Entity Relational Map                           |
|                                                                                         |
|  [users] (id, email, hashed_password, tokens_valid_after)                               |
|     |                                                                                   |
|     +-- 1:N --> [user_sessions] (ondelete="CASCADE")                                    |
|     +-- 1:1 --> [candidate_profiles] (ondelete="CASCADE")                               |
|     |              +-- 1:N --> [candidate_skills] (ondelete="CASCADE")                  |
|     |              +-- 1:N --> [experiences] (ondelete="CASCADE")                       |
|     |              +-- 1:N --> [educations] (ondelete="CASCADE")                        |
|     +-- 1:N --> [resumes] (ondelete="CASCADE")                                          |
|     |              +-- 1:N --> [tailored_resumes] (ondelete="CASCADE")                  |
|     +-- 1:N --> [platform_connections] (ondelete="CASCADE")                             |
|     +-- 1:N --> [campaigns] (ondelete="CASCADE")                                        |
|     |              +-- 1:1 --> [campaign_rules] (ondelete="CASCADE")                    |
|     |              +-- 1:1 --> [campaign_safety_policies] (ondelete="CASCADE")          |
|     |              +-- 1:1 --> [campaign_schedules] (ondelete="CASCADE")                |
|     |              +-- 1:N --> [campaign_executions] (ondelete="CASCADE")               |
|     |                             +-- 1:N --> [campaign_job_items] (ondelete="CASCADE")  |
|     |                             +-- 1:N --> [campaign_activity_logs] (ondelete="CASC")|
|     +-- 1:N --> [match_results] (user_id CASCADE, job_id CASCADE, resume_id SET NULL)   |
|     +-- 1:N --> [applications] (user_id CASCADE, job_id CASCADE, resume_id SET NULL)   |
|                    +-- 1:N --> [application_questions] (ondelete="CASCADE")             |
|                    +-- 1:N --> [application_events] (ondelete="CASCADE")                |
+-----------------------------------------------------------------------------------------+
```

#### Key Invariants Verified in Schema
1. **Resume Deletion Safety**:
   - `applications.resume_id` uses `ondelete="SET NULL"`.
   - `applications.resume_label_snapshot` preserves the historical resume title at application time. Deleting a resume does not break historical application audits or cause orphaned foreign key crashes.
2. **Double-Application Prevention**:
   - `UniqueConstraint("user_id", "job_id", name="uq_user_job_application")` enforces at the database level that a user can never apply to the same job twice, regardless of frontend or race conditions.
3. **One Active Execution Guard**:
   - Partial unique index `uq_campaign_one_active_execution` enforces at most one non-terminal execution (`RUNNING`, `INITIALIZING`) per campaign.
4. **Strict Enum Validation**:
   - `CheckConstraint` on `applications.workflow_state` and `applications.outcome_status` ensures that invalid strings cannot be written directly to the database.

---

### 2. Migration Pipeline & Schema Drift

- **Alembic Version Alignment**: Tested in `backend/tests/integration/test_migrations.py` (12/12 scenarios passed).
  - Clean database creation from zero matches full model metadata.
  - Idempotent migration runs (`upgrade head` twice) succeed without errors.
  - Legacy schema migrations successfully add missing columns (`resume_label_snapshot`, `evaluation_key`, `canonical_job_key`).
  - Server defaults in Alembic revisions match SQLAlchemy model defaults.

---

### 3. Concurrency Engines: SQLite vs PostgreSQL

| Characteristic | SQLite (Dev / CI Test) | PostgreSQL (Target Production) |
|---|---|---|
| **Driver** | `aiosqlite` | `asyncpg` |
| **Concurrency Mode** | File-level database lock (WAL mode) | Row-level MVCC locking |
| **Advisory Locks** | Not supported (in-memory `asyncio.Lock`) | Native `pg_try_advisory_xact_lock` |
| **Vector Search** | JSON array + manual cosine math | `pgvector` / `vector(1536)` indexed |
| **Connection Pooling** | Single shared connection / file pool | Dynamic connection pool (`AsyncEngine`) |
| **Audit Warning** | SQLite under heavy concurrent write tests throws `database is locked` unless retries/backoffs are handled (`matching_task_repository.py`). In-memory SQLite (`:memory:`) requires `StaticPool` to prevent connection isolation issues (see `DEF-TEST-02`). | Fully handles parallel concurrent writes with isolated transactions. |

---

### 4. Cross-Page Data Consistency Analysis

We audited the SQL aggregations and business rules across three separate services:
1. **Dashboard Overview (`DashboardService`)**:
   - Metric: "Confirmed Applied Today".
   - Query: Counts `ApplicationModel` where `user_id = :uid`, `workflow_state = 'APPLIED'`, and `applied_at` is between user's local timezone midnight and midnight.
2. **Analytics Overview (`AnalyticsService`)**:
   - Metric: "Funnel Stage: Submitted".
   - Query: Counts applications where `outcome_status IN ('SUBMITTED', 'RESPONDED', 'INTERVIEWING', 'OFFERED')` or matching `application_events`.
3. **Applications CRM (`ApplicationRepository`)**:
   - Metric: "Applied Column in Kanban".
   - Query: Filters by `workflow_state = 'APPLIED'`.

#### Consistency Verdict
- **Alignment**: When an application is completed, `workflow_state` is set to `'APPLIED'` and `outcome_status` is set to `'SUBMITTED'`. Both Dashboard and CRM update synchronously.
- **Timezone Note**: The Dashboard calculates daily metrics based on the user's localized browser timezone (`client_tz`), whereas Analytics defaults to UTC date ranges unless explicit start/end dates are requested. This is the intended design to ensure local midnight resets for users while maintaining universal UTC historical reporting.
