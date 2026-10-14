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
