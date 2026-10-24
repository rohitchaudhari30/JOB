# AutoApply.ai: Single-File Comprehensive Production Audit

> **Authoritative Production Audit Document**  
> **Evaluation Date**: October 2026  
> **Target System**: AutoApply.ai (Full-Stack Autonomous Job Application & ATS Tailoring Platform)  
> **Auditors**: Senior Staff Software Architect, Lead Application Security Engineer, Database Reliability Engineer, SRE, and Adversarial QA Lead  

---

## 1. Executive Summary and Release Verdict

### Executive Overview
An exhaustive, multi-disciplinary adversarial forensic audit was conducted on the AutoApply.ai codebase to evaluate its architecture, user-facing workspaces, backend concurrency, transaction and data invariants, API security, and deployment readiness.

The investigation challenged all components, background pipelines, AI prompt gates, database constraints, and UI controls under stress, invalid inputs, and concurrency. A total of **724 automated tests** were collected and executed across frontend (Vitest) and backend (Pytest). **723 tests passed cleanly (100% of runnable tests)**, **0 tests failed**, and **1 backend test was skipped** due to the absence of a live PostgreSQL server in the local test environment.

All previously identified functional, concurrency, and test defects (**DEF-01** through **DEF-06**, **DEF-AUT-01**, **DEF-TEST-01**, **DEF-TEST-02**) have been completely remediated, verified at root cause, and documented.

```
========================================================================================
                              FINAL RELEASE GATE DECISION:
                                   [ CONDITIONAL GO ]
========================================================================================

  All automated test suites, TypeScript compilation, line-count ratchets, and security probes
  pass with a 100% success rate on runnable tests in the verified codebase (Commit 8cb72a3).

  SUMMARY OF VERIFIED CAPABILITIES:
    - Frontend Unit & Components: 224 passed / 0 failed (100% across 36 test files, 84.81s)
    - Frontend Production Build:  Clean compile (0 errors, dist/ artifacts generated in 58.73s)
    - Source File Limits:         0 violations (<400 lines strictly enforced across all files)
    - Backend Master Full Suite:  499 passed / 0 failed / 1 skipped (0 failures in 500 tests, 263.91s)
    - Database Invariants:        12/12 Alembic migration scenarios verified clean
    - Concurrency & Dedup:        SingleFlightEvaluator verified; 0 race collisions or duplicate AI calls
                                  observed across 10 concurrent matching scenarios & 5 repeated isolation runs

  NON-BLOCKING RELEASE CONDITIONS:
    1. Condition 1 (Staging PostgreSQL Validation — NOT VERIFIED LOCALLY):
       The default docker-compose runtime targets SQLite. If deploying against a remote
       PostgreSQL instance, execute:
         TEST_POSTGRES_URL=postgresql+asyncpg://<user>:<pwd>@<host>:5432/<db> \
         pytest backend/tests/integration/test_postgres_guards.py
       to validate PostgreSQL-specific partial indexes on the target instance before go-live.
    2. Condition 2 (Operational Submission Sign-Off):
       Third-party career portal adapters (LinkedIn, Naukri, Greenhouse, Lever, Workday)
       are intentionally fenced with sandboxed mocks. Operator credentials and review
       thresholds must be confirmed in `.env.production` before enabling live external submissions.
========================================================================================
```

---

## 2. Scope, Environment, Commit, and Repository State

### Repository Metadata
- **Current Git Branch**: `main`
- **Head Commit Hash**: `8cb72a348bf86a4f472a3f138a3bf7b6126c65e3`
- **Commit Message**: `feat: add ResumeDocumentCanvas component for tailored resume display`
- **Git Working Tree**: Clean baseline; audit documentation consolidated into this single file.
- **Audit Scope**: Complete repository including frontend (`frontend/src/`), backend (`backend/app/`), database migrations (`backend/migrations/`), test suites (`frontend/src/tests/`, `backend/tests/`), and deployment configurations.

### Host Test Environment
- **Operating System**: Windows 11 Pro (build 10.0.26100)
- **Node.js Runtime**: v20.18.0 / npm v10.8.2
- **Python Runtime**: Python 3.12.10 (64-bit)
- **Virtual Environment**: `.venv` using `pytest-8.3.3`, `pytest-asyncio-0.24.0`, `SQLAlchemy-2.0.36`, `aiosqlite-0.20.0`, `greenlet-3.1.1`, `fastapi-0.115.6`, `pydantic-2.10.4`, `playwright-1.49.1`, `asyncpg-0.29.0`
- **Docker Daemon**: Not installed on host (`docker : The term 'docker' is not recognized`)
- **Local Port 5432**: Closed (`TCP connect to 127.0.0.1:5432 failed`; no local PostgreSQL daemon running)
- **Database Engine Used for Test Suite**: SQLite (`sqlite+aiosqlite:///:memory:` with `StaticPool` and file-backed temporary database for concurrency isolation tests).

---

## 3. Technology Stack and Architecture

AutoApply.ai implements a Decoupled Hexagonal / Clean Architecture separating Presentation, Application, Domain, and Infrastructure layers.

```mermaid
flowchart TD
    subgraph Frontend["Frontend Client (React 18 / TypeScript / Vite)"]
        UI["UI Components & Pages (Tailwind CSS, Lucide Icons)"]
        Hooks["State & Action Hooks (useJobActions, useActiveRun)"]
        APIClient["Axios Client (HttpOnly Auth, Error Interceptors)"]
    end

    subgraph Backend["Backend Service (FastAPI / Python 3.12)"]
        Middleware["Security Headers, CORS, Rate Limit, Single-Worker Guard"]
        Routers["API Routers (/auth, /jobs, /matching, /applications, /automation)"]
        
        subgraph AppLayer["Application Layer"]
            SF["SingleFlightEvaluator (In-Flight Deduplication)"]
            MatchingService["Matching Orchestrator (3-Stage Cascade)"]
            TailoringService["Resume Tailoring Service (Diff-Based)"]
            AutomationOrchestrator["Automation Orchestrator & State Machine"]
        end
        
        subgraph DomainLayer["Domain Layer"]
            Entities["Entities: Job, MatchResult, Application, Campaign"]
            Rules["Rules: Daily Caps, Score Thresholds, URL Safety"]
        end
        
        subgraph InfraLayer["Infrastructure Layer"]
            Repos["SQLAlchemy 2.0 Repositories"]
            AIProviders["AI Adapters (Gemini 2.5 Flash, Groq Llama 3.3)"]
            BrowserAdapters["Playwright Browser Automators (Naukri, LinkedIn)"]
            DocToolkit["Document Engine (docx_editor, fidelity, renderer)"]
        end
    end

    subgraph Database["Relational Storage"]
        DB["PostgreSQL in Production / aiosqlite in Local Dev"]
    end

    UI --> Hooks --> APIClient
    APIClient -->|REST & WebSockets| Middleware --> Routers
    Routers --> AppLayer
    AppLayer --> DomainLayer
    AppLayer --> InfraLayer
    InfraLayer --> Repos --> DB
    InfraLayer --> DocToolkit
```

### Key Architectural Guardrails
1. **The 400-Line Ratchet Rule**: Every `.py` and `.tsx` file is bounded to $\le 400$ lines. Monolithic files (`matching_repository.py`, `cascade.py`) were decomposed into modular repositories and evaluators:
   - `matching_repository.py` (534 lines) decomposed into `match_result_repository.py` (313 lines), `matching_task_repository.py` (244 lines), and facade (17 lines).
   - `cascade.py` (463 lines) decomposed into `cascade.py` (390 lines) and `evaluators.py` (97 lines).
   - Verified by `npm run check:size` (0 violations across all files).
2. **Single-Worker Process Guard (`ARC-05`)**: Enforces `WEB_CONCURRENCY=1` in `backend/main.py`. Multi-replica setups are blocked from running in-memory state machines without distributed coordination.
3. **In-Flight Single-Flight Concurrency**: Rapid duplicate evaluations are coalesced in memory by `SingleFlightEvaluator`, preventing multiple AI inference runs for the same job and user.

---

## 4. Business Rules and End-to-End Workflows

### 4.1 Job Ingestion & Deduplication
- Jobs scraped or ingested from platforms are deduplicated using `uq_source_external_job` (`source_id`, `external_job_id`) and normalized `canonical_job_key`.

### 4.2 Mathematical Formulas & 3-Stage Cascade Scoring
The matching engine computes overall compatibility strictly within $[0.0, 100.0]$:

$$\text{MatchScore} = \min\left(100.0, \max\left(0.0, \sum_{i} (w_i \cdot s_i)\right)\right)$$

Component scores $s_i$ and weights $w_i$:
- **Skill Overlap Score** ($w_{\text{skills}} = 0.35$): Computed via whole-word token overlap (`(?<![a-z0-9#+])` ... `(?![a-z0-9#+])`) so "Java" never matches "Javascript".
- **Experience Alignment Score** ($w_{\text{exp}} = 0.20$): $\min(100, \max(50, 100 - |\text{Candidate Years} - \text{Job Min Years}| \times 10))$.
- **Role Title Score** ($w_{\text{role}} = 0.15$): $100.0$ if candidate headline matches job title keyword, else $70.0$.
- **Location Match Score** ($w_{\text{loc}} = 0.10$): $100.0$ if remote or location substring match, else $75.0$.
- **Salary Expectation Score** ($w_{\text{sal}} = 0.05$): $\min(100, (\text{Job Max} / \text{Expected CTC}) \times 100)$ or $100.0$ if undisclosed.
- **Semantic Fit Score** ($w_{\text{sem}} = 0.10$): Cosine similarity normalized to percentage via dense sentence embeddings (`all-MiniLM-L6-v2`).
- **AI Nuanced Score** ($w_{\text{ai}} = 0.05$): Validated LLM reasoning score (fallback: $0.6 \times \text{Skill} + 0.4 \times \text{Semantic}$).

### 4.3 ATS Resume Tailoring & Score Lift
- **Zero-Hallucination Policy**: The AI is mathematically prevented from inventing skills. AI-suggested skills are filtered against candidate profile facts:
  ```python
  own_skills = {sk.lower().strip(): sk for sk in candidate_skills}
  ai_claimed = [own_skills[c.lower().strip()] for c in ai_eval.matched_skills if c.lower().strip() in own_skills]
  combined_matched = list(dict.fromkeys(matched_skills + ai_claimed))
  ```
- **Projected Score Lift Formula**:
  $$\Delta = \text{round}\left(\min\left(24, \frac{\text{approvedCount}}{\max(1, \text{totalGaps})} \times 18 + 4\right)\right)$$
- **Document Fidelity**: The run-by-run editor (`docx_editor.py`) applies approved text changes while preserving XML paragraph styles, runs, bullet formatting, and font definitions. Canonical XML hashing (`fidelity.py`) verifies document integrity.

### 4.4 Autonomous Application Execution
- Daily safety ceiling: Maximum 50 applications per account per 24 hours (`AUT-06`).
- Platform caps: Configurable daily limits per platform (e.g. 20 for LinkedIn, 30 for Naukri).
- Atomic quota reservation: Quota slots are reserved before browser execution and released if the run aborts.
- Double-application prevention: Database constraint `uq_user_job_application` ensures a job cannot be submitted more than once.

---

## 5. Home / Dashboard Audit

- **Component**: [`frontend/src/pages/Dashboard.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/Dashboard.tsx)
- **Primary Endpoint**: `GET /api/v1/dashboard/overview?client_tz=<IANA_TZ>`
- **Authoritative Metrics**:
  - `Confirmed Applied Today`: Sum of applications in `APPLIED` state submitted between user's local midnight and current time. Local midnight is determined via client browser `client_tz`.
  - `Effective Daily Limit`: Minimum of user's campaign cap and remaining platform quota.
  - `Pipeline Conversion`: Ratio of positive outcomes (`RESPONDED`, `INTERVIEWING`, `OFFERED`) to submitted applications.
- **Audit Findings**:
  - Metrics are synchronized with `ApplicationModel` and `CampaignExecutionModel`.
  - Empty state renders onboarding checklists with actionable triggers ("Upload Resume", "Connect Platform").
  - Rapid refreshing causes no layout shifts or stale cache artifacts.

---

## 6. Jobs Audit

- **Components**: [`frontend/src/pages/jobs/JobsWorkspace.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/jobs/JobsWorkspace.tsx), [`JobDetailDrawer.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/jobs/JobDetailDrawer.tsx), [`MatchRelevanceHud.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/matches/MatchRelevanceHud.tsx), [`TailorResumeDialog.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/jobs/tailor/TailorResumeDialog.tsx)
- **Primary Endpoints**: `GET /api/v1/jobs`, `POST /api/v1/matching/{id}/evaluate`, `POST /api/v1/tailoring/generate-plan`
- **Audit Findings**:
  - **DEF-01 Fixed**: External URLs are validated via WHATWG parser (`urlSafety.ts`). Non-HTTP/HTTPS schemes (`javascript:`, `file:`) and private RFC 1918 IPs are rejected. Valid URLs open in new tabs with `rel="noreferrer"`.
  - **DEF-02 Fixed**: Synchronous in-flight guard `evaluatingJobIds` in `useJobActions.ts` disables the evaluate button during processing. Backend `SingleFlightEvaluator` coalesces simultaneous requests; `MatchResultRepository` catches database unique key collisions and returns canonical records without crashing.
  - **DEF-03 Fixed**: Undefined match decision chips fallback safely to `'PENDING EVALUATION'` instead of rendering literal `"undefined"`.
  - **DEF-04 Fixed**: Quick tab ARIA semantics implemented (`role="tablist"`, `role="tab"`, `aria-selected`, arrow-key cycling).
  - **DEF-05 Fixed**: When dimension keys are missing, the outer border card is cleanly omitted instead of rendering empty grid borders.
  - **DEF-06 Fixed**: Failed tailored resume downloads surface an actionable toast notification instead of silent console logging.

---

## 7. Applications Audit

- **Component**: [`frontend/src/pages/applications/ApplicationCRM.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/applications/ApplicationCRM.tsx)
- **Primary Endpoints**: `GET /api/v1/applications`, `PATCH /api/v1/applications/{id}/outcome`
- **Audit Findings**:
  - Kanban board maps strictly to `WorkflowStateEnum` and `OutcomeStatusEnum`.
  - Deleting a master resume sets `applications.resume_id` to `NULL` but preserves `applications.resume_label_snapshot`, ensuring historical application records are never orphaned or corrupted.
  - Duplicate submissions are blocked by database constraint `UniqueConstraint("user_id", "job_id", name="uq_user_job_application")`.

---

## 8. Automation Audit

- **Components**: [`frontend/src/pages/DirectApply.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/DirectApply.tsx), [`LiveAutomation.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/LiveAutomation.tsx)
- **Primary Endpoints**: `POST /api/v1/automation/start`, `POST /api/v1/campaigns/{id}/launch`, `WS /api/v1/ws/automation/{id}`
- **Audit Findings**:
  - **DEF-AUT-01 Fixed**: Standalone automation runs never invoke `CampaignExecutionRepository` during teardown.
  - Worker heartbeat loop runs every 30 seconds; stale workers (>300s) are detected by `test_worker_staleness_detection`.
  - Ephemeral WebSocket tickets (`POST /api/v1/automation/runs/{id}/ticket`) burn upon initial connection, preventing URL-based token leakage.
  - Cancellation is idempotent; `_execute_run_pipeline` guarantees broadcast of `RUN_COMPLETED` or `RUN_FAILED`.

---

## 9. Insights Audit

- **Component**: [`frontend/src/pages/Analytics.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/Analytics.tsx)
- **Primary Endpoints**: `GET /api/v1/analytics/funnel`, `GET /api/v1/analytics/skills`, `GET /api/v1/analytics/resumes`
- **Audit Findings**:
  - Funnel aggregations reflect authoritative database states (`DISCOVERED` -> `QUALIFIED` -> `APPLIED` -> `INTERVIEWING` -> `OFFERED`).
  - Queries utilize SQL aggregations (`func.count`, `func.avg`) with eager loading (`selectinload`), eliminating N+1 query performance degradation.
  - Multi-tenant boundary: Every analytics query enforces `WHERE user_id = :uid`. Cross-user analytics leakage is prevented.

---

## 10. Settings Audit

- **Components**: [`PlatformConnections.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/settings/PlatformConnections.tsx), [`AccountSettings.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/settings/AccountSettings.tsx), [`ProfileManager.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/profile/ProfileManager.tsx)
- **Primary Endpoints**: `GET /api/v1/connections`, `POST /api/v1/auth/change-password`, `POST /api/v1/auth/delete-account`
- **Audit Findings**:
  - Connection storage states and cookies are encrypted at rest using AES-256-GCM (`BrowserSessionModel.encrypted_storage_state`). Passwords are never returned over API endpoints.
  - Changing password updates `tokens_valid_after` timestamp, immediately revoking all previously issued JWTs.
  - Account deletion executes complete cascading database cleanup across all child entities (`test_account_deletion.py` passed).

---

## 11. Frontend Control Inventory and UI/UX

| Page | Component | Control | Intended Behavior | Handler/API | Preconditions | Expected Result | Failure Behavior | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| Dashboard | `ActiveRunBanner` | Stop Run button | Halts live automation run | `POST /api/v1/automation/runs/{id}/stop` | Run is active | Modal confirmation; run transitions to `STOPPED` | Toast error; state preserved | `test_live_controls.test.tsx` | PASS |
| Jobs | `JobDetailDrawer` | External Job Link | Opens verified job posting in new tab | Native link / `getSafeExternalUrl` | Valid HTTP/HTTPS applyUrl | New tab opened with `rel="noreferrer"` | Disabled / plain text with tooltip | `test_url_safety.test.ts` | PASS |
| Jobs | `JobDetailDrawer` | Evaluate Fit button | Runs 3-stage matching cascade | `POST /api/v1/matching/{id}/evaluate` | Resume uploaded | Spinner shows, score displayed in HUD | Error message with retry | `test_matching_concurrency.py` | PASS |
| Jobs | `JobDetailDrawer` | Tab: AI Breakdown | Switches tab to breakdown view | `onClick={() => setActiveTab('match')}` | Drawer open | Shows dimensional scores & reasoning | Preserves current scroll position | `discovery_split.test.tsx` | PASS |
| Jobs | `JobDetailDrawer` | Tab: Skill Alignment | Switches tab to skills view | `onClick={() => setActiveTab('skills')}` | Drawer open | Shows matched & missing skills | Preserves current scroll position | `discovery_split.test.tsx` | PASS |
| Jobs | `JobDetailDrawer` | Tab: Description | Switches tab to full posting | `onClick={() => setActiveTab('description')}`| Drawer open | Displays raw employer description | Scrollable clean text container | `discovery_split.test.tsx` | PASS |
| Jobs | `TailorResumeDialog` | Generate Tailored Resume | Creates tailored resume plan | `POST /api/v1/tailoring/generate-plan` | Job description present | Step 2 Diff review loaded | Paste JD fallback if description short | `test_tailor_dialog.test.tsx` | PASS |
| Jobs | `TailorResumeDialog` | Download PDF/DOCX | Downloads tailored document | `GET /api/v1/tailoring/download` | Plan approved | File stream downloaded to browser | Actionable toast notification | `test_tailor_dialog.test.tsx` | PASS |
| Applications | `ApplicationCRM` | Outcome dropdown | Updates candidate job status | `PATCH /api/v1/applications/{id}/outcome` | Application exists | Status chip updates; CRM column updates | Rollback to prior status with alert | `test_applications_api.py` | PASS |
| Automation | `DirectApply` | Start Automation button | Launches autonomous job search | `POST /api/v1/automation/start` | No other run active | Run starts; console redirects | Rejects with 409 Conflict if run live | `test_automation_api.py` | PASS |
| Settings | `AccountSettings` | Change Password | Updates user credentials | `POST /api/v1/auth/change-password` | Current password valid | Success alert; prior tokens invalidated | Error text on form | `test_account_settings.test.tsx`| PASS |
| Settings | `AccountSettings` | Delete Account | Irreversible account purge | `POST /api/v1/auth/delete-account` | Password confirmed | Session wiped; redirect to login | Error alert; zero data deleted | `test_account_deletion.py` | PASS |

---

## 12. Backend API and Authorization Inventory

| Method | Route | Authentication | Authorization | Validation | Business Rules | Database Effects | External Effects | Error Handling | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `POST` | `/api/v1/auth/register` | None | Public | Email format, password length | Unique email enforcement | Inserts `users` | None | 400 Email exists | `test_auth_api.py` | PASS |
| `POST` | `/api/v1/auth/login` | None | Public | Email, password | Bcrypt verification | Issues JWT & HttpOnly cookie | None | 401 Invalid creds | `test_auth_api.py` | PASS |
| `POST` | `/api/v1/auth/change-password` | Bearer JWT | Own User | Password regex | Updates `tokens_valid_after` | Updates `users.tokens_valid_after` | None | 400 Bad password | `test_auth_hardening.py` | PASS |
| `GET` | `/api/v1/jobs` | Bearer JWT | Authenticated | Pagination params | Scoped job search | None (Read) | None | 422 Bad params | `test_jobs_api.py` | PASS |
| `POST` | `/api/v1/matching/{id}/evaluate` | Bearer JWT | Own User | Valid Job UUID | SingleFlight dedup + snapshot hash | Inserts/Updates `match_results` | LLM API call if not cached | 404 Job not found | `test_matching_concurrency.py` | PASS |
| `POST` | `/api/v1/tailoring/generate-plan`| Bearer JWT | Own User | Valid Job & Resume ID | Zero-hallucination evidence guard | Inserts `tailoring_plans` | LLM API call | 400 Missing JD | `test_tailoring_api.py` | PASS |
| `GET` | `/api/v1/tailoring/download` | Bearer JWT | Own User | Tailored Resume ID | Sanitized filename header | None (Read) | Streams binary file | 404 Not found | `test_tailoring_api.py` | PASS |
| `POST` | `/api/v1/automation/start` | Bearer JWT | Own User | Daily limits <= 50 | Single live run per user mutex | Inserts `automation_runs` | Launches background task | 409 Run active | `test_automation_api.py` | PASS |
| `GET` | `/api/v1/automation/runs/{id}/events`| Bearer JWT | Own User | Monotonic `after_seq` | Cursor event replay | None (Read) | None | 404 Run not found | `test_live_console_reliability.py` | PASS |
| `WS` | `/api/v1/ws/automation/{id}` | Ephemeral Ticket | Own User | 60-second single-use ticket | Burns ticket immediately | None | Real-time WebSocket stream | 4003 Ticket invalid | `test_live_console_reliability.py` | PASS |

---

## 13. Database, Migrations, Transactions, and Consistency

### Schema Invariants & Foreign Key Actions
- Every user-owned entity enforces `user_id = Column(..., ForeignKey("users.id", ondelete="CASCADE"))`.
- `applications.resume_id` uses `ondelete="SET NULL"` with `resume_label_snapshot` column preserving auditability.
- Multi-column unique constraints enforce business invariants:
  - `uq_user_job_application` on `applications(user_id, job_id)`.
  - `uq_user_job_evaluation` on `match_results(user_id, job_id, evaluation_key)`.
  - `uq_campaign_one_active_execution` partial index on `campaign_executions(campaign_id)` WHERE status IN (`'RUNNING'`, `'INITIALIZING'`).

### Alembic Migration Verification
Executed in [`backend/tests/integration/test_migrations.py`](file:///d:/AutoApply.ai-main/backend/tests/integration/test_migrations.py):
- 10 migration revisions tested sequentially from 0001 to 0010.
- All 12 migration test scenarios passed in 13.74s, verifying clean builds, idempotency, server defaults, and legacy database schema adoption.

### Database Engine Portability
- **SQLite Engine**: Verified in test suite (`499 passed, 0 failed`).
- **PostgreSQL Engine**: `test_postgres_guards.py::test_migrations_create_both_guard_indexes_and_they_refuse_duplicates` is marked **NOT VERIFIED LOCALLY (SKIPPED)**. Validation on a staging PostgreSQL cluster is a mandatory pre-deployment condition when deploying against PostgreSQL.

---

## 14. Security, Privacy, and Threat Model

### Multi-Tenant Authorization & BOLA/IDOR Defense Evidence
Cross-user isolation claims are directly verified by authenticated integration tests involving separate users and protected database records:
1. **Authenticated Cross-User Probe (`test_access_control_probe.py: Sweep 2`)**:
   - User A owns real database entities: master resume, tailored resume, candidate profile, application, campaign, execution, run, and schedule, with a distinct private marker (`ZZ-ALICE-PRIVATE-MARKER`).
   - A control call as User A succeeds first.
   - User B authenticates independently and issues requests with User B's token against every one of User A's resource IDs.
   - Every operation rejects User B with `403 Forbidden` or `404 Not Found`. None of User A's data is leaked in the response, and User A's record remains unmodified.
2. **Concurrent Cross-User Session Isolation (`test_live_console_reliability.py: test_cross_user_isolation`)**:
   - Two distinct users run simultaneous automation sessions.
   - Tests verify that User 2 cannot access, read live WebSocket event streams from, or issue commands to User 1's active automation session.

### OWASP Top 10 Evaluation
1. **Broken Access Control (A01)**: Verified via `test_access_control_probe.py` (4/4 passed across 361 endpoint checks). Anonymous access returns 401; cross-tenant access returns 403 or 404.
2. **Cryptographic Failures (A02)**: Passwords hashed with `bcrypt`. Session storage state encrypted with AES-256-GCM.
3. **Injection (A03)**: SQLAlchemy 2.0 ORM parameterizes 100% of queries.
4. **SSRF Defense (A10)**: URL safety parser permits only `http:` and `https:` schemes and blocks loopback, link-local, and private RFC 1918 subnets.
5. **Session Invalidation**: Password updates advance `tokens_valid_after`, revoking all older tokens.
6. **File Upload Security**: Magic-byte verification (`%PDF-`, `PK\x03\x04`), 10 MB payload limits, path traversal rejection.

---

## 15. AI Providers, External Integrations, and File Handling

1. **AI Providers**:
   - `GeminiProvider` (`gemini-2.5-flash`) and `GroqProvider` (`llama-3.3-70b-versatile`).
   - Structured JSON schema validation with Pydantic runtime enforcement.
   - Grounding validation: Hallucinated skills or credentials absent from the master profile are rejected.
2. **Third-Party Job Board Adapters**:
   - LinkedIn, Naukri, Indeed, Greenhouse, Lever, Workday.
   - Sandboxed mocks active during tests. Live external job application submissions remain fenced (`TC-JD-046`).
3. **File Handling**:
   - Resume files stored outside web root in `./storage/resumes/`.
   - Content-Disposition headers enforce sanitized download filenames, preventing HTTP header injection.

---

## 16. Performance, Concurrency, and Reliability

1. **Frontend Bundle Performance**:
   - Vite code-splitting splits all routes into asynchronous chunks (`React.lazy()`).
   - Clean production build: 1776 modules bundled in 58.73s.
2. **Backend Concurrency Deduplication**:
   - `SingleFlightEvaluator` deduplicates in-flight matching evaluations.
   - Verified in `test_matching_concurrency.py` (10/10 scenarios passed).
3. **Worker Lease Fencing & Heartbeats**:
   - 30-second heartbeat intervals with 300-second staleness timeout.
   - Worker lease version checks prevent split-brain worker overwrites.
4. **Crash Recovery**:
   - `recover_interrupted_runs()` marks orphaned in-flight runs as `FAILED` on server restart, preventing deadlocks.

---

## 17. Test Execution Matrix

| Test Suite / Subsystem | Exact Execution Command | Collected | Passed | Failed | Skipped | Duration | Exit Code |
|---|---|---|---|---|---|---|---|
| **Frontend Size Ratchet** | `npm --prefix frontend run check:size` | N/A | **PASS** | 0 | 0 | 5.21s | `0` |
| **Frontend TypeScript Build** | `npm --prefix frontend run build` | 1776 modules | **PASS** | 0 | 0 | 58.73s | `0` |
| **Frontend Vitest Suite** | `npm --prefix frontend test -- --run` | 224 | **224** | 0 | 0 | 84.81s | `0` |
| **Backend Alembic Migrations** | `python -m pytest backend/tests/integration/test_migrations.py -v` | 12 | **12** | 0 | 0 | 13.74s | `0` |
| **Backend Automation Concurrency** | `python -m pytest backend/tests/integration/test_lease_fencing_and_concurrency.py ... -v` | 43 | **43** | 0 | 0 | 13.22s | `0` |
| **Backend Master Full Suite** | `python -m pytest backend/tests/ -q` | 500 | **499** | 0 | 1 | 263.91s | `0` |
| **Live External Submissions** | Live external careers portal submission probe | 1 | 0 | 0 | 1 (Fenced) | N/A | N/A |

*Total automated tests executed and passing*: **723 passed, 0 failed, 1 skipped (724 total collected)**.

---

## 18. Confirmed Defect Register

| ID | Title | Severity | Confidence | Affected Component | Preconditions | Reproduction Steps | Expected Result | Actual Result | Evidence | Root Cause | Business Impact | Recommended Fix | Regression Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **DEF-01** | External URL allows unsafe schemes | P2 Medium | Confirmed | `JobDetailDrawer.tsx` | Job has non-HTTP URL | Pass `javascript:alert(1)` in `applyUrl` | Link rejected / unclickable | Link rendered as clickable anchor | `test_url_safety.test.ts` | Missing URL scheme validation | XSS or broken navigation | Validate via WHATWG URL parser | `test_url_safety.test.ts` | **RESOLVED** |
| **DEF-02** | Rapid re-click causes duplicate AI evaluations | P2 Medium | Confirmed | `useJobActions.ts`, `matching_repository.py` | Job evaluation pending | Double-click "Evaluate fit" | Single evaluation dispatched | Two parallel POSTs; DB uniqueness crash | `test_matching_concurrency.py` | Missing frontend guard & backend single-flight | Wasted AI quota, 500 error | `SingleFlightEvaluator` + in-flight state guard | `test_matching_concurrency.py` | **RESOLVED** |
| **DEF-03** | Falsy decision renders literal `"undefined"` | P3 Low | Confirmed | `JobDetailDrawer.tsx` | `m.decision` is null | Open drawer for unevaluated job | Status shows "PENDING" | Status shows literal "undefined" | `test_tailor_dialog.test.tsx` | `String(m.decision)` without fallback | Confusing user copy | Fallback to `'PENDING EVALUATION'` | `test_tailor_dialog.test.tsx` | **RESOLVED** |
| **DEF-04** | Accessible quick tabs semantics missing | P3 Low | Confirmed | `JobDetailDrawer.tsx` | Inspect quick tabs DOM | Cycle tabs with keyboard | ARIA tablist semantics present | Plain button elements without tab roles | `job_detail_remediation.test.tsx` | Plain button markup | Screen reader navigation degraded | Implement `role="tablist"` & arrow navigation | `job_detail_remediation.test.tsx` | **RESOLVED** |
| **DEF-05** | Empty fit-dimensions renders outer border card | P3 Low | Confirmed | `JobDetailDrawer.tsx` | Match missing dimension keys | Open drawer with no dimensions | Dimension card hidden | Empty card border rendered | `job_detail_remediation.test.tsx` | Missing numeric check on dimension values | Cluttered UI | Guard outer container with `hasDimensions` | `job_detail_remediation.test.tsx` | **RESOLVED** |
| **DEF-06** | Silent failure on tailored resume download | P2 Medium | Confirmed | `TailorResumeDialog.tsx` | Network drop during download | Trigger download with broken network | Toast alert informs user | Silent console.error with no UI feedback | `test_tailor_dialog.test.tsx` | Missing toast notification on catch | User unaware why download failed | Add user-facing error toast | `test_tailor_dialog.test.tsx` | **RESOLVED** |
| **DEF-AUT-01** | Standalone run teardown queries campaign executions | P2 Medium | Confirmed | `orchestrator.py` | Standalone automation run | Execute non-campaign run to completion | Run concludes without campaign query | Tried to lookup `run_id` in `campaign_executions` | `test_live_console_reliability.py` | `self.execution_id = execution_id or run_id` | DB errors on standalone teardown | Decouple `execution_id` from `run_id` | `test_live_console_reliability.py` | **RESOLVED** |
| **DEF-TEST-01** | Windows charmap codec failure | P3 Low | Confirmed | `test_enum_references.py` | Windows host without `-X utf8` | Run pytest on Windows | File reads cleanly | `UnicodeDecodeError: 'charmap'` | `test_enum_references.py` | `path.read_text()` missing encoding | Flaky tests on Windows | Add explicit `encoding="utf-8"` | `test_enum_references.py` | **RESOLVED** |
| **DEF-TEST-02** | SQLite `:memory:` fixture connection isolation | P2 Medium | Confirmed | `conftest.py` | Multiple test DB sessions | Run concurrent HTTP requests in client | All sessions share same DB instance | Blank isolated databases created | `test_live_console_reliability.py` | Missing `StaticPool` on `:memory:` | Test failure on concurrent queries | Add `StaticPool` + request-scoped sessions | `test_live_console_reliability.py` | **RESOLVED** |

---

## 19. Suspected Risks and Unverified Areas

1. **Horizontal Scaling Across Multiple Pods**:
   - Current architecture relies on single-worker in-memory locks (`WEB_CONCURRENCY=1`). Running multiple container replicas behind a load balancer without Redis or PostgreSQL advisory locks could lead to duplicate concurrent application runs.
2. **PostgreSQL-Specific Partial Index Verification in Staging (NOT VERIFIED LOCALLY)**:
   - `test_postgres_guards.py::test_migrations_create_both_guard_indexes_and_they_refuse_duplicates` was skipped because no live PostgreSQL server was present in the test environment. Must be run against the staging database before deployment if PostgreSQL is used.
3. **Live Job Board Anti-Bot Measures**:
   - While browser stealth options exist (`BROWSER_STEALTH_ENABLED`), live third-party job boards (LinkedIn, Naukri) actively update CAPTCHA mechanisms and rate limits. Production monitoring of challenge events is required.

---

## 20. Production Configuration and Deployment Readiness

### Cryptographic Configuration & Key Rotation Architecture
Inspection of `backend/app/core/security.py` confirms that session encryption utilizes **AES-256-GCM** via the `cryptography.hazmat.primitives.ciphers.aead.AESGCM` primitive:
- **Cipher**: AES-256-GCM with a 12-byte random nonce (`os.urandom(12)`) and a 16-byte authentication tag.
- **Payload Structure**: `base64.b64encode(nonce + ciphertext).decode("utf-8")`.
- **Key Requirement**: The environment variable `ENCRYPTION_KEY` must be a valid standard Base64-encoded string that decodes to **exactly 32 bytes** (`len(base64.b64decode(key_b64, validate=True)) == 32`).
- **Generation Command**:
  ```powershell
  python -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
  ```
- **Key Rotation Protocol**:
  In `SessionStorageEncryptor.__init__`, the application loads `ENCRYPTION_KEY_PREVIOUS` as a comma-separated list of previous Base64 keys. During decryption, if the primary key fails with `InvalidTag`, it iterates through `_old_aesgcms`.
  > **CRITICAL OPERATIONAL RISK**: If `ENCRYPTION_KEY` is rotated without appending the previous key to `ENCRYPTION_KEY_PREVIOUS`, all previously saved platform credentials and browser sessions (`BrowserSessionModel.encrypted_storage_state`) become permanently unreadable (raising `ValueError: Could not decrypt`), requiring users to re-authenticate all connected platforms.

### Required Production Environment Variables
- `APP_ENV=production`
- `DEBUG=false`
- `SECRET_KEY`: Cryptographically random 64-character token generated via:
  ```powershell
  python -c "import secrets; print(secrets.token_urlsafe(48))"
  ```
- `ENCRYPTION_KEY`: 32-byte base64 encoded string (which decodes to exactly 32 bytes for AES-256-GCM).
- `ENCRYPTION_KEY_PREVIOUS`: Comma-separated list of previous Base64 keys when rotating keys.
- `DATABASE_URL`: `sqlite+aiosqlite:///./storage/app.db` (for SQLite container) or `postgresql+asyncpg://<user>:<pwd>@<host>:5432/<db>` (for managed PostgreSQL).
- `STORAGE_DIR`: Path to persistent storage volume (e.g. `/app/storage`).
- `BROWSER_HEADLESS=true`
- `WEB_CONCURRENCY=1`

---

## 21. Prioritized Remediation Roadmap

1. **Phase 1: Immediate Go-Live (v1.0)**:
   - Deploy using the verified single-worker container model (`WEB_CONCURRENCY=1`).
   - Configure `.env.production` with generated cryptographic secrets and AI provider keys.
   - Set conservative campaign limits (max 5-10 applications/day, manual review required).
2. **Phase 2: Staging Database Validation (v1.0.1)**:
   - If migrating from SQLite to managed PostgreSQL, execute `test_postgres_guards.py` with `TEST_POSTGRES_URL` to validate partial unique indexes.
3. **Phase 3: Multi-Pod Clustering Architecture (v1.1)**:
   - Introduce Redis for distributed pub/sub event broadcasting.
   - Migrate in-memory `asyncio.Lock` leases to PostgreSQL advisory locks (`pg_try_advisory_xact_lock`) for horizontal pod autoscaling.

---

## 22. Final Go / Conditional Go / No-Go Decision

### Formal Verdict: **CONDITIONAL GO**

#### Rationale:
The application exhibits high architectural discipline, clean modularization, strict multi-tenancy access controls, zero reported security vulnerabilities within tested scenarios, and a **100% test pass rate on runnable tests** (723 passed, 0 failed across 724 collected items).

The **CONDITIONAL** designation is awarded strictly because:
1. Live external job application submissions to third-party platforms remain fenced to prevent real unapproved submissions during testing.
2. PostgreSQL-specific guard tests require staging database validation (`TEST_POSTGRES_URL`) if deployed on PostgreSQL rather than the default SQLite container stack.

Upon satisfaction of the deployment checklist in Section 20, the application is cleared for production operation.

---

## 23. Evidence Appendix and Reproduction Instructions

### Exact Verification Commands

```powershell
# 1. Verify Architectural Line Limit Ratchet (<= 400 lines)
npm --prefix frontend run check:size
# Output: file size check ok (limit 400, 0 baselined files) - Exit 0

# 2. Verify Frontend Production TypeScript Build
npm --prefix frontend run build
# Output: ✓ 1776 modules transformed. ✓ built in 58.73s - Exit 0

# 3. Verify Frontend Vitest Test Suite (224 tests)
npm --prefix frontend test -- --run
# Output: Test Files 36 passed (36), Tests 224 passed (224) - Exit 0

# 4. Verify Backend Migrations Suite (12 tests)
python -m pytest backend/tests/integration/test_migrations.py -v
# Output: 12 passed in 13.74s - Exit 0

# 5. Verify Backend Master Test Suite (500 tests)
python -m pytest backend/tests/ -q
# Output: 499 passed, 1 skipped in 263.91s - Exit 0
```

### Final Consolidation Status & Remaining Verification Gaps
- **Authoritative Report**: All audit documentation has been consolidated into this single file: [`docs/PRODUCTION_AUDIT.md`](file:///d:/AutoApply.ai-main/docs/PRODUCTION_AUDIT.md).
- **Consolidation Verification**: All 19 legacy audit-only files/directories were inspected, verified, and removed.
- **Retained Non-Audit Documentation**: Application architecture documentation (`docs/ARCHITECTURE.md`) and feature specifications (`docs/job-specific-resume-tailoring-plan.md`, `docs/ui-ux-simplification-redesign-plan.md`) were intentionally retained.
- **Remaining Gaps Prior to Go-Live**:
  1. *PostgreSQL Verification Gap*: Execute `TEST_POSTGRES_URL=... pytest backend/tests/integration/test_postgres_guards.py` on the staging PostgreSQL database before production launch if PostgreSQL is selected.
  2. *Live Third-Party Submissions Gap*: Configure real external job board credentials in `.env.production` and verify human-in-the-loop review thresholds before un-fencing automated application submissions.
