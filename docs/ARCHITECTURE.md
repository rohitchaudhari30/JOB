# Architecture notes

## Layers (ARC-01, ARC-02)
`domain` (plain entities and rules) -> `application` (use cases, the run orchestrator) -> `infrastructure` (database, browser, AI) -> `api` (routes).
Rules checked by `tests/unit/test_architecture_rules.py`:
- Nothing below `api` imports from `api`. Live updates go through `app/application/notifier.py`, which the WebSocket module registers itself with.
- `domain` never imports `infrastructure`.
- Routes get their database access through repositories and dependencies, not by opening their own sessions.

Known leftover: `application` still imports some `infrastructure` modules (browser, adapters). Moving those behind interfaces is future work.

## Shared state strategy (ARC-05)
Live run state (`AutomationSession`), per-run locks, WebSocket connections and one-time WebSocket tickets live in the memory of **one** API process. Therefore:
- The app must run as a single process. `main.py` refuses to start when `WEB_CONCURRENCY` is above 1.
- Anything that must survive a restart is stored in the database: runs, events, schedules, applications. On startup, runs left active by a restart are marked FAILED.
- Long browser work runs as background tasks inside that process (`app/application/background.py`, the orchestrator).

To scale to several processes later, in this order:
1. Keep run and event state in the database only (already mostly true) and read it from there.
2. Replace the in-memory WebSocket fan-out with a shared channel (for example Postgres LISTEN/NOTIFY or Redis pub/sub).
3. Move browser work to separate worker processes that claim jobs from the database (the matching task queue already works this way).
4. Move from SQLite to Postgres.

## Decisions taken as defaults (change if you disagree)
- **Quick run (Q-04) and mobile (Q-05):** quick run is kept; pages are responsive for full management (no horizontal scroll at 375 and 768 px).
- **Matching thresholds (AI-03):** unchanged. Re-setting 60/75/90 needs a labelled evaluation (`scripts/evaluate_matching.py`).
- **Account (Q-08):** Settings › Account has change password, download my data and delete my account. Changing the password sets `users.tokens_valid_after`, which ends every other session (access and refresh tokens issued before it are refused; the caller gets a fresh pair). The export is an allow-list of the user's own tables (`user_data_export.py`) without credentials, saved browser sessions or file paths. Deletion needs the password and removes all owned rows and files (PRV-01).
- **Login tokens (SEC-08):** done. Access token in browser memory only; refresh token in an HttpOnly, SameSite=Strict cookie scoped to `/api/v1/auth` (Secure outside dev). Rotated on every refresh, revoked on logout, foreign `Origin` refused. Needs the app and API on one origin (nginx proxy does this); a cross-origin deployment must also set `CORS_ORIGINS` and revisit SameSite.
- **Matching weights (DB-07):** stay in `saved_answers` under the intent `matching_weights`. A dedicated table is worth it only when weights get versioned.
- **Browser stealth (COMP-01):** see `BROWSER_STEALTH_ENABLED` in `app/core/config.py`.
- **Campaign schedules (the UI's Safety & schedule tab):** a one-minute ticker (`workers/campaign_scheduler.py`) launches due schedules through `application/campaigns/launch.py`, the same code as the Run button. Enabling a schedule arms it (first run at its next slot, never immediately); the slot is advanced before launching so failures are not retried every minute; slots over 1 h late (downtime) and slots outside operating hours or while a run is live are skipped. Enabling the schedule is the user's consent to the same auto-apply behaviour as the Run button (still bounded by daily/hourly limits, operating hours and the approval band).
- **API schedules `/automation/schedules` (Q-02):** a firing schedule starts one run for its owner through the same orchestrator path as the Start button. Skipped if the user already has a live run. `auto_apply` is **off by default** (discover and match only; matches wait for approval); when the user turns it on the pipeline still applies REQUIRE_APPROVAL and the daily caps. `SCHEDULED_RUNS_ENABLED=false` is an operator kill switch. Misfires coalesce, no overlap. Like run recovery, this assumes one backend process.

## Duplicates: what each one is and who owns it
| Item | Decision |
|---|---|
| DUP-01 control plane (run, campaign, application and WebSocket stop/pause) | Different scopes on purpose. A *run* is one live pipeline, a *campaign execution* is its stored record, an *application* is one job. Pausing a run also updates its execution (done in `automation.py`). Do not add a fourth entry point. |
| DUP-02 status vocabularies | Each enum has one meaning: `AutomationState` (live run), `ExecutionStateEnum` (stored execution), `CampaignStateEnum` (campaign), `WorkflowStateEnum` (system progress of an application), `ApplicationOutcomeStatus` (what happened at the employer). Database CHECK constraints guard the two application columns. |
| DUP-03 outcome literals in analytics | One shared list and one rules table (`SENT_OUTCOMES`, `OUTCOME_RULES`). |
| DUP-04 repeated analytics queries | Resume and source breakdowns share `_outcome_counts`. Campaign breakdown counts stored outcomes only (no events) and is left as is on purpose. |
| DUP-05 daily limits | The unused global default was removed. Limits come from the campaign safety policy and the platform caps in settings. |
| DUP-06 API aliases | The old `/matching/weights` URLs are marked deprecated and kept for existing clients. |
| DUP-07 profile write paths | `PUT /profile` now saves lists too; the granular endpoints remain for small edits. |
| DUP-08 experience months | `total_experience_months` is entered by the user; it is not derived from the experience list. |
| DUP-09 workflow vs outcome | `workflow_state` is set by the system; `outcome_status` by the user or platform events; `application_events` is the history of both. |
| DUP-10 run vs execution | The run is the live view, the campaign execution is the stored owner of counters; they are synchronised only through `application/automation/execution_sync.py` (pause/resume/stop and the final sync). At start-up, executions and runs a dead process left active are ended (`recover_interrupted_*`). |
| DUP-11 apply use case | One factory (`app/application/applications/factory.py`). |
| DUP-12 repeated UI pieces | Helpers moved out of the applications page; further shared components are future work. |
| DUP-13 encryptor alias | One name: `session_encryptor`. |
| DUP-14 start/stop buttons | Not duplicates. Kept. |

## Layer rule for browsers, adapters and storage (ARC-01)
The application layer imports nothing from `app.infrastructure`; `tests/unit/test_architecture_rules.py` enforces it.
- Browser manager, trace manager, adapter registry, embedding service and run storage are reached through `app/application/runtime.py`.
- `app/infrastructure/bootstrap.py` registers the real ones when the app starts.
- Run, event and heartbeat storage lives in `SqlRunPersistence`; the dashboard and analytics queries live in `infrastructure/database/read_models/`.
- Resume and reconcile start browser work in the background through `DeferredExecuteUseCase`; `?wait=true` runs it inside the request.

## Frontend routes and pages

Six areas: Home, Jobs, Applications, Automation, Insights, Settings. One `h1` per page.

- Jobs: one page with three lenses (`/jobs`, `/jobs/matches`, `/jobs/matches?lens=review`). The selection survives lens changes. The lens is a UI layer over `GET /jobs` and `GET /jobs/matches`.
- Settings: `/settings/profile`, `/settings/resumes`, `/settings/preferences`, `/settings/connections`, `/settings/account`.
- Automation: campaign rules, safety and activity are stacked sections with a jump bar, not tabs.
- Insights: `?view=overview|breakdowns|scoring`; older `?view=sources|resumes|campaigns|skills` open Breakdowns at that section.
- Application status shown to the user (`display_status`, `needs_attention`) is computed on the server in `domain/applications/display_status.py`; the frontend only falls back to a local copy if the field is missing.

## Job-specific resume tailoring

- Domain: `app/domain/resume_tailoring/` (document map, edit plan, integrity rules, status machine, ports).
- Application: `app/application/resume_tailoring/` (`TailoringService`, analysis, generation). It talks to the DB, files and AI only through ports.
- Infrastructure: `app/infrastructure/documents/` (DOCX map, run-level editor, fidelity checks, LibreOffice layout check), `infrastructure/ai/tailoring_ai.py`, `tailored_resume_repository.py`.
- Worker: `app/workers/tailoring_worker.py` (lease-based, retries, hourly draft expiry).
- API (`app/api/v1/tailoring.py`): `POST /jobs/{id}/tailor`, `GET /jobs/{id}/tailored-resumes`, `GET|DELETE /tailored-resumes/{id}`, `POST .../answers|generate|save|cancel`, `GET .../download?format=docx|pdf`, `GET /tailored-resumes` (saved copies, summary rows), and `PUT /applications/{id}/resume-choice` (`use_tailored` true/false).
- The master resume is never modified. Applications pick the saved tailored copy for their job (`applications.tailored_resume_id`), and apply re-validates owner, job, status and file before using it.
- Frontend: `src/pages/jobs/tailor/` (dialog opened from the job drawer).
- Which file an application sends: `applications.tailored_resume_id` (saved copy) or the master. A copy saved after the application was created is attached at approve, retry and execute time (`application/applications/tailored_choice.py`), unless the user chose the master (`applications.tailored_opt_out`, migration 0009). The choice is editable only before the portal is touched or after a stop that allows a retry.
- When a saved posting has too little text (scraped listings often store only a snippet), the user can paste the job description in the dialog; it is stored on that request only (`tailored_resumes.job_description_override`, migration 0010) and the saved job is unchanged.
