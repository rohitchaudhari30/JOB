# 03. API Contracts & Business Rules

## Exhaustive Specification of API Endpoints, Authorization, & Business Logic

This document details the backend REST and WebSocket API contracts, Pydantic runtime validation schemas, server-side authorization boundaries, idempotency rules, and business rule enforcement.

---

### 1. Authentication & Security Middleware

| Endpoint | Method | Auth Level | Purpose | Rate Limit |
|---|---|---|---|---|
| `/api/v1/auth/register` | `POST` | Public | Create new candidate account | 5 / min |
| `/api/v1/auth/login` | `POST` | Public | Authenticate & issue token pair | 5 / min |
| `/api/v1/auth/refresh` | `POST` | Refresh Cookie | Rotate refresh token & issue new access token | 30 / min |
| `/api/v1/auth/logout` | `POST` | Bearer Token | Blacklist token & clear HttpOnly cookies | None |
| `/api/v1/auth/change-password` | `POST` | Bearer Token | Update password & invalidate old JWTs | 5 / min |
| `/api/v1/auth/export-data` | `GET` | Bearer Token | Export GDPR/CCPA user data dump | 2 / hr |
| `/api/v1/auth/delete-account` | `POST` | Bearer Token | Complete cascade erasure of user data | 3 / hr |
| `/api/v1/auth/me` | `GET` | Bearer Token | Current user profile & permissions | None |

#### Security Mechanisms
- **JWT Invalidation Protocol**: In `UserModel`, `tokens_valid_after` records the exact UTC timestamp of the last password change. Any JWT issued with an `iat` (issued-at) timestamp prior to `tokens_valid_after` is rejected with `401 Unauthorized`.
- **HttpOnly Refresh Cookies**: Refresh tokens are stored in HttpOnly, SameSite=Strict cookies with Path scoped to `/api/v1/auth`. They are rotated on every invocation (single-use semantics).
- **Same-Origin CSRF Defense**: Cross-origin requests attempting state-changing mutations must supply matching `Origin` or `Referer` headers.

---

### 2. Job Discovery & Matching Engine

| Endpoint | Method | Key Parameters / Payload | Validation Rules |
|---|---|---|---|
| `/api/v1/jobs` | `GET` | `limit`, `offset`, `search`, `source`, `min_salary` | `limit` <= 100, sanitized search terms |
| `/api/v1/matching/evaluate` | `POST` | `job_id`, `resume_id` (optional), `force_refresh` | Valid UUIDs, single-flight in-memory deduplication |
| `/api/v1/matching/matches` | `GET` | `limit`, `offset`, `min_score`, `location` | Dynamic scoring breakdown, pagination bounds |
| `/api/v1/matching/weights` | `GET`/`PUT`| `skills_weight`, `experience_weight`, etc. | Weights must sum to 1.0 (validated by Pydantic) |

#### Matching Business Invariants
1. **Deterministic + AI Cascade**:
   - Stage 1: Fast deterministic keyword & requirement filtering (experience years, degree, core tech stack).
   - Stage 2: Semantic embedding similarity (Cosine distance on vector embeddings).
   - Stage 3: Deep AI Reasoning (Structured LLM output for nuanced role matching).
2. **Snapshot Hashing**:
   - `MatchResultModel` captures `resume_snapshot_hash` and `profile_snapshot_hash`. If neither the candidate profile nor the resume has changed, subsequent evaluations return the cached result immediately.
3. **Database Uniqueness**:
   - Multi-column unique key (`user_id`, `job_id`, `evaluation_key`) guarantees no duplicate match rows are inserted even under concurrent threads.

---

### 3. Resume Tailoring Engine

| Endpoint | Method | Key Parameters / Payload | Validation Rules |
|---|---|---|---|
| `/api/v1/tailoring/generate-plan` | `POST` | `job_id`, `resume_id` | Enforces evidence grounding; no hallucinated skills |
| `/api/v1/tailoring/apply-edits` | `POST` | `plan_id`, `approved_diffs` | Verifies line locking, page count boundaries |
| `/api/v1/tailoring/preview` | `GET` | `tailored_resume_id` | Renders HTML/PDF preview of tailored resume |
| `/api/v1/tailoring/download` | `GET` | `tailored_resume_id`, `format` (pdf/docx) | Streams sanitized binary with Content-Disposition |

#### Tailoring Safety Rules (Zero Hallucination Mandate)
- **Verified Evidence Grounding**: The AI is forbidden from adding skills or credentials not already present in the candidate's master resume or verified profile facts.
- **Structural Immutability**: Formatting runs, font sizes, contact headers, and page-count bounds are preserved.
- **Audit Logging**: Every tailored suggestion records the exact `before_text`, `after_text`, and source quote.

---

### 4. Automation Orchestration & Safety Fencing

| Endpoint | Method | Key Parameters / Payload | Invariants & Guards |
|---|---|---|---|
| `/api/v1/automation/start` | `POST` | `source_type`, `roles`, `max_applications` | Single-worker mutex; rejects concurrent runs with 409 |
| `/api/v1/automation/runs/{id}` | `GET` | `run_id` | User ownership check (`WHERE user_id = :user_id`) |
| `/api/v1/automation/runs/{id}/events`| `GET` | `run_id`, `after_seq`, `limit` | Monotonic event sequence; zero dropped events |
| `/api/v1/automation/runs/{id}/pause` | `POST` | `run_id` | Safe state transition `RUNNING -> PAUSED` |
| `/api/v1/automation/runs/{id}/resume`| `POST` | `run_id` | Validates lease fencing token before resuming |
| `/api/v1/automation/runs/{id}/stop` | `POST` | `run_id` | Gracefully closes browser session and commits stats |

#### Automation Safety Fencing
1. **Single Active Run Per User (ARC-05)**:
   - Enforced by database partial unique index `uq_campaign_one_active_execution` on `campaign_executions(campaign_id)` WHERE status IN ('RUNNING', 'INITIALIZING') and in-memory `_user_active_runs` dictionary in `Orchestrator`.
2. **Safety Caps (AUT-06)**:
   - Global safe ceiling: Account cannot submit more than 50 applications per 24 hours.
   - Platform cap: Target job board daily limit (e.g. 25 on LinkedIn, 30 on Naukri).
   - Atomic Quota Reservation: Quota slots are reserved *before* launching the application flow and released or consumed based on execution outcome.
3. **Lease Fencing & Zombie Worker Prevention**:
   - Distributed heartbeat timeout: 300 seconds. If a worker process dies, stale lease sweeper marks the run `STALE` and permits recovery without deadlock.
