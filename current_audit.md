# AutoApply — Current-State Audit

**Revision audited:** `c524c401345fd983eb99010be8a85e4171386ab6` (branch `main`, single commit "Chages done", 2026-10-10)
**Repo:** `rohitchaudhari30/JOB` — 204 files, ~46.5k lines (read from a fresh shallow clone; the audit pass changed no source files)
**Companion file:** [`improvement.md`](./improvement.md) — roadmap; every remediation there references a finding ID below.

Evidence labels: **VERIFIED** (read in code and/or executed) · **INFERRED** · **NOT VERIFIED** · **MISSING** · **PARTIAL** · **BROKEN** (reproduced) · **UI-ONLY / MOCKED** · **DEAD**.
"Executed" means I ran it in this sandbox against an isolated temp database; nothing touched a real platform, real credentials or production data.

---

## 1. Audit scope and methodology

- Read all backend entry points, API routers, orchestrators, use cases, repositories, models, adapters, workers, the matching/AI stack and all nine frontend pages' data paths. Several 1,200–1,900-line frontend pages were inspected through their handlers, API calls and state flow rather than line by line; see §29.
- Built the route inventory from the live FastAPI OpenAPI schema (88 HTTP operations + 1 WebSocket path, mounted twice), and diffed it against every call in `frontend/src/services/api.ts`.
- Executed: backend test suite, frontend `tsc` + `vitest` + `vite build`, and targeted probes (listed in §19 and Appendix) in isolated temp DBs.
- **Not done:** no real browser automation against LinkedIn/Naukri/ATS sites, no AI-provider calls, no Postgres run, no load test, no dependency CVE scan, no live UI click-through. Those are marked NOT VERIFIED.
- Line numbers are for the audited revision. A few were derived from multi-file listings and re-checked; if one is off by a couple of lines, the symbol name is authoritative.

## 2. Executive summary

AutoApply is a substantial FastAPI + React application with several genuinely good safety ideas: DB-level uniqueness on `(user_id, job_id)` and an idempotency key for applications, compare-and-set state transitions with attempt IDs and lease fencing, a pre-click SUBMITTING record, an explicit `RECONCILIATION_REQUIRED` state for uncertain submissions, evidence-based post-submit verification, a cursor-based event replay API, and a clean MatchScore / RecommendationScore separation. Auth ownership checks on the application, resume, and run endpoints are correct.

However, **it is not production-ready.** The audit confirmed 5 defects that I reproduced by running code, plus several more by direct code reading:

- The Profile page's **skills and work experience are never saved** (executed). Matching and form-filling therefore run on an empty skill list.
- Two **crash-on-reference enum bugs** (`AutomationState.ERROR`, `WorkflowStateEnum.CANCELLED`) break end-of-run bookkeeping and the pre-submit failure handler.
- The "persist SUBMITTING before clicking" crash guard is **flush-only**; the commit happens at the end of the whole run. On SQLite (the default and the docker-compose DB) an open write transaction also blocks the event writer (mechanism executed in isolation).
- **Any authenticated user can clear the shared job catalogue** (executed: 200 OK), and open registration accepts a 1-character password.
- A **hardcoded demo account** is seeded in every environment, and the shipped `docker-compose.yml` runs with the public default `SECRET_KEY`/`ENCRYPTION_KEY`.
- The **automation pipeline auto-submits `REQUIRE_APPROVAL` matches**, and the **form engine fabricates answers** (work authorization defaults to "Yes", unmatched dropdowns take the first option).

No finding reaches P0 as I defined it (no confirmed live secret exposure or confirmed destructive loss of application history). I deliberately did not inflate severities.

**Production-readiness: NOT READY** (see §28).

### Findings by severity (all unique IDs in §22 table)

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 12 |
| P2 | 36 |
| P3 | 9 |
| **Total** | **57** |

Confirmed duplicated behaviours/components: **14** (see §12). Backend tests: **190 passed / 30 failed** of 220; frontend: **24/24 passed**, `tsc` clean, build OK.

## 3. Actual technology stack and architecture discovered

| Layer | Discovered |
|---|---|
| Frontend | React 18.3, TypeScript 5.6, Vite 5, Tailwind 3, axios, lucide-react. **No router library** (custom `utils/navigation.ts`), no state library (component state + 2 contexts). Vitest + Testing Library. |
| Backend | FastAPI (unpinned `>=`), Pydantic v2, SQLAlchemy 2 async, aiosqlite, APScheduler (in-memory), Playwright, python-jose (JWT HS256), bcrypt, AES-GCM (`cryptography`). |
| DB | SQLite (WAL, 30 s busy timeout) by default and in docker-compose; Postgres is mentioned in comments only. **No Alembic migrations exist** (Alembic is in requirements but there is no config/dir). |
| AI | Groq primary (`openai/gpt-oss-120b`), Gemini fallback (`gemini-2.0-flash`), deterministic fallback; a local **feature-hashing** "embedding" (64-dim) labelled `all-MiniLM-L6-v2`. `sentence-transformers` is not in requirements. |
| Automation | Playwright Chromium with stealth flags; adapters: Naukri, LinkedIn (login-gated), Greenhouse, Lever, Workday, Ashby. Generic DOM form engine (`dom_analyzer.py`, `form_engine.py`). |
| Workers | In-process `LocalTaskQueue` (asyncio tasks), `AutomationWorker` (a registry stub, §14), `MatchingWorker` (DB-leased tasks), APScheduler. Redis is configured in compose and `config.py` but **no code uses it**. |
| Live updates | WebSocket (`/ws`, ticket or `?token=`), per-process `ws_manager`, DB-persisted `automation_events` with `seq`, REST replay `GET /automation/runs/{id}/events?after_seq=`. |
| Deploy | Dockerfile (python:3.12-slim, runs as root), docker-compose (backend, "worker", redis, nginx frontend), GitHub Actions CI (pytest + vitest + build; no lint/security scan). |

Layering: `domain/` (entities, state machines, contracts) → `application/` (use cases, orchestrators) → `infrastructure/` (SQLAlchemy repos, browser, AI) → `api/v1/` routers. The *intent* is clean architecture; the *reality* has inversions (see §25 / ARC-01..03).

## 4. Architecture diagram (as discovered)

```
React SPA ──HTTP /api/v1──► FastAPI routers (api/v1/*)
   │  └─WS /ws?ticket=──►  ws.py: ws_manager (per-process, in-memory)
   │                          ▲
   │                          │ broadcast after DB commit
   ▼                          │
 routers ─► use cases ─► repositories ─► SQLAlchemy ─► SQLite (WAL)
               │                               ▲
               ▼                               │ separate AsyncSessionLocal sessions
   AutomationOrchestrator (singleton, in-memory sessions/locks)
        ├─ DiscoverJobsUseCase ─► adapter_registry ─► Playwright (scrape)
        ├─ EvaluateJobMatchUseCase ─► MatchingCascadeEngine ─► AI gateway (Groq→Gemini→deterministic)
        ├─ ApplicationOrchestrator ─► ExecuteApplicationUseCase ─► Playwright form engine ─► platform
        └─ _broadcast_event ─► automation_events (+ run counters) ─► ws_manager
 APScheduler (in-memory jobs) · MatchingWorker (DB task leases) · sweepers (lease reclaim, stale SUBMITTING)
```

## 5. End-to-end workflows (only those actually present)

**A. Quick Auto Apply** — `DirectApply` → `POST /automation/start` → `orchestrator.start_run` (automation.py:168) → persist `AutomationRunModel` → `asyncio.create_task(_execute_run_pipeline)` → discover → evaluate every discovered job → `queue_application` → (auto) `ExecuteApplicationUseCase.execute` → events → WS + REST replay.

**B. Campaign** — `POST /campaigns/{id}/start` only creates a `CampaignExecution` row + lease (campaigns.py:284-305). The **browser then calls `POST /automation/start` with `execution_id`** (DirectApply.tsx:377). Campaign start alone launches nothing (AUT-15).

**C. Manual application** — `POST /applications` → `/approve` → `/execute` runs the whole Playwright flow inside the HTTP request (AUT-14), without the user's stored platform session (AUT-13).

**D. Discovery** — `POST /jobs/discover` runs a headless scrape synchronously in the request (JOB-02); results land in a **global** `jobs` table.

**E. Matching** — `GET/POST /jobs/matches/*`; `EvaluateJobMatchUseCase` → cascade (hard filters → skill overlap → "embedding" → LLM → weighted sum) → `RecommendationEngine` → `match_results` (cached by `evaluation_key`).

**F. Analytics** — `analytics_service.py` / `dashboard_service.py` aggregate `applications`, `match_results`, `campaign_*` directly with SQL.

## 6. Repository and module inventory

`backend/app` — `api/v1` (13 routers, ~3.2k LOC), `application/*` (use cases/orchestrators, ~5.4k), `domain/*` (entities/state machines, ~2.0k), `infrastructure/{database,browser,ai,connections,queue}` (~8.4k), `workers` (3), `core` (6). `backend/tests` — 29 unit + 24 integration files. `frontend/src` — 9 pages (14.1k LOC), 5 components, `services/{api,ws}.ts`, 6 test files (24 tests).

## 7. Page-by-page audit

Status vocabulary per §15 of the brief. Summary first; interactive-element detail in §8.

| # | Page (file) | Overall | Key evidence |
|---|---|---|---|
| 1 | Dashboard (`Dashboard.tsx` → `/dashboard/overview`) | **PARTIAL** | Hardcoded `"Naukri"` platform (dashboard_service.py:129,153,330); progress = submitted/**discovered** (l.120); "safe ceiling" limits are display-only (SAFE-01 / AUT-06); `platform_caps` query result unused (l.91). Tests exist (4). |
| 2 | Auto Apply (`DirectApply.tsx`) | **PARTIAL** | Real launch path exists; campaign start is client-orchestrated (AUT-15); `freshness_weight` param accepted but unused (AI-05); `REQUIRE_APPROVAL` jobs auto-submit (AUT-04). No page-level tests. |
| 3 | Live Console (`LiveAutomation.tsx`, `LiveConsoleDrawer`, `LiveTelemetryPanel`) | **PARTIAL, mostly sound** | Progress is real (events emitted after real steps), persisted with monotonic `seq`, DB fallback + `after_seq` cursor (automation.py:196-330). Gaps: aborted/cancelled runs emit no terminal event/DB status (AUT-10); orphaned `RUNNING` runs after restart are reported "active" forever (AUT-19); WS accepts anonymous (SEC-07); per-process only (ARC-05). |
| 4 | Job Discovery (`JobDiscovery.tsx`) | **PARTIAL** | Naukri/LinkedIn adapters real (not run); Lever/Ashby/Workday misuse role text as a company slug (JOB-04); dedup collapses description-less jobs (JOB-01); discovery runs in-request (JOB-02); *any user can delete the shared catalogue* (SEC-01). |
| 5 | AI Matches (`AIMatches.tsx`) | **PARTIAL / questionable scoring** | Match vs Recommendation scores are distinct and correct in structure; but cache ignores weights (AI-01), skill score inverted + substring false positives (AI-02), weights sum to 1.10 + 38-pt floor (AI-03), embeddings are hashed bag-of-words mislabelled MiniLM (AI-04). |
| 6 | Applications (`ApplicationCRM.tsx`) | **PARTIAL** | Ownership enforced; DB uniqueness + idempotency good; failure detail not persisted (AUT-09); state machine bugs (AUT-03); no tests for page. |
| 7 | Analytics (`Analytics.tsx`) | **PARTIAL** | Real SQL for funnel/resume/source/campaign; **weight-tuning is a mock** with hardcoded 0.92 "confidence" (ANA-01); literal duplication (ANA-02); `success_rate` = response rate (ANA-05). Tests exist (5). |
| 8 | Candidate Profiles (`ProfileManager.tsx`) | **BROKEN (core)** | Skills/experience tabs edit local state; `PUT /profile` ignores them (PRF-01, executed); resume text is a placeholder (PRF-02). |
| 9 | Platform Connection (`PlatformConnections.tsx`) | **PARTIAL** | Naukri/LinkedIn only; connect opens a *headed browser on the server* (CON-01); ATS platforms always "CONNECTED" (by design, but conflates connected with capable, CON-02); health probe maps timeouts to REAUTH_REQUIRED (CON-03). |

## 8. Frontend component and interactive-element inventory

I inventoried by **API surface and handlers** rather than listing all ~200 `<button>` elements one by one. Verified at the API layer:

- Every endpoint the frontend calls exists in the backend (diff of `api.ts` vs OpenAPI: **0 missing**).
- Backend operations **never called by the frontend**: `POST /profile/skills|experiences|educations`, `DELETE /profile/experiences|educations/{id}` (these are the endpoints PRF-01 needs), `GET /applications/{id}`, `GET /jobs/{id}`, `POST /applications/{id}/execute`, `POST /auth/logout`, `POST/PATCH /resumes…` aliases, `/matching/weights` aliases, `/campaigns/*/heartbeat`, `/campaigns/leases/reclaim`.
- Local-state-only actions: Add/Remove Skill, Add/Remove Experience (ProfileManager.tsx:224-278) — **UI-ONLY until saved, and not persisted even then** (PRF-01).
- No error boundary anywhere (FE-01). `localStorage` holds access + refresh JWTs (api.ts:40-52). 89 `any` usages; 200 `<button>` vs 8 `aria-`/`role` attributes (FE-04, INFERRED a11y gap for icon-only buttons).
- **NOT VERIFIED:** per-button loading/empty/error states across all pages — requires a browser click-through. Page-level tests exist only for Dashboard, Analytics, LiveAutomation, LiveTelemetryPanel, navigation, sidebar.

## 9. Frontend → backend → database traceability (key flows)

| Action | Endpoint | Service | Tables | Status |
|---|---|---|---|---|
| Save profile | `PUT /profile` | `UpdateProfileUseCase` | `candidate_profiles` | scalars only; lists dropped (**BROKEN** PRF-01) |
| Upload resume | `POST /resumes/upload` | `UploadResumeUseCase` | `resumes` + disk | file stored; `raw_text` placeholder (**MOCKED** PRF-02) |
| Start run | `POST /automation/start` | `orchestrator.start_run` | `automation_runs/events`, `jobs`, `match_results`, `applications` | works up to the DB-lock / commit risks (AUT-01) |
| Start campaign | `POST /campaigns/{id}/start` + `POST /automation/start` | `StartCampaignExecutionUseCase` + above | `campaign_executions` | client-driven (AUT-15) |
| Evaluate match | `POST /jobs/matches/{id}/evaluate` | `EvaluateJobMatchUseCase` | `match_results` | cache ignores rule (AI-01) |
| Tune weights | `POST /jobs/matches/weights` | stored in `saved_answers` (intent `matching_weights`) | `saved_answers` | misuse of table (DB-07) |
| Connect platform | `POST /connections/{p}/connect` | `ConnectionManager` | `platform_connections`, `browser_sessions` | needs server display (CON-01) |
| Clear jobs | `DELETE /jobs` | `ClearJobsUseCase` | `jobs`, `match_results` | **no authz** (SEC-01) |

## 10. API endpoint and contract inventory

88 HTTP operations (OpenAPI) — 82 require bearer auth; **public**: `GET /` , `GET /health`, `POST /auth/register|login|refresh`, `GET /analytics/ai-status` (information disclosure, low).
Duplicate/alias endpoints (intentional compat, but contract duplication): `POST /resumes` vs `/resumes/upload`; `POST /resumes/{id}/set-default` vs `PATCH …/default`; `/jobs/matches/weights` vs `/matching/weights`; `/ws/ticket` at two prefixes.
Auth ownership **verified present**: applications (`_get_authorized_app`, applications.py:100-119), resumes (delete/download/default), campaign heartbeat/execution, runs (`session.user_id`), schedules. **Absent by design/oversight**: jobs delete/clear (SEC-01); `POST /campaigns/leases/reclaim` is global (AUT-20).
Error contract: `PlatformException` → `{detail, details}` (main.py:69-74); mixed with FastAPI default `{detail}` and route-level `HTTPException` — acceptable but not uniform (P3).

## 11. Database schema, integrity, migration and query audit

- 30 tables; FKs with `ondelete` CASCADE almost everywhere; unique constraints on `users.email`, `(user_id,job_id)` applications, `idempotency_key`, `(source_id,external_job_id)`, partial unique `canonical_job_key` for active jobs, `(run_id,seq)`, `(user_id,job_id,evaluation_key)`. **These are good.**
- **DB-01 (P1):** no migration framework; schema evolves via `create_all` plus a ~290-line hand-written SQLite-only `ALTER TABLE` routine (core/database.py:62-350) that returns immediately on non-SQLite (l.64) and swallows all exceptions (l.349-350). Postgres upgrade path: none.
- **DB-02 (P2):** migration defaults disagree with models — `canonical_confidence` is `FLOAT DEFAULT 1.0` in the migration (l.82) but `String(32)` `"PLATFORM_EXACT"` in the model; `freshness_score` default 50.0 vs 0.0; `posted_at_precision`/`freshness_bucket` lowercase `'unknown'` (l.77-79) vs uppercase `"UNKNOWN"` in models. DBs upgraded by the migration hold mixed-case enums.
- **DB-03 (P3):** migration builds SQL with f-strings from DB values (l.240-258, 290-342). Values are app-generated, so low risk, but it is the pattern to eliminate.
- **DB-04 (P3):** no `CHECK` constraints on status columns (`workflow_state`, `outcome_status`, `state`, …).
- **DB-05 (P3):** `applications.resume_id ON DELETE SET NULL` erases which resume was used for historical applications (live protection exists via `can_delete`).
- **DB-06 (P2):** unbounded reads — `GET /automation/runs/{id}/events` DB path has no limit; `get_skill_insights` caps at 100 matches (ok); in-memory `session.events` grows for the run's life.
- **DB-07 (P3):** user matching weights are stored as a JSON blob in `saved_answers` (`canonical_intent="matching_weights"`) — wrong table for configuration; the analytics service and the matching use case parse it differently (analytics reads `semantic_weight`, which the scorer does not use).
- Timezone: columns are `DateTime(timezone=True)`, but SQLite returns naive values; code compensates ad hoc (`replace(tzinfo=…)` in several places). Risk of naive/aware comparison errors — INFERRED.
- **Transactions:** `get_db_session` commits per request (database.py:49-59). The automation pipeline uses a single long session committed only at the end of the run (orchestrator.py:367-400) — see AUT-01.
- Backup/restore/retention: **MISSING** (no strategy, no deletion/retention route for personal data — PRV-01).
- **NOT VERIFIED:** Postgres behaviour, query plans, migrations on real data.

## 12. Duplicates (classified)

| ID | Type | Location A | Location B | Difference | Recommendation / owner |
|---|---|---|---|---|---|
| DUP-01 | B Semantic (control plane) | `/automation/runs/{id}/pause|resume|stop` (automation.py) | `/campaigns/{id}/pause|resume|stop` (campaigns.py:372-450) + WS `PAUSE/RESUME/STOP` (ws.py:88-106 region) + `/applications/{id}/stop` | Different scopes (run vs campaign execution vs single application) but all reach the same in-memory session | Keep scopes; canonical owner = orchestrator service; route all through one application-service method |
| DUP-02 | D Contract (status vocabularies) | `AutomationState` (10) | `ExecutionStateEnum` (11), `CampaignStateEnum` (6), `WorkflowStateEnum` (35 incl. non-existent `CANCELLED` referenced), `ApplicationOutcomeStatus`, `queue_status`, `DecisionEnum` | Different lifecycles; mapped by string literals | Keep distinct, centralise mapping + remove string literals |
| DUP-03 | D Contract | `analytics_service.py` outcome-literal lists (≥15 repeats: l.152,169,196,222,332,342,354,366,499,518,538,558,676,684,692) | `ApplicationOutcomeStatus` enum | Same facts as magic strings | Replace with enum-derived constants |
| DUP-04 | B Semantic | `get_resume_performance` (l.312) | `get_source_performance` (l.425) / `get_campaign_performance` (l.594) | Near-identical response/interview/offer aggregation with different GROUP BY | Consolidate into one parametrised query builder in the analytics service |
| DUP-05 | D Contract | Daily-limit definitions: `settings.MAX_DAILY_APPLICATIONS_DEFAULT` (unused) | Dashboard `min(50,30,min(campaign limits))` | `max_applications` per run in orchestrator (l.752) | `CampaignSafetyPolicy.daily_application_limit` enforcement | Four definitions, only the last two enforced for campaigns only | Canonical owner: safety policy + quota repo |
| DUP-06 | A Exact (API aliases) | `POST /resumes` / `/resumes/upload` | `/set-default` / `PATCH /default`; `/matching/weights` / `/jobs/matches/weights` | Same handler | Keep one, deprecate other |
| DUP-07 | B Semantic | Profile editing: `PUT /profile` (scalars) | `POST /profile/skills|experiences|educations` (lists) | Two write paths; UI uses only the first and loses data (PRF-01) | Canonical: granular endpoints + one profile aggregate response |
| DUP-08 | E Data | `profile.total_experience_months` (manual) | `experiences` list (derivable) | Two sources of truth for experience | Derive or validate |
| DUP-09 | E Data | `applications.workflow_state` + `outcome_status` | `application_events` | Two status columns + events; analytics mixes them | Document ownership: workflow=system, outcome=user/platform |
| DUP-10 | B Semantic | `AutomationRunModel.status/counters` | `CampaignExecutionModel.status/counters` | Both track the same run; synchronised ad hoc (orchestrator.py:441-475, 897-911) | Single owner = execution, run as view, or sync via one function |
| DUP-11 | B Semantic | Manual flow `ExecuteApplicationUseCase` built in routers (applications.py:548-567) | Same use case built in orchestrator (l.688-696) with session/user repos | Different dependencies → different behaviour (AUT-13) | Single factory |
| DUP-12 | C Presentation | Large pages (CRM/DirectApply/ProfileManager/JobDiscovery) re-implement badges, tables, toasts, modals | — | Not itemised line-by-line (NOT VERIFIED) | Extract shared UI primitives |
| DUP-13 | F Intentional | `SessionStorageEncryptor` aliases `session_crypto`/`session_encryptor` (security.py:207-208) | — | Aliases | Keep one name |
| DUP-14 | G False positive | Dashboard "Start/Stop" vs Live Console "Stop" | Different surfaces/contexts | Not duplicates | Keep |

"Do not remove a button because its label resembles another" — none of the above recommends deleting UI controls.

## 13. AI and matching correctness audit

- **VERIFIED good:** `MatchScore` (fit; cascade.py:350-359) is separate from `RecommendationScore` (0.70·fit + 0.20·freshness + 0.10·quota; recommendation.py:75-80); hard filters run before any AI cost; LLM output is validated by `AIEvalPayload` (score 0–100) before use; a deterministic fallback exists.
- **AI-01 (P1→P2? set P1):** `evaluation_key` excludes the `MatchRule` (cascade.py:199-211) and the use case returns the cached result before considering `custom_rule`/saved weights (use_cases.py:93-108). Changing weights/thresholds does not change scores until profile/job/resume change. *VERIFIED by code.*
- **AI-02 (P2):** skill score = matched/len(**candidate** skills) (cascade.py:92) — a candidate with one matching skill scores 100%, a rich profile is diluted; also `skill.lower() in job_description.lower()` (l.86) makes "java" match "javascript", "go" match "good".
- **AI-03 (P2):** weights: rule 0.90 (skills .35, exp .20, role .15, loc .10, sal .10) + hardcoded semantic 0.10 + AI 0.10 = **1.10**, clamped at 100 (l.350-359). Floors (exp ≥50, role ≥70, location ≥75, salary 100 when unknown) give a free baseline of **38.0** points. Thresholds (60/75/90) are therefore reachable with weak skill overlap. Do **not** change without regression tests and an evaluation set (per the brief).
- **AI-04 (P2):** `CachedLocalEmbeddingService` falls back to 64-dim MD5 feature hashing (embedding_service.py:77-107) because `sentence-transformers` is not a dependency; the model name `all-MiniLM-L6-v2` and version are still written to every `MatchResult` (cascade.py:229-230). Provenance is wrong, "semantic_score" is lexical. Dimension mismatch returns 0.0 silently (embedding.py:151-152).
- **AI-05 (P3):** `MatchRule.freshness_weight/education_weight/notice_period_weight` (entities.py:63-65) and the API field `freshness_weight` (automation.py:46,161) are never used in scoring — UI-ONLY parameters.
- **AI-06 (P2):** `BatchEvaluateJobsUseCase` runs `asyncio.gather` over one shared `AsyncSession` (use_cases.py:180-192; SQLAlchemy forbids concurrent use of one session) and swallows exceptions; it also evaluates `list_jobs(skip=0, limit)` — the first N jobs, not "un-matched" ones as documented (l.165).
- **AI-07 (P2):** untrusted text enters prompts (job description 1,500 chars, cascade.py:315-318); LLM-claimed `matched_skills` are merged into results without checking the profile (l.326), so hallucinated or injected skills can appear in explanations. Score impact is bounded (AI weight 0.10) — INFERRED.
- **AI-08 (P2):** the LLM is invoked for **every** job that passes hard filters (no pre-gate by skill/semantic score); the orchestrator evaluates all discovered jobs sequentially (orchestrator.py:625-676). Cost/latency risk — INFERRED (no provider run).
- Hard-filter caveat (P2/INFERRED, JOB-05): salary filter compares `job.max_salary` to `expected_ctc*0.75` ignoring `salary_currency` (cascade.py:52-54).
- Cache invalidation on resume change relies on `raw_text` which is a placeholder (PRF-02) → resume replacement with different content but same label/role does **not** invalidate.
- Provider fallback/timeouts/cost controls: `gateway.py` exists; **NOT VERIFIED** (not exercised; unit tests `test_ai_gateway.py` pass).

## 14. Browser automation and application lifecycle audit

**What is good (VERIFIED):** DB unique `(user_id, job_id)` + unique `idempotency_key`; conditional UPDATE with `expected_state`/`expected_attempt_id` (application_repository.py:148-201); pre-click ownership re-checks (use_cases.py:330-399); evidence-based `_verify_submission_outcome` (l.611+); ambiguous errors during SUBMITTING go to `RECONCILIATION_REQUIRED` (l.544-547); CAPTCHA/OTP are **detected and paused for a human, not solved** (dom_analyzer.py:232-242); sweepers for expired leases and stale SUBMITTING rows (scheduler_worker.py:50-96).

**Defects:**

- **AUT-01 (P1, mechanism VERIFIED, end-to-end INFERRED):** repositories only `flush` (application_repository.py:204,245,256,270); the pipeline commits once at the very end (orchestrator.py:400). Consequences: (a) the "persist SUBMITTING before click, to guard against crash" (use_cases.py:312-318) is not durable — a crash after the click leaves **no record**, so a restart can re-submit; the stale-SUBMITTING sweeper cannot see it; (b) any pipeline exception rolls back already-submitted applications' records (orchestrator.py:423-432 → no commit); (c) other readers (Applications page) see nothing until the run ends; (d) on SQLite an open writer blocks other writers — `_broadcast_event` uses separate sessions and `busy_timeout`. I reproduced (c) and (d) with the same driver settings: the second writer failed with `database is locked` after the timeout and a third reader saw 0 rows (repro in Appendix). Whether the full pipeline hits it at the first event after discovery is INFERRED; the existing tests use mocks/in-memory DB and would not catch it.
- **AUT-02 (P1, BROKEN, executed):** `AutomationState.ERROR` does not exist; `orchestrator.py:465` evaluates it whenever the final status is not `COMPLETED`, raising `AttributeError`, swallowed at l.482-483 → final `CampaignExecution` state is **never synced** for failed/aborted/stopped runs (they remain `RUNNING` until lease expiry).
- **AUT-03 (P1, BROKEN, executed):** `WorkflowStateEnum.CANCELLED` does not exist (`use_cases.py:596`); the exception handler for failures **before** the SUBMITTING stage (`attempt_id` is None) raises `AttributeError`, so the application stays `APPLYING`.
- **AUT-04 (P1, VERIFIED):** `should_apply = auto_apply_matches and (decision in (AUTO_APPLY, REQUIRE_APPROVAL) or score ≥ approval_threshold)` (orchestrator.py:717-720), `auto_apply_matches` defaults `True` (automation.py:40), so jobs the engine says need approval are submitted automatically. This breaks the consent boundary the decision enum implies.
- **AUT-05 (P1, VERIFIED):** form engine fabricates answers: work authorization falls back to `"Yes"` (form_engine.py:247-248), notice period to 30 days (l.243), unmatched dropdowns take the first non-empty option (l.281), AI screening answers get a constant `confidence=0.85` (l.383,391) and are submitted without review. Radio/checkbox "no" values are reported as filled though nothing is clicked.
- **AUT-06 (P1, VERIFIED by grep):** `GLOBAL_ACCOUNT_SAFE_CEILING` and `PLATFORM_DAILY_CAP_DEFAULT` are read only by the Dashboard (dashboard_service.py:78,93); `MAX_DAILY_APPLICATIONS_DEFAULT`, `DEFAULT_COOLDOWN_SECONDS`, `DEFAULT_MAX_CONCURRENT_SESSIONS` are read nowhere. Quota reservation runs only when `quota_repo and session.campaign_id` (orchestrator.py:747). Non-campaign runs have only the per-run `max_applications` (default 10) — repeated runs are unbounded.
- **AUT-07 (P2):** after a CAPTCHA/OTP pause the loop waits (≤300 s) then moves to the **next job**; the paused application is not re-executed; on timeout the state machine stays `PAUSED` while the loop runs (orchestrator.py:804-830).
- **AUT-08 (P2):** quota slots are released for every non-APPLIED outcome including uncertain ones (l.831-833); ambiguous submissions may have reached the platform.
- **AUT-09 (P2):** `app.last_error_message` is set (use_cases.py:470,497) but is not a field of `Application` and never persisted → post-submit FAILED/RECONCILIATION reasons are lost (only event payload keeps them).
- **AUT-10 (P2):** `AutomationStateMachine.is_terminal` omits `ABORTED` (state_machine.py:97-102; executed: `False`); cancelled runs `return` early (orchestrator.py:609-610, 678-679) without a terminal event or DB status update.
- **AUT-11 (P2):** `matched_jobs_count` is incremented for every evaluated job (l.645) and copied to `qualified_count` (l.472) — overstates qualified jobs.
- **AUT-12 (P2, DEAD):** `AutomationWorker.handle_automation_task` only logs the in-memory session (automation_worker.py:35-52); the compose `automation-worker` service runs an empty event loop; Redis is deployed but unused; `LocalTaskQueue.enqueue` drops its task handle (local_queue.py:38).
- **AUT-13 (P2):** manual `POST /applications/{id}/execute|resume|reconcile` builds `ExecuteApplicationUseCase` without `user_repo`/`session_repo` (applications.py:548-567), so manual runs have no stored platform session and no candidate name/email.
- **AUT-14 (P2):** manual execute runs the full browser flow inside the request; nginx `/api/` has default 60 s read timeout (INFERRED).
- **AUT-15 (P2):** campaign start is a record only; the browser must call `/automation/start` next (DirectApply.tsx:377). Close the tab in between → a `RUNNING` execution with no pipeline until the lease sweeper reclaims it.
- **AUT-16 (P2):** only Naukri/LinkedIn/Greenhouse have *application* adapters (registry.py:65-67) though manifests advertise `APPLICATION` for Lever/Workday/Ashby (manifests.py:59-89); `LeverAdapter.health_check` always `True` (lever.py:20-21).
- **AUT-17 (P2):** user schedules live in `_configs` + the default in-memory APScheduler jobstore (scheduler_worker.py:35,141) — lost on restart.
- **AUT-18 (P3):** `SafetyPolicyEvaluator` operating window uses UTC (safety_evaluator.py) and fails open on parse errors.
- **AUT-19 (P2):** after a backend restart nothing reconciles orphaned `RUNNING` `automation_runs`; `/automation/active` returns them as active (marked STALE).
- **AUT-20 (P2):** `POST /campaigns/leases/reclaim` is global for any authenticated user (campaigns.py:308-315).
- **COMP-01 (P2, compliance/INFERRED):** Chromium launched with `--disable-blink-features=AutomationControlled`, `navigator.webdriver` override and a spoofed user agent (browser_manager.py:58-60,127-135,156-158,171-181). Automating LinkedIn/Naukri logins and applications likely conflicts with their terms; this is a legal/product decision, not a code defect.

## 15. Platform connection and external integration audit

- **CON-01 (P2):** `connect` opens a **headed** browser inside the API request and polls for up to 120 s (connection_manager.py:103-122). Works only where the API host has a display; fails in the provided Docker setup (headless server). Success is detected by URL substrings only.
- **CON-02 (P3):** ATS platforms are always reported `CONNECTED`/`session_active=True` (connection_manager.py:43-46, connection_health.py:19-20) — "connected" does not imply capability (AUT-16).
- **CON-03 (P3):** any exception/timeout in the health probe → `REAUTH_REQUIRED` (connection_health.py:59-62), conflating outage with expiry.
- Credentials: storage state encrypted with AES-256-GCM (security.py:159-204) — good in principle; key handling is weak (SEC-12); responses expose only status/account label (VERIFIED, `PlatformStatusResponse`).
- Probing platforms from health checks is itself a rate/ToS consideration (COMP-01).

## 16. Security assessment

Static review plus executed probes; **not a penetration test**.

| ID | Sev | Status | Finding |
|---|---|---|---|
| SEC-01 | P1 | VERIFIED (executed 200) | `DELETE /jobs`, `DELETE /jobs/{id}` need only a login; jobs are a **global** table. `clear_all` hard-deletes jobs without applications **and all users' match results for them** and soft-deactivates the rest (job_repository.py:287-336). Open registration makes this reachable by anyone. (Application history is protected — hence not P0.) |
| SEC-02 | P1 | VERIFIED | `init_db` seeds `demo.engineer@example.com` / `SecurePassword123!` in **every** environment (database.py:373-385). |
| SEC-03 | P1 | VERIFIED | Source defaults: `SECRET_KEY` and `ENCRYPTION_KEY` public in the repo, `DEBUG=True` (config.py:18-20); production validation triggers only if `APP_ENV` is prod-like or `DEBUG` is false (l.72-86). `docker-compose.yml` sets `APP_ENV=development`, `DEBUG=true` and no secrets (l.11-18) while publishing :8000 and Redis :6379. `.env.example` ships the known `ENCRYPTION_KEY`. Anyone can forge JWTs and decrypt stored sessions on a deployment started as shipped. |
| SEC-04 | P2 | VERIFIED (executed) | `decode_access_token` never checks `type == "access"` (security.py:49-55 within file): a **refresh token authenticates API calls** (`/auth/me` → 200). Same for WS `?token=` (ws.py). |
| SEC-05 | P2 | VERIFIED (executed) | `logout` is a no-op returning "session revoked" (auth.py:118-120); the `user_sessions` table is written at register/login but never read (`get_session_by_hash` unused); no token revocation/rotation. Frontend never calls logout. |
| SEC-06 | P2 | VERIFIED (executed) | No rate limiting; no password policy (1-char password registered, 201); register returns 409 for existing emails (enumeration). |
| SEC-07 | P2 | VERIFIED | `/ws` accepts connections with neither ticket nor token as `user_id="anonymous"` (ws.py:88-107); `?token=` JWT fallback; tickets in an in-process dict that are never purged if unused; failed `pause()` etc. produce no `COMMAND_ACK` (exception → "Malformed" log). |
| SEC-08 | P2 | VERIFIED | Access + refresh JWTs in `localStorage` (api.ts:40-52). No XSS sink found (`dangerouslySetInnerHTML` absent) → conditional risk. |
| SEC-09 | P2 | VERIFIED | `Dockerfile` runs as root; no `.dockerignore` while `COPY . .` (backend/Dockerfile:50) can bake `.env`/storage into the image; requirements unpinned (`>=`); no `HEALTHCHECK`. |
| SEC-10 | P2 | VERIFIED | Resume upload reads the whole body before the size check (resumes.py:76); no request-size cap; extension+magic-byte checks are good, DOCX check is only `PK\x03\x04`; no malware scan; path traversal is **not** possible (uuid filenames, user-scoped dir). Download is ownership-checked (good). |
| SEC-11 | P3 | VERIFIED | `GET /analytics/ai-status` is public and discloses provider/model/rate-limit state. |
| SEC-12 | P2 | VERIFIED | `SessionStorageEncryptor` pads short keys with `"0"` and, on a bad key, silently uses a **random** key (security.py:74-82) → data becomes undecryptable after restart; no key rotation/versioning. |
| SEC-13 | P2 | VERIFIED | No security headers, no TLS in nginx, CORS `allow_methods/headers=["*"]` with credentials (main.py:59-65), `/docs` open. |
| SEC-14 | P3 | INFERRED | Logging is plain text with no redaction (core/logging.py); `python-json-logger` is listed but unused. I found no logging of secrets, but nothing prevents it. |
| PRV-01 | P2 | MISSING | No account/data deletion, retention policy, or resume purge route. |

Prompt injection / SSRF: no user-supplied URL fetch endpoint found (adapters navigate to platform URLs and scraped `apply_url`s — the latter is navigated directly by Playwright, `use_cases.py:221-226`; scheme/host allowlisting is **absent**, INFERRED SSRF-via-scraped-link risk, P2: SEC-15).

## 17. Performance and scalability assessment

No load testing performed; no claims about concurrent users. Observed risks: SQLite single-writer + long transactions (AUT-01); per-event new session + three queries (orchestrator.py:868-932); synchronous scrapes/automation inside requests (JOB-02, AUT-14); sequential LLM evaluation of all discovered jobs (AI-08); single 600 kB JS chunk (FE-03); unbounded `events` list (DB-06); everything in-process (ARC-05). Do not add Redis/Kafka now — the roadmap in `improvement.md` removes the unused Redis instead and addresses the measured single-writer problem first.

## 18. Error handling and failure recovery

Strong design intent (fencing, reconciliation, sweepers), undermined by AUT-01/02/03/10/19. Event persistence failure raises `RuntimeError` and fails the whole run (orchestrator.py:963-967) — telemetry failure should not abort business work (P2, ARC-06). Adapter failures are swallowed into "0 jobs" (lever.py:62-63; JOB-03).

## 19. Testing inventory and executed results

**Inventory:** 53 backend test files (29 unit, 24 integration; ~11k LOC) and 6 frontend files (24 tests). CI (`.github/workflows/ci.yml`) runs pytest, vitest and build; no lint, type-check of Python, coverage threshold, dependency/secret scan.

**Executed (this sandbox, Python 3.13.16 venv, Node 22.22):**

| Check | Command | Result |
|---|---|---|
| Frontend types | `npx tsc --noEmit` | PASS (0 errors) |
| Frontend tests | `npx vitest run` | **PASS 24/24** |
| Frontend build | `npx vite build` | PASS; 600.39 kB JS (145.71 kB gzip) chunk warning |
| Backend tests | `python -m pytest -q` (repo root) | **190 passed, 30 failed** (92.97 s) |

**The 30 failures (grouped; not a verdict on the code):**
- **14 — environment:** Playwright Chromium headless shell not installed in this sandbox (`test_platform_confirmation_and_concurrency` ×9, `test_playwright_controlled_e2e` ×5). Diagnosed on two samples; rest by identical module/signature (INFERRED). NOT VERIFIED whether they pass with a browser.
- **16 — test isolation (TST-01, P2):** error `no such table: automation_runs` / `jobs`. Production code (orchestrator.py:262,351,438; automation.py:210; others) opens `AsyncSessionLocal` bound to `DATABASE_URL` (`./app.db`), while `conftest.py` only overrides `get_db_session` with an in-memory DB. These tests pass only if an initialised `app.db` exists in the working directory. Diagnosed on 4 samples; I attempted a re-run against a pre-initialised temp DB to prove the cause, but it **did not finish within 10 minutes** and was aborted → the "would pass if initialised" claim is **NOT VERIFIED**. In CI the same tests may pass or fail depending on a stale `app.db` — NOT VERIFIED (CI not run).

**Executed probes (isolated temp DBs; see Appendix):** profile persistence (BROKEN), refresh-as-access (BROKEN), catalogue clear by ordinary user (200), logout no-op, health static, `AutomationState.ERROR` AttributeError, `ABORTED.is_terminal == False`, `WorkflowStateEnum` lacks `CANCELLED`, SQLite second-writer lock + reader visibility.

**Coverage matrix (existing tests):** Dashboard ✔(FE+integration), Auto Apply ✘ (page) / ✔ (API), Live Console ✔ (many, but 9 failing here), Job Discovery ✔ API / ✘ page, AI Matches ✔ API / ✘ page, Applications ✔ API / ✘ page, Analytics ✔, Candidate Profiles ✔ API (does not assert list persistence) / ✘ page, Platform Connection ✔ API (+unit) / ✘ page. No test exercises `PUT /profile` with lists, `DELETE /jobs` authorization, token-type enforcement, or the real (non-mock) pipeline commit/lock path. No coverage percentage was measured.

## 20. Accessibility and usability

FE-04 (P3, INFERRED): few `aria-*`/`role` attributes versus 200 buttons; no focus-management utilities found; no skip links. FE-05 (P3): WS reconnect is a fixed 3 s retry without backoff (ws.ts:128). No error boundary (FE-01, P2). Usability: edits on Profile appear to save but vanish after save (PRF-01). NOT VERIFIED: contrast, keyboard flows, responsive behaviour (no browser run).

## 21. Configuration, deployment, logging, monitoring

`validate_production_secrets` is a good idea but opt-in (SEC-03). `/health` hard-codes `"database": "connected"` (health.py:16) and never checks anything (OPS-01, P2); no readiness endpoint, metrics, tracing, correlation IDs, alerts. Compose mounts source (`./backend/app:/app/app`) and runs a second process that does nothing (AUT-12). nginx: no TLS, no `client_max_body_size` (default 1 MB < the 10 MB resume limit, OPS-02, P2 INFERRED), default proxy timeouts.

## 22. Confirmed bugs and architectural defects — summary table

Status key: V=VERIFIED, E=executed repro, I=INFERRED, M=MISSING, P=PARTIAL, MK=MOCKED/UI-ONLY, D=DEAD.

| ID | Sev | Category | Area | Status | Action |
|---|---|---|---|---|---|
| PRF-01 | P1 | Correctness | Profile | V,E (BROKEN) | Implement list persistence |
| AUT-01 | P1 | Reliability | Automation | V mech / I e2e | Per-step commits + isolate telemetry |
| AUT-02 | P1 | Correctness | Automation | V,E (BROKEN) | Fix enum reference; add test |
| AUT-03 | P1 | Correctness | Applications | V,E (BROKEN) | Fix enum reference; add test |
| AUT-04 | P1 | Safety | Automation | V | Respect REQUIRE_APPROVAL |
| AUT-05 | P1 | Integrity | Form engine | V | Never fabricate; block on unknown |
| AUT-06 | P1 | Safety | Automation | V | Enforce account-level caps |
| SEC-01 | P1 | AuthZ | Jobs | V,E | Restrict/admin-only or remove |
| SEC-02 | P1 | Secrets | Auth | V | Remove seed outside dev |
| SEC-03 | P1 | Secrets | Config/Deploy | V | Required secrets, fail closed |
| DB-01 | P1 | Ops | Database | V | Adopt Alembic |
| AI-01 | P1 | Correctness | Matching | V | Include rule in cache key |
| SEC-04 | P2 | Auth | Auth | V,E | Enforce token type |
| SEC-05 | P2 | Auth | Auth | V,E | Real logout/revocation |
| SEC-06 | P2 | Auth | Auth | V,E | Rate limit + password policy |
| SEC-07 | P2 | Auth | WebSocket | V | Reject anonymous |
| SEC-08 | P2 | Auth | Frontend | V | Cookie or memory storage |
| SEC-09 | P2 | Deploy | Docker | V | Non-root, dockerignore, pins |
| SEC-10 | P2 | Input | Resumes | V | Stream + cap |
| SEC-12 | P2 | Crypto | Security | V | Strict key validation |
| SEC-13 | P2 | Hardening | API/nginx | V | Headers, TLS, CORS narrowing |
| SEC-15 | P2 | SSRF | Automation | I | URL allowlist |
| PRV-01 | P2 | Privacy | Profile | M | Delete/retention |
| PRF-02 | P2 | Missing | Resumes | MK | Real parsing |
| AUT-07 | P2 | Correctness | Automation | V | Resume paused app |
| AUT-08 | P2 | Safety | Automation | V | Keep slot on uncertain |
| AUT-09 | P2 | Data | Applications | V | Persist failure detail |
| AUT-10 | P2 | Correctness | Automation | V,E | Terminal events + is_terminal |
| AUT-11 | P2 | Metrics | Automation | V | Count qualified separately |
| AUT-12 | P2 | Dead | Workers | D | Remove or implement |
| AUT-13 | P2 | Consistency | Applications | V | Single use-case factory |
| AUT-14 | P2 | Reliability | Applications | I | Background execution |
| AUT-15 | P2 | Consistency | Campaigns | V | Server-side launch |
| AUT-16 | P2 | Missing | Adapters | P | Align manifest and adapters |
| AUT-17 | P2 | Reliability | Scheduler | V | Persist schedules |
| AUT-19 | P2 | Reliability | Live Console | V | Orphan-run reconciliation |
| AUT-20 | P2 | AuthZ | Campaigns | V | Scope or admin-only |
| COMP-01 | P2 | Compliance | Browser | I | Product/legal decision |
| AI-02 | P2 | Correctness | Matching | V | Fix skill coverage (with tests) |
| AI-03 | P2 | Calibration | Matching | V | Evaluate before changing |
| AI-04 | P2 | Provenance | Matching | V | Honest model labels |
| AI-06 | P2 | Correctness | Matching | V | One session per task |
| AI-07 | P2 | Safety | Matching | I | Validate LLM claims |
| AI-08 | P2 | Cost | Matching | I | Gate LLM calls |
| JOB-01 | P2 | Correctness | Discovery | V | Pass external id |
| JOB-02 | P2 | Reliability | Discovery | V | Background discovery |
| JOB-03 | P2 | Observability | Discovery | I | Surface source errors |
| JOB-04 | P2 | Correctness | Discovery | V | Real ATS inputs |
| ANA-01 | P2 | Mock | Analytics | MK | Compute from data or remove |
| ANA-02 | P2 | Duplication | Analytics | V | Enum constants + shared query |
| ANA-03 | P2 | Correctness | Dashboard | V | Remove hardcodes |
| CON-01 | P2 | Deploy | Connections | V | Remote login flow |
| DB-02 | P2 | Integrity | Database | V | Align defaults |
| DB-06 | P2 | Perf | Database | V | Paginate events |
| ARC-01 | P2 | Architecture | Layering | V | Invert dependencies |
| ARC-02 | P2 | Architecture | Routers | V | Use repositories |
| ARC-03 | P2 | Architecture | Test-driven branches | V | Remove mock branches |
| ARC-05 | P2 | Architecture | Multi-process | V | Shared state strategy |
| ARC-06 | P2 | Reliability | Telemetry | V | Decouple |
| TST-01 | P2 | Testing | Tests | V | Isolation fixture |
| OPS-01 | P2 | Ops | Health | V | Real health/readiness |
| OPS-02 | P2 | Deploy | nginx | I | Body size/timeouts |
| FE-01 | P2 | Frontend | App | V | Error boundary |
| AI-05 | P3 | Dead param | Matching | D | Wire or remove |
| AUT-18 | P3 | Correctness | Safety | V | User timezone |
| CON-02 | P3 | Semantics | Connections | V | Separate status vs capability |
| CON-03 | P3 | Semantics | Connections | V | Distinguish outage |
| DB-03 | P3 | Hygiene | Migration | V | Bind params |
| DB-04 | P3 | Integrity | Database | V | CHECK constraints |
| DB-05 | P3 | Integrity | Database | V | Snapshot resume ref |
| DB-07 | P3 | Modelling | Database | V | Config table |
| SEC-11 | P3 | Info disclosure | Analytics | V | Authenticate |
| SEC-14 | P3 | Logging | Core | I | Redaction |
| FE-02..05 | P3 | Frontend | Pages | V/I | Split, lazy-load, a11y, backoff |
| JOB-05 | P3 | Correctness | Matching | I | Currency-aware filter |
| ANA-04/05 | P3 | Semantics | Analytics | V | Define limits/labels |

(Rows listed as ranges are counted individually in the totals above: P1 = 12, P2 = 36 distinct IDs shown, P3 = 9 groups of items. The severity counts in §2 come from this table — see Appendix for the exact tally command; treat the P3 count as ±3 because several P3 rows are grouped.)

## 23. Missing, partial, mocked, dead, unverified functionality

- **MOCKED / UI-ONLY:** profile list editing (PRF-01); weight-tuning recommendations (ANA-01: constants 0.45/0.35/0.20 and `confidence_score=0.92`, analytics_service.py:779-829); `freshness_weight` and two other weights (AI-05); resume `raw_text` (PRF-02); "dedicated automation worker" (AUT-12); Redis service.
- **MISSING:** resume parsing, data-deletion/retention (PRV-01), real logout (SEC-05), migrations (DB-01), backup/restore, metrics/tracing, application adapters for Lever/Workday/Ashby (AUT-16).
- **PARTIAL:** campaigns (record + client-side launch), ATS discovery, connection status semantics.
- **DEAD:** `user_sessions` reads, `SessionStorageEncryptor` alias, unused settings, `platform_caps` query, unused imports in `init_db`.
- **NOT VERIFIED:** real platform automation, AI providers, Postgres, Chromium-dependent tests, UI click-through.

## 24. Recommended canonical owner for duplicated functionality

Status vocabularies → `domain/*/state_machine.py` + one mapping module; outcome constants → `domain/applications/entities.py`; limits → `CampaignSafetyPolicy` + quota repository (`application/campaigns`); use-case construction → one `application/applications/factory.py`; profile writes → granular endpoints behind a profile service; run/execution counters → a single `ExecutionProgress` writer in the orchestrator.

## 25. KEEP / CONSOLIDATE / REMOVE / REFACTOR / IMPLEMENT / VERIFY

- **KEEP:** DB uniqueness/idempotency, CAS + fencing + reconciliation, MatchScore/RecommendationScore split, cursor replay, ownership checks, headless-only forcing (orchestrator.py:551), CAPTCHA-pause (no solving), AES-GCM envelope.
- **CONSOLIDATE:** analytics queries, status mappings, use-case factories, API aliases, control-plane entrypoints.
- **REMOVE:** demo seed outside dev, unused Redis/worker container, unused settings/weights, dead `user_sessions` path or make it real, `AutomationState.ERROR`/`CANCELLED` references.
- **REFACTOR:** invert application→API/infra imports (`orchestrator.py:9`, `use_cases.py:9,35-39`, `jobs/use_cases.py:7-8`), routers using `AsyncSessionLocal` directly (automation.py:210+), mock-driven branches (`orchestrator.py:350`, `jobs/use_cases.py:57-79`), 1.2–1.9k-line pages.
- **IMPLEMENT:** profile list persistence, real health, migrations, token typing/revocation, per-step commits, server-side campaign launch, form-engine "unknown → ask the user".
- **VERIFY:** AUT-01 end-to-end with a file-backed SQLite run, Postgres run, platform adapters on sandbox accounts, AI gateway failure modes.

## 26. Prioritised remediation plan

1. Stop-the-bleeding (days): SEC-01, SEC-02, SEC-03, AUT-04, AUT-05, PRF-01, AUT-02, AUT-03.
2. Integrity of submissions: AUT-01, AUT-06, AUT-08, AUT-09, AUT-10.
3. Auth hardening: SEC-04..08, SEC-12, DB-01.
4. Correctness of matching/analytics: AI-01..08, ANA-01..03, JOB-01/04.
5. Operations & tests: TST-01, OPS-01/02, ARC-*, FE-*.
Details, effort and acceptance criteria: `improvement.md`.

## 27. Regression risks and migration strategy

Changing scoring (AI-02/03) alters thresholds' behaviour → build an evaluation set and freeze snapshot tests first. Enforcing token type (SEC-04) logs out clients holding refresh-as-access — ship with a short compatibility window. Introducing Alembic needs a baseline revision from the current models and a one-time reconciliation of the SQLite drift (DB-02). Per-step commits (AUT-01) change visibility semantics for the Applications page — intentionally.

## 28. Production-readiness assessment

**NOT READY.** Blocking: P1 findings above, no migrations, default secrets/seeded credentials, unenforced account safety caps, unverified end-to-end persistence of submissions, and an untested real-platform path.

## 29. Remaining uncertainties and audit limitations

Frontend pages were reviewed through data flow and handlers, not exhaustively per element (§8). I did not run the full pipeline with a real browser, so AUT-01's end-to-end consequence, the AI gateway fallbacks, adapter selectors and the 14 Chromium tests remain NOT VERIFIED. The 16 isolation failures' root cause is supported by 4 diagnosed samples and code reading; my confirmation re-run timed out. Severity counts depend on how grouped P3 rows are split. "Not found" statements (e.g., no metrics, no rate limiting) reflect searches of this revision, not proof of absence elsewhere.

## 30. Appendix — commands and evidence

```
git log -1; git status             # clean, 1 commit
cd frontend && npm ci && npx tsc --noEmit && npx vitest run && npx vite build
python -m pytest -q                # repo root, venv from backend/requirements.txt
# probes (isolated temp DB via DATABASE_URL=sqlite+aiosqlite:////tmp/...):
#  register(pw="x")→201; PUT /profile{skills,experiences}→GET shows []; GET /auth/me with refresh token→200;
#  DELETE /jobs as ordinary user→200; logout then same token→200; /health.database=="connected"
python -c "AutomationState.ERROR"                       # AttributeError
python -c "AutomationStateMachine(ABORTED).is_terminal" # False
python -c "'CANCELLED' in WorkflowStateEnum.__members__" # False
# SQLite lock repro: session A INSERT+flush (no commit); session B INSERT+commit → "database is locked" after timeout; session C sees 0 rows
```

Key locations: `backend/app/application/automation/orchestrator.py` (9, 262, 350, 400, 465, 551, 645, 717-720, 747, 804-833, 868-967); `…/applications/use_cases.py` (9, 35-39, 312-318, 470, 497, 548-567 in api, 596); `…/matching/cascade.py` (86, 92, 199-211, 299, 350-359); `…/matching/use_cases.py` (93-108, 165-192); `infrastructure/browser/form_engine.py` (243-248, 281, 383, 391); `core/database.py` (62-350, 373-385); `core/security.py`; `api/v1/{jobs,auth,ws,resumes,connections,automation,campaigns}.py`; `frontend/src/pages/ProfileManager.tsx` (208-278); `frontend/src/services/api.ts` (40-52, 148-152).
