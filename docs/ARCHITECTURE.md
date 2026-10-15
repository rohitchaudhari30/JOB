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
- **Login tokens (SEC-08):** kept in browser storage for now. Moving to HttpOnly same-site cookies needs the frontend and API on one site plus CSRF protection; plan it when deployment is fixed.
- **Matching weights (DB-07):** stay in `saved_answers` under the intent `matching_weights`. A dedicated table is worth it only when weights get versioned.
- **Browser stealth (COMP-01):** see `BROWSER_STEALTH_ENABLED` in `app/core/config.py`.
- **Schedules:** saved and restored, but firing only logs. Starting unattended auto-apply runs is a product decision.

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
| DUP-10 run vs execution | The run is the live view, the campaign execution is the stored owner of counters; they are synchronised when a run is paused, resumed or stopped. |
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
