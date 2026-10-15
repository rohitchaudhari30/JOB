# AutoApply — Improvement Roadmap

Companion to `current_audit.md`. That file records what is wrong (defects, with evidence). This file records what to do about it, and what could be added beyond fixing defects.

**Rules used here**
- Every remediation cites an audit finding ID from `current_audit.md`. Where no finding exists, the item is labelled *Optional* and says so.
- No numeric targets, SLAs or business metrics are invented. Acceptance criteria are behavioural and testable. Where a number would be needed (e.g. a rate limit), the item says "value to be decided by the product owner".
- Item classes: **DEFECT** (fixes a confirmed finding), **CONTROL** (a missing control the audit found absent), **CONDITIONAL** (needed only if a stated condition holds), **OPTIONAL** (feature, not required for correctness).
- Effort: S (≤ ~1 day), M (days), L (1–3 weeks), XL (multi-week, cross-cutting). These are relative sizes, not estimates of calendar time.
- Phases: **P-1 Containment**, **P-2 Submission integrity**, **P-3 Security & data foundation**, **P-4 Correctness & quality**, **P-5 Architecture & operations**, **P-6 Optional**.
- Scoring rule: `MatchScore` and `RecommendationScore` stay distinct. No scoring semantics change without an evaluation set and regression tests (see E-01).
- Priority mirrors the audit severity of the cited finding (P1/P2/P3). No P0 findings were recorded.

---

## Phase map and recommended order

| Phase | Purpose | Items |
|---|---|---|
| P-1 Containment | Stop actively harmful or silently wrong behaviour | A-01…A-08 |
| P-2 Submission integrity | Make "applied" mean applied, once, within limits | B-01…B-06 |
| P-3 Security & data foundation | Auth, secrets, migrations, privacy | C-01…C-10, D-01…D-04 |
| P-4 Correctness & quality | Matching, discovery, analytics truthfulness | E-01…E-07, F-01…F-08 |
| P-5 Architecture & ops | Layering, shared state, tests, deploy | G-01…G-07, H-01…H-03, I-01…I-05 |
| P-6 Optional | Features not required to fix defects | J-01…J-06 |

Dependency spine: **I-01 (test isolation)** first enables safe regression tests for everything else. **D-01 (Alembic)** precedes any schema change (B-02, C-05, D-02, D-03). **E-01 (evaluation set)** precedes any change to scoring (E-03, E-04).

---

## A. Immediate containment (P-1)

### A-01 Persist skills, experiences and educations on profile save
- **Finding:** PRF-01 (P1)
- **Class / Priority / Phase:** DEFECT / P1 / P-1
- **Objective:** Profile edits to skills, experiences and educations survive reload.
- **Evidence:** `PUT /profile` ignores these keys (`UpdateProfileUseCase` excludes them; `ProfileUpdateSchema` lacks them). `ProfileManager.tsx` edits them only in React state and never calls `POST /profile/skills|experiences|educations`. Executed: after reload they returned `[]`.
- **Solution:** Extend the update schema and use case to accept the three collections (replace-set semantics, transactional), or have the frontend call the existing sub-resource routes. Choose one path and delete the other's dead code.
- **Benefit:** Matching and form-filling run on the data the user actually entered.
- **Dependencies:** None. Add test via I-01.
- **Effort:** M
- **Risks / trade-offs:** Replace-set semantics can drop items if the client sends a partial list; mitigate with an explicit contract and a test. Existing rows must not be wiped by an old client.
- **Acceptance criteria:** (1) Save then reload returns the same skills/experiences/educations. (2) An integration test covers create, edit, delete of each. (3) Matching input reflects saved skills.

### A-02 Fix the non-existent `AutomationState.ERROR` reference
- **Finding:** AUT-02 (P1)
- **Class / Priority / Phase:** DEFECT / P1 / P-1
- **Objective:** Failed/aborted runs sync their final execution state.
- **Evidence:** `orchestrator.py:465` raises `AttributeError`, swallowed at l.482-483 (executed).
- **Solution:** Use the real enum member (or add one deliberately), narrow the `except` so unexpected errors are logged, not swallowed.
- **Benefit:** Execution records stop showing stale "running" states after failure.
- **Dependencies:** None.
- **Effort:** S
- **Risks:** Narrowing the except may surface latent errors; intended.
- **Acceptance criteria:** A test that forces a failed run asserts the persisted final state; an unknown-attribute error is logged at error level.

### A-03 Fix the non-existent `WorkflowStateEnum.CANCELLED` reference
- **Finding:** AUT-03 (P1)
- **Class / Priority / Phase:** DEFECT / P1 / P-1
- **Objective:** Pre-submit failures leave the application in a terminal, accurate state.
- **Evidence:** `use_cases.py:596` crashes when `attempt_id` is None, leaving the application in APPLYING (executed).
- **Solution:** Map to an existing terminal state (or add an explicit one through D-01), and handle `attempt_id is None`.
- **Benefit:** No applications stuck in APPLYING.
- **Dependencies:** Decision on which state represents a pre-submit abort (product decision).
- **Effort:** S
- **Risks:** Adding an enum value affects the frontend status map (H-02).
- **Acceptance criteria:** A test triggers a pre-submit error and asserts the final state and that no exception escapes.

### A-04 Respect `REQUIRE_APPROVAL`
- **Finding:** AUT-04 (P1)
- **Class / Priority / Phase:** DEFECT / P1 / P-1
- **Objective:** Matches classified as needing approval are never auto-submitted.
- **Evidence:** `orchestrator.py:717-720` submits them; `auto_apply_matches` defaults True (`automation.py:40`).
- **Solution:** Route REQUIRE_APPROVAL matches to an approval queue (state, API, UI affordance). Reconsider the default of `auto_apply_matches` (product decision; a safer default is off).
- **Benefit:** The user keeps control over borderline submissions.
- **Dependencies:** A-05 pairs naturally (block-on-unknown).
- **Effort:** M
- **Risks:** Changing the default changes behaviour for existing users; communicate it.
- **Acceptance criteria:** A REQUIRE_APPROVAL match never reaches the adapter submit step without an explicit approval record; tested.

### A-05 Stop fabricating form answers
- **Finding:** AUT-05 (P1)
- **Class / Priority / Phase:** DEFECT / P1 / P-1
- **Objective:** Never submit an answer the user did not provide or approve.
- **Evidence:** `form_engine.py`: work authorization defaults to "Yes" (l.247-248); notice period 30 days (l.243); unmatched dropdowns choose the first option (l.281); AI answers get constant `confidence=0.85` (l.383, 391).
- **Solution:** On any required field without a profile-backed answer, return "needs input" and pause the application for the user. Remove constant confidence; if AI-generated answers remain, mark them as AI-generated and route them for review.
- **Benefit:** Eliminates incorrect legal/eligibility statements on real applications.
- **Dependencies:** A-04 (approval queue) reuses the same pause path.
- **Effort:** M
- **Risks:** More applications will pause for input; that is the intended trade-off.
- **Acceptance criteria:** Tests show that unknown work-authorization, notice-period and unmatched-dropdown fields block submission and produce a user-input request; no default value is submitted.

### A-06 Restrict job deletion
- **Finding:** SEC-01 (P1)
- **Class / Priority / Phase:** DEFECT / P1 / P-1
- **Objective:** One user cannot delete or purge data that other users rely on.
- **Evidence:** `DELETE /jobs` and `DELETE /jobs/{id}` need only a login against a global table (executed 200); `job_repository.py:287-336` also removes all users' match results.
- **Solution:** Remove the routes, restrict them to an admin role (requires a role model, see C-09), or make them per-user "hide" operations.
- **Benefit:** Closes cross-user data destruction.
- **Dependencies:** C-09 if an admin role is chosen.
- **Effort:** S (remove) / M (role-gated)
- **Risks:** Frontend features depending on these routes must be adjusted (verify usage first).
- **Acceptance criteria:** A non-admin request returns 403/404 and a second user's jobs and match results are unchanged; tested.

### A-07 Remove the seeded demo account outside development
- **Finding:** SEC-02 (P1)
- **Class / Priority / Phase:** DEFECT / P1 / P-1
- **Objective:** No known credentials exist in non-development environments.
- **Evidence:** `database.py:373-385` seeds `demo.engineer@example.com` in every environment.
- **Solution:** Seed only when an explicit dev flag is set; never in production-like environments.
- **Benefit:** Removes a publicly documented login.
- **Dependencies:** None. Any deployed instance should have this user removed (an operational step to be performed by the owner).
- **Effort:** S
- **Risks:** Existing demos/tests relying on the seed need the flag.
- **Acceptance criteria:** With a production-like environment, startup creates no demo user; a test asserts it.

### A-08 Require real secrets and fail closed
- **Finding:** SEC-03 (P1)
- **Class / Priority / Phase:** DEFECT / P1 / P-1
- **Objective:** The app refuses to start with default secrets.
- **Evidence:** Public defaults for `SECRET_KEY`/`ENCRYPTION_KEY`, `DEBUG=True` (config.py:18-20); validation triggers only for prod-like `APP_ENV` or `DEBUG` false (l.72-86); `docker-compose.yml:11-18` runs development with no secrets; `.env.example` ships the known key.
- **Solution:** No defaults for secrets; validate at startup regardless of `APP_ENV` unless an explicit dev mode is set; default `DEBUG=False`; compose reads secrets from the environment; replace `.env.example` values with placeholders.
- **Benefit:** Prevents deployment with a public signing key (token forgery).
- **Dependencies:** Existing deployments should rotate keys (owner action; also invalidates encrypted sessions, see C-07).
- **Effort:** S
- **Risks:** First-run friction for developers; document a dev-mode flag.
- **Acceptance criteria:** Startup fails with a clear message when secrets are missing or equal to the known defaults; test covers it.

---

## B. Submission integrity and safety (P-2)

### B-01 Make the "SUBMITTING" guard durable and isolate telemetry
- **Findings:** AUT-01 (P1), ARC-06 (P2)
- **Class / Priority / Phase:** DEFECT / P1 / P-2
- **Objective:** The "persist SUBMITTING before click" guarantee actually survives a crash, and telemetry cannot block it.
- **Evidence:** Repositories only `flush`; the pipeline commits once (`orchestrator.py:400`), so `use_cases.py:312-318` is not durable. In an isolated repro a second SQLite writer got `database is locked` and another reader saw 0 rows. End-to-end effect: NOT VERIFIED.
- **Solution:** Commit at each state transition boundary, in short transactions; write event/telemetry rows in a separate session/connection so they never hold the application's write lock.
- **Benefit:** Crash recovery and the reconciliation sweeper rely on committed state.
- **Dependencies:** I-01 for tests; interacts with D-01 if moving off SQLite.
- **Effort:** L
- **Risks:** More commits change failure semantics; the compare-and-set fencing must be re-tested. Highest-risk change in the roadmap.
- **Acceptance criteria:** A test kills/raises after the SUBMITTING write and a fresh session sees SUBMITTING; concurrent event writes do not produce lock errors in the repro (`scratchpad/repro/lock_repro.py` pattern).

### B-02 Enforce account-level and platform caps
- **Finding:** AUT-06 (P1)
- **Class / Priority / Phase:** DEFECT / P1 / P-2
- **Objective:** Daily/global safety ceilings apply to every run, not only to dashboard display.
- **Evidence:** `GLOBAL_ACCOUNT_SAFE_CEILING` and `PLATFORM_DAILY_CAP_DEFAULT` are used only by `dashboard_service.py:78,93`; quota reservation requires `campaign_id` (`orchestrator.py:747`).
- **Solution:** Reserve quota for every submission (campaign or not) against the account/platform caps, in the same transaction as the state change.
- **Benefit:** Prevents unbounded submission volume (and account-ban risk on platforms).
- **Dependencies:** B-01; cap values are a product decision (do not invent).
- **Effort:** M
- **Risks:** Existing flows without `campaign_id` start being limited.
- **Acceptance criteria:** A non-campaign run exceeding the configured cap is refused; test included.

### B-03 Keep the quota slot on uncertain outcomes
- **Finding:** AUT-08 (P2)
- **Class / Priority / Phase:** DEFECT / P2 / P-2
- **Objective:** An uncertain submission does not free its slot.
- **Evidence:** See AUT-08 in the audit.
- **Solution:** Release a slot only on confirmed non-submission; hold on `RECONCILIATION_REQUIRED`.
- **Benefit:** Avoids over-submission after ambiguous failures.
- **Dependencies:** B-01, B-02.
- **Effort:** S
- **Risks:** Slots stay consumed until reconciliation; add a manual reconcile action.
- **Acceptance criteria:** Test with an ambiguous failure asserts the slot remains reserved.

### B-04 Persist failure detail on applications
- **Finding:** AUT-09 (P2)
- **Class / Priority / Phase:** DEFECT / P2 / P-2
- **Objective:** Users and operators can see why an application failed.
- **Evidence:** See AUT-09.
- **Solution:** Store a structured failure reason on the application and surface it on the Applications page.
- **Benefit:** Diagnosability; fewer silent failures.
- **Dependencies:** D-01 if a column is added.
- **Effort:** S
- **Risks:** Avoid persisting PII/page content in failure text.
- **Acceptance criteria:** A failed application returns a non-empty failure reason through the API; test.

### B-05 Emit terminal events and a correct `is_terminal`
- **Finding:** AUT-10 (P2)
- **Class / Priority / Phase:** DEFECT / P2 / P-2
- **Objective:** Event consumers can tell when a run ended.
- **Evidence:** See AUT-10 (executed).
- **Solution:** Emit one terminal event per run for every end path; set `is_terminal` consistently.
- **Benefit:** Live Console stops showing runs as still active.
- **Dependencies:** A-02.
- **Effort:** S
- **Risks:** None significant.
- **Acceptance criteria:** Tests for completed, failed, aborted and cancelled runs each assert a terminal event.

### B-06 Resume paused applications and reconcile orphan runs
- **Findings:** AUT-07 (P2), AUT-19 (P2), AUT-14 (P2)
- **Class / Priority / Phase:** DEFECT / P2 / P-2
- **Objective:** Paused applications can continue; runs orphaned by restarts are reconciled; long work runs in the background.
- **Evidence:** See the three findings.
- **Solution:** Implement resume for paused applications (shares A-05's pause path); on startup, reconcile runs with no live session; run application execution as a background task rather than inside the request.
- **Benefit:** Fewer stuck runs after restart; no request timeouts.
- **Dependencies:** A-05, B-01.
- **Effort:** L
- **Risks:** Background execution adds a concurrency surface; keep per-user locks.
- **Acceptance criteria:** Restart-simulation test leaves no run in "running"; a paused application can be resumed and completes.

---

## C. Security and privacy hardening (P-3)

### C-01 Enforce token type
- **Finding:** SEC-04 (P2) — **DEFECT / P2 / P-3 / S**
- **Objective:** Refresh tokens cannot authenticate API or WS calls.
- **Evidence:** `decode_access_token` never checks `type == "access"`; refresh accepted on `/auth/me` (executed).
- **Solution:** Check the claim for access decoding; use a separate decode for refresh.
- **Benefit:** Short-lived access tokens regain their purpose.
- **Dependencies:** None. **Risks:** Clients holding old tokens re-login once.
- **Acceptance criteria:** `/auth/me` with a refresh token returns 401; the same for `/ws?token=`.

### C-02 Real logout and token revocation
- **Finding:** SEC-05 (P2) — **DEFECT / P2 / P-3 / M**
- **Objective:** Logout invalidates the session.
- **Evidence:** `logout` is a no-op (`auth.py:118-120`); `user_sessions` is written but never read.
- **Solution:** Check session/jti on each request (or maintain a revocation list); make logout revoke it; wire the frontend to call it.
- **Benefit:** Stolen tokens can be cut off.
- **Dependencies:** C-01, D-01. **Risks:** An extra lookup per request; acceptable on indexed lookups.
- **Acceptance criteria:** After logout, the old access and refresh tokens return 401.

### C-03 Rate limiting and password policy
- **Finding:** SEC-06 (P2) — **CONTROL / P2 / P-3 / M**
- **Objective:** Throttle auth endpoints; reject trivially weak passwords; avoid account enumeration.
- **Evidence:** No limiter; a 1-character password registered with 201; register returns 409 for existing emails.
- **Solution:** Limit login/register/refresh per IP and per account; set a minimum password policy (values for the product owner to decide); make the registration response non-enumerating (or accept the trade-off explicitly).
- **Benefit:** Reduces brute-force and credential-stuffing exposure.
- **Dependencies:** ARC-05 decision (in-process vs shared limiter state, G-04). **Risks:** Shared NAT users may hit IP limits.
- **Acceptance criteria:** Tests show a weak password is rejected and that repeated failures are throttled at the configured limit.

### C-04 Authenticate the WebSocket and tidy tickets
- **Finding:** SEC-07 (P2) — **DEFECT / P2 / P-3 / S**
- **Objective:** No anonymous WS sessions; tickets expire.
- **Evidence:** `ws.py:88-107` accepts anonymous; tickets never purged.
- **Solution:** Reject connections without a valid ticket; purge expired tickets; drop the `?token=` fallback after C-01.
- **Benefit:** Closes unauthenticated event access.
- **Dependencies:** C-01. **Risks:** Frontend reconnect logic must fetch a fresh ticket (check FE-05).
- **Acceptance criteria:** Anonymous connect is closed with an auth error; test.

### C-05 Move tokens out of `localStorage`
- **Finding:** SEC-08 (P2) — **CONDITIONAL / P2 / P-3 / M**
- **Condition:** Applies if an XSS sink ever appears; the audit found none today.
- **Objective:** Reduce the impact of a future XSS.
- **Solution:** HttpOnly SameSite cookies for refresh (and optionally access) with CSRF protection, or in-memory access tokens.
- **Benefit:** Tokens not readable by script.
- **Dependencies:** C-01, C-02, C-08 (CORS). **Risks:** CSRF handling and CORS credential config must be right.
- **Acceptance criteria:** No token in `localStorage`; auth works across reload; CSRF test passes.

### C-06 Container and image hardening
- **Finding:** SEC-09 (P2) — **DEFECT / P2 / P-3 / S**
- **Objective:** Non-root image with no secrets baked in and pinned dependencies.
- **Evidence:** Runs as root; no `.dockerignore`; `COPY . .`; unpinned `>=`; no `HEALTHCHECK`.
- **Solution:** Add `.dockerignore`, non-root user, lockfile/pinned requirements, `HEALTHCHECK` (see I-03).
- **Benefit:** Smaller blast radius; reproducible builds.
- **Dependencies:** None. **Risks:** Playwright needs writable dirs for the non-root user.
- **Acceptance criteria:** Image builds, runs as non-root, contains no `.env`/`storage`; dependencies are pinned.

### C-07 Strict encryption-key handling
- **Finding:** SEC-12 (P2) — **DEFECT / P2 / P-3 / M**
- **Objective:** No silent random-key fallback; support rotation.
- **Evidence:** `SessionStorageEncryptor` pads short keys with `"0"` and falls back to a random key (`security.py:74-82`).
- **Solution:** Validate key length/format and fail startup; add a key-version prefix to ciphertext for rotation.
- **Benefit:** Stored platform sessions stay decryptable and rotation becomes possible.
- **Dependencies:** A-08. **Risks:** Existing ciphertext must remain readable (version-less = v0).
- **Acceptance criteria:** A bad key aborts startup; round-trip and rotation tests pass.

### C-08 HTTP hardening
- **Finding:** SEC-13 (P2) — **DEFECT / P2 / P-3 / M**
- **Objective:** Security headers, TLS, and narrow CORS.
- **Evidence:** No headers, no TLS in nginx, CORS wildcard methods/headers with credentials (`main.py:59-65`), `/docs` open.
- **Solution:** Add headers at nginx/app; terminate TLS (deployment decision); list explicit methods/headers/origins; gate `/docs` outside dev.
- **Benefit:** Baseline browser protections.
- **Dependencies:** OPS-02 changes (I-04). **Risks:** A strict CSP may break the Vite build; test it.
- **Acceptance criteria:** Header checks pass in a test against the built stack; wildcard CORS removed.

### C-09 Role model (conditional)
- **Finding:** SEC-01 (P1), AUT-20 (P2) — **CONDITIONAL / P1 / P-3 / M**
- **Condition:** Needed only if admin-only job deletion or campaign operations are chosen over removal.
- **Objective:** An authorization model that distinguishes admin from user.
- **Solution:** Add a role claim/field and a dependency; scope campaign routes per user (AUT-20).
- **Benefit:** Enforceable admin-only operations.
- **Dependencies:** D-01. **Risks:** Scope creep; prefer removal if unused.
- **Acceptance criteria:** Campaign operations on another user's campaign return 403/404; test.

### C-10 Upload limits, SSRF allowlist, privacy lifecycle, logging redaction
- **Findings:** SEC-10 (P2), SEC-15 (P2), PRV-01 (P2), SEC-11 (P3), SEC-14 (P3)
- **Class / Priority / Phase:** DEFECT-CONTROL / P2 / P-3 / L (collective)
- **Objective:** Close the remaining input, disclosure and privacy gaps.
- **Solution (each item separately testable):**
  1. Stream resume uploads with a hard cap before reading the whole body; keep magic-byte checks (SEC-10).
  2. Allowlist outbound URLs used by automation (SEC-15, INFERRED; confirm exposure first).
  3. Add account deletion, resume purge and a retention policy (PRV-01; the retention period is a policy decision, not set here).
  4. Authenticate `/analytics/ai-status` (SEC-11).
  5. Add log redaction and use structured logging (SEC-14).
- **Benefit:** Lower abuse and privacy exposure.
- **Dependencies:** D-01 for deletion cascades. **Risks:** Deletion must handle soft-deleted application history deliberately.
- **Acceptance criteria:** Oversize upload rejected without full buffering; deleting an account removes its data (tested); the public AI-status route returns 401.

---

## D. Data and migrations (P-3)

### D-01 Adopt Alembic migrations
- **Finding:** DB-01 (P1) — **DEFECT / P1 / P-3 / L**
- **Objective:** Versioned, reviewable, database-agnostic schema changes.
- **Evidence:** `database.py:62-350` is a SQLite-only hand-written ALTER routine returning early on non-SQLite (l.64) and swallowing all exceptions (l.349-350).
- **Solution:** Baseline the current schema, convert existing ALTERs to migrations, fail loudly on error, remove the ad-hoc routine.
- **Benefit:** Safe upgrades; makes Postgres viable.
- **Dependencies:** None, but precedes other schema changes. **Risks:** Baselining against existing databases of unknown history; test against a copy of a real database (never production directly).
- **Acceptance criteria:** An empty DB and a legacy DB both reach the same schema; the app no longer runs ad-hoc ALTERs.

### D-02 Align model and DB defaults; add CHECK constraints
- **Findings:** DB-02 (P2), DB-04 (P3) — **DEFECT / P2 / P-3 / M**
- **Objective:** Same defaults and valid values at both layers.
- **Solution:** Reconcile defaults via migration; add CHECK constraints for enumerated columns.
- **Dependencies:** D-01. **Risks:** Existing invalid rows will block constraints; clean them in the migration.
- **Acceptance criteria:** Insert of an invalid enum value fails at the DB; defaults match.

### D-03 Parameterize migration SQL; snapshot resume reference; config table
- **Findings:** DB-03 (P3), DB-05 (P3), DB-07 (P3) — **DEFECT / P3 / P-3 / M**
- **Objective:** Hygiene and integrity improvements.
- **Solution:** Bind parameters (DB-03); store a snapshot reference to the resume used on each application (DB-05); move hard-coded configuration into a config table only where a runtime-change need exists (DB-07; otherwise leave).
- **Dependencies:** D-01. **Risks:** DB-07 may be unnecessary; decide before building.
- **Acceptance criteria:** Application rows retain the resume version used after a later resume replacement.

### D-04 Paginate events
- **Finding:** DB-06 (P2) — **DEFECT / P2 / P-3 / S**
- **Objective:** Bounded event queries.
- **Solution:** Apply `limit` and cursor pagination to event reads.
- **Dependencies:** None. **Risks:** Frontend consumers must respect pagination (the `after_seq` cursor already exists).
- **Acceptance criteria:** Event reads are bounded; test with many events.

---

## E. Matching and AI quality (P-4)

### E-01 Build an evaluation set and snapshot tests
- **Finding:** AI-03 (P2), prerequisite for AI-01/02 — **CONTROL / P2 / P-4 / L**
- **Objective:** Evidence base before touching scoring.
- **Evidence:** Weights sum to 1.10 with a 38-point baseline (`cascade.py:350-359`); no calibration data exists in the repo.
- **Solution:** Assemble a labelled set of candidate–job pairs (to be supplied/approved by the owner; not invented here) and snapshot tests of current outputs.
- **Benefit:** Any scoring change can be measured.
- **Dependencies:** I-01. **Risks:** Labelling cost; privacy of real candidate data (anonymize).
- **Acceptance criteria:** A repeatable script reports current score distributions and comparison against labels.

### E-02 Include the MatchRule in the evaluation cache key
- **Finding:** AI-01 (P1) — **DEFECT / P1 / P-4 / S**
- **Objective:** Changing rules invalidates cached evaluations.
- **Evidence:** `evaluation_key` excludes the rule (`cascade.py:199-211`); the cache check precedes the rule (`matching/use_cases.py:93-108`).
- **Solution:** Add the rule's identity/version/hash to the key; evaluate the rule check before honoring cache hits where it can change the outcome.
- **Benefit:** Rule edits take effect.
- **Dependencies:** None (does not alter score semantics). Note: cached rows from before the change will be stale; invalidate once on release.
- **Risks:** One-time recomputation cost.
- **Acceptance criteria:** A test changes a rule and gets a different result than the cached one.
- **Note on severity:** Audit labels this P1 on the basis of wrong results being served from cache; if the owner judges the impact lower, the audit table should be revisited in a single place.

### E-03 Fix skill-coverage computation
- **Finding:** AI-02 (P2) — **DEFECT / P2 / P-4 / M**
- **Objective:** Coverage measured over the job's requirements, with word-boundary matching.
- **Evidence:** Computed over candidate skills using substring matching (`cascade.py:86,92`).
- **Solution:** Change the denominator/matching only after E-01; ship behind a comparison report showing before/after distributions.
- **Dependencies:** E-01. **Risks:** Score shifts for all users; announce and keep `MatchScore` vs `RecommendationScore` separate.
- **Acceptance criteria:** Regression tests with known cases ("java" ≠ "javascript"); evaluation report reviewed.

### E-04 Evaluate weights and baseline before changing
- **Finding:** AI-03 (P2) — **CONDITIONAL / P2 / P-4 / M**
- **Condition:** Only if E-01 shows miscalibration.
- **Solution:** Normalize weights and revisit the 38-point baseline using the evaluation set.
- **Dependencies:** E-01, E-03. **Risks:** Changes ranking.
- **Acceptance criteria:** Documented before/after on the evaluation set; owner approval.

### E-05 Honest model and embedding labels
- **Finding:** AI-04 (P2) — **DEFECT / P2 / P-4 / S**
- **Evidence:** A 64-dim MD5 feature-hashing vector is labelled `all-MiniLM-L6-v2`.
- **Solution:** Rename it truthfully, or replace it with the real model (the latter is OPTIONAL, see J-02).
- **Dependencies:** Cached embeddings may carry the old label. **Risks:** Display strings in analytics.
- **Acceptance criteria:** No code path or UI string claims a model that is not used.

### E-06 One DB session per task; validate LLM claims; gate LLM calls
- **Findings:** AI-06 (P2), AI-07 (P2), AI-08 (P2) — **DEFECT / P2 / P-4 / M**
- **Solution:** Use a separate session per concurrent task (AI-06); validate that LLM-asserted skills/claims exist in the job text (AI-07, INFERRED; test before building); only call the LLM when earlier cascade stages leave the result undecided (AI-08, INFERRED).
- **Dependencies:** E-01 for AI-08 impact measurement. **Risks:** Gating changes the stage composition of scores; measure first.
- **Acceptance criteria:** Concurrent matching tests show no shared-session errors; an invented skill is rejected; LLM calls are skipped when the prior stage decides.

### E-07 Wire or remove the unused parameter
- **Finding:** AI-05 (P3) — **DEFECT / P3 / P-4 / S**
- **Solution:** Implement the intended behaviour or delete the parameter.
- **Acceptance criteria:** No dead parameter remains.

---

## F. Discovery, analytics and connections (P-4)

### F-01 Pass the external job id into canonical keys
- **Finding:** JOB-01 (P2) — **DEFECT / P2 / P-4 / S**
- **Evidence:** `jobs/use_cases.py:94-99` omits `external_job_id`, so description-less jobs collapse.
- **Solution:** Include it in the key; add a one-time dedup/migration review for existing rows (D-01).
- **Risks:** Existing collapsed jobs cannot be un-merged automatically.
- **Acceptance criteria:** Two description-less jobs with different external ids remain distinct; test.

### F-02 Background discovery and error surfacing
- **Findings:** JOB-02 (P2), JOB-03 (P2) — **DEFECT / P2 / P-4 / M**
- **Solution:** Run discovery as a background task with status; return per-source errors to the UI.
- **Dependencies:** G-04. **Acceptance criteria:** A failing source shows an error to the user without failing others.

### F-03 Real ATS inputs
- **Finding:** JOB-04 (P2) — **DEFECT / P2 / P-4 / M**
- **Evidence:** Lever/Ashby/Workday use role text as a company slug (`lever.py:27`).
- **Solution:** Take company identifiers as input, or limit those sources to what they can actually query.
- **Acceptance criteria:** Source requests use real slugs; test with recorded responses.

### F-04 Currency-aware salary filter
- **Finding:** JOB-05 (P3) — **CONDITIONAL / P3 / P-4 / S**
- **Condition:** Applies if multi-currency jobs are in scope for the product.
- **Acceptance criteria:** A filter test with mixed currencies behaves per the defined rule.

### F-05 Truthful analytics
- **Findings:** ANA-01 (P2), ANA-03 (P2), ANA-04/05 (P3) — **DEFECT / P2 / P-4 / M**
- **Evidence:** Weight-tuning is mocked (`analytics_service.py:779-829`, constants 0.45/0.35/0.20, `confidence_score=0.92`); dashboard hard-codes.
- **Solution:** Compute from data or remove/label as sample; define limits and labels clearly.
- **Acceptance criteria:** No hardcoded analytics outputs are presented as real data.

### F-06 Shared enum constants and queries in analytics
- **Finding:** ANA-02 (P2) — **DEFECT / P2 / P-4 / S**
- **Solution:** Replace string literals with enums; share the query code (DUP items).
- **Acceptance criteria:** One definition of each status group; tests.

### F-07 Count qualified matches separately
- **Finding:** AUT-11 (P2) — **DEFECT / P2 / P-4 / S**
- **Acceptance criteria:** Counters distinguish qualified/applied/failed; test.

### F-08 Connections: remote login, status semantics
- **Findings:** CON-01 (P2), CON-02 (P3), CON-03 (P3) — **DEFECT / P2 / P-4 / L**
- **Evidence:** Platform login flow depends on a local browser (CON-01).
- **Solution:** Design a remote login flow suitable for the deployed topology (product/architecture decision; interacts with COMP-01, J-05); separate "status" from "capability"; distinguish outage from disconnected.
- **Acceptance criteria:** A deployed (headless) instance can establish a session; UI differentiates states.

---

## G. Architecture and reliability (P-5)

### G-01 Invert layering
- **Findings:** ARC-01 (P2), ARC-06 (P2), DUP-* related — **DEFECT / P2 / P-5 / L**
- **Evidence:** `app.api.v1.ws` imported by the application layer (`orchestrator.py:9`, `use_cases.py:9`).
- **Solution:** Introduce an event-publisher interface in the application layer; implement it in infrastructure.
- **Acceptance criteria:** No import from `app.api` in `app.application`; enforced by a test or lint rule.

### G-02 Routers use repositories/use cases
- **Finding:** ARC-02 (P2) — **DEFECT / P2 / P-5 / M**
- **Acceptance criteria:** Routers contain no direct SQL.

### G-03 Remove test-driven branches from production code
- **Finding:** ARC-03 (P2) — **DEFECT / P2 / P-5 / M**
- **Dependencies:** I-01 (provide fakes in tests instead).
- **Acceptance criteria:** No `if testing` branches in production code.

### G-04 Shared-state strategy for multi-process
- **Finding:** ARC-05 (P2), AUT-17 (P2), AUT-12 (P2) — **CONDITIONAL / P2 / P-5 / XL**
- **Condition:** Needed only when running more than one process/instance. The audit found everything (sessions, locks, WS, scheduler) is per-process today.
- **Solution:** Decide single-instance as a documented constraint, or adopt shared state (Redis/DB) for sessions, locks, WS fan-out and scheduler persistence. Remove the unused Redis service and no-op worker if staying single-instance (AUT-12).
- **Risks:** Largest architectural change; do not start without a deployment decision.
- **Acceptance criteria:** Documented decision; if multi-process, a two-instance test passes for locking and events; persisted schedules survive restart (AUT-17).

### G-05 Single use-case factory; server-side campaign launch; scope campaigns
- **Findings:** AUT-13 (P2), AUT-15 (P2), AUT-20 (P2) — **DEFECT / P2 / P-5 / M**
- **Evidence:** Campaign start only creates a record (`campaigns.py:284-305`); the frontend then calls `/automation/start` (`DirectApply.tsx:377`).
- **Solution:** One factory for use cases; launch from the server in one operation; per-user scoping.
- **Acceptance criteria:** One request starts a campaign run; a second user cannot touch it.

### G-06 Align adapter manifest with adapters
- **Finding:** AUT-16 (P2) — **DEFECT / P2 / P-5 / S–M**
- **Evidence:** Only Naukri/LinkedIn/Greenhouse have application adapters (`registry.py:65-67`).
- **Solution:** Mark unsupported platforms as discovery-only in the manifest and UI, or implement adapters (OPTIONAL, J-03).
- **Acceptance criteria:** The UI never offers auto-apply for a platform without an adapter.

### G-07 User-timezone safety windows
- **Finding:** AUT-18 (P3) — **DEFECT / P3 / P-5 / S**
- **Acceptance criteria:** Window checks use the user's timezone; test across zones.

---

## H. Frontend (P-5)

### H-01 Error boundary
- **Finding:** FE-01 (P2) — **DEFECT / P2 / P-5 / S**
- **Acceptance criteria:** A thrown render error shows a fallback instead of a blank page.

### H-02 Status maps follow backend enums
- **Findings:** FE-02..05 (P3), A-03 dependency — **DEFECT / P3 / P-5 / M**
- **Solution:** Split oversized pages, lazy-load heavy chunks (the build warns on a 600.39 kB chunk), basic accessibility fixes, reconnect backoff for the WS.
- **Acceptance criteria:** Build warning gone or documented; reconnect uses backoff; the new states render.

### H-03 Surface approval and input-needed states
- **Finding:** AUT-04/AUT-05 follow-up — **DEFECT / P1 / P-5 / M**
- **Solution:** UI for approval queue and "needs input" requests created in A-04/A-05.
- **Dependencies:** A-04, A-05.
- **Acceptance criteria:** A user can approve or answer from the UI and the application proceeds.

---

## I. Testing, CI and operations (P-5; I-01 starts early)

### I-01 Test isolation fixture
- **Finding:** TST-01 (P2) — **DEFECT / P2 / P-1 (enabler) / M**
- **Evidence:** 16 failures are "no such table" because production code opens `AsyncSessionLocal` (`./app.db`) while `conftest.py` only overrides `get_db_session`. (Only 4 individually diagnosed; the rest matched by signature.)
- **Solution:** Patch the session factory itself in `conftest.py` (or inject it) so all code uses the test DB; re-run to confirm the 16.
- **Acceptance criteria:** The 16 tests pass or fail for a reason other than a missing table; the repo's `app.db` is never touched by tests.

### I-02 Provide Chromium in CI and test env
- **Finding:** TST-01 (14 environmental failures) — **CONTROL / P2 / P-5 / S**
- **Solution:** Install the browser in CI or mark browser tests with a skip condition.
- **Acceptance criteria:** Browser tests run in CI, or are explicitly skipped with a reason.

### I-03 Real health and readiness
- **Finding:** OPS-01 (P2) — **DEFECT / P2 / P-5 / S**
- **Evidence:** `/health` hard-codes `"database": "connected"`.
- **Solution:** Execute a trivial query; separate liveness and readiness; wire a Docker `HEALTHCHECK`.
- **Acceptance criteria:** With the DB unavailable, readiness fails; test.

### I-04 nginx limits and timeouts
- **Finding:** OPS-02 (P2, INFERRED) — **DEFECT / P2 / P-5 / S**
- **Solution:** Set `client_max_body_size` to match the resume cap and appropriate proxy timeouts, and WS upgrade settings.
- **Acceptance criteria:** An oversize upload is rejected at nginx.

### I-05 Regression tests for confirmed defects
- **Findings:** PRF-01, AUT-02, AUT-03, SEC-01, SEC-04, AI-01 — **CONTROL / P1 / P-1..P-2 / M**
- **Solution:** One failing-then-passing test per executed finding (several were reproduced with probes in the audit).
- **Acceptance criteria:** Each listed finding has a test that fails on the old code and passes after the fix.

---

## J. Optional improvements (not required to fix defects; no audit finding mandates them)

| ID | Item | Class | Why it might help | Dependencies | Effort | Notes / risks |
|---|---|---|---|---|---|---|
| J-01 | Move from SQLite to PostgreSQL | OPTIONAL | Removes the single-writer lock contention seen in AUT-01 | D-01, B-01 | L–XL | Postgres behaviour is NOT VERIFIED in the audit; do B-01 first, it may suffice for single-instance |
| J-02 | Real embedding model | OPTIONAL | Makes the embedding stage meaningful (AI-04) | E-01, E-05 | M | Needs evaluation (E-01); model hosting cost/latency |
| J-03 | More application adapters | OPTIONAL | Covers more platforms (AUT-16) | G-06, COMP-01 | L each | Each platform has its own terms; real-site behaviour NOT VERIFIED |
| J-04 | Resume parsing | OPTIONAL | Replaces the placeholder `raw_text` (PRF-02) | E-01 | M–L | PRF-02 is MISSING; this is the proper fix, listed here because the approach (library vs LLM) is a product choice |
| J-05 | Resolve the bot-evasion posture | CONDITIONAL | COMP-01: browser stealth flags may breach platform terms | Legal/product decision | S–M | The audit makes no legal determination; owner decision |
| J-06 | Structured logging and tracing | OPTIONAL | Extends SEC-14 | C-10 | M | Pick after the logging baseline exists |

---

## Duplication clean-up (DUP-01…DUP-14)

The 14 duplication items in `current_audit.md` are cleaned up opportunistically alongside the items above rather than as a standalone phase, to avoid a large behaviour-neutral change with no safety net: analytics duplication with F-06, use-case construction with G-05, status maps with H-02, the rest with the layering work in G-01/G-02. Each should be done only after I-01 is in place and with the relevant tests green before and after.

## Traceability

| Audit finding | Roadmap item |
|---|---|
| PRF-01 | A-01, I-05 |
| AUT-01 | B-01 |
| AUT-02 | A-02, I-05 |
| AUT-03 | A-03, I-05 |
| AUT-04 | A-04, H-03 |
| AUT-05 | A-05, H-03 |
| AUT-06 | B-02 |
| SEC-01 | A-06, C-09, I-05 |
| SEC-02 | A-07 |
| SEC-03 | A-08 |
| DB-01 | D-01 |
| AI-01 | E-02, I-05 |
| SEC-04…SEC-08 | C-01…C-05 |
| SEC-09, SEC-12, SEC-13 | C-06, C-07, C-08 |
| SEC-10, SEC-11, SEC-14, SEC-15, PRV-01 | C-10 |
| PRF-02 | J-04 |
| AUT-07, AUT-14, AUT-19 | B-06 |
| AUT-08 | B-03 |
| AUT-09 | B-04 |
| AUT-10 | B-05 |
| AUT-11 | F-07 |
| AUT-12, AUT-17, ARC-05 | G-04 |
| AUT-13, AUT-15, AUT-20 | G-05 (AUT-20 also C-09) |
| AUT-16 | G-06, J-03 |
| AUT-18 | G-07 |
| COMP-01 | J-05 |
| AI-02 | E-03 |
| AI-03 | E-01, E-04 |
| AI-04 | E-05, J-02 |
| AI-05 | E-07 |
| AI-06, AI-07, AI-08 | E-06 |
| JOB-01 | F-01 |
| JOB-02, JOB-03 | F-02 |
| JOB-04 | F-03 |
| JOB-05 | F-04 |
| ANA-01, ANA-03, ANA-04, ANA-05 | F-05 |
| ANA-02 | F-06 |
| CON-01, CON-02, CON-03 | F-08 |
| DB-02, DB-04 | D-02 |
| DB-03, DB-05, DB-07 | D-03 |
| DB-06 | D-04 |
| ARC-01, ARC-06 | G-01 (ARC-06 also B-01) |
| ARC-02 | G-02 |
| ARC-03 | G-03 |
| TST-01 | I-01, I-02 |
| OPS-01 | I-03 |
| OPS-02 | I-04 |
| FE-01 | H-01 |
| FE-02…FE-05 | H-02 |
| DUP-01…DUP-14 | see "Duplication clean-up" |
