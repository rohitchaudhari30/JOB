# Fix report for `current_audit.md`

Original branch: `claude/autoapply-audit-reports` (merged earlier). The section "Update" below describes later work.

## Test results (run in this sandbox)
- Backend: 353 passed, 0 failed (includes the Chromium tests, run with the sandbox's pre-installed Chromium). The Postgres test is skipped.
- Frontend: type-check clean (with `noUnusedLocals` now on), 44 of 44 tests pass, production build works (main bundle 600 kB -> 252 kB).
- Not verified: Docker build, real job platforms, real AI providers, Postgres.

## Fixed (with tests unless noted)
| Phase | Findings |
|---|---|
| 0 | TST-01 test isolation |
| 1 | AUT-01..11, SEC-01..03, PRF-01, form answers no longer invented, COMP-01 (stealth is off by default and configurable) |
| 2 | SEC-04..07, 09..15, PRV-01 |
| 3 | DB-01..06 |
| 4 | AI-01, 02, 04..08; JOB-01, 03, 04, 05; ANA-01..05; CON-02, 03; PRF-02 |
| 5 | OPS-01, OPS-02, AUT-12..20, ARC-01, 02, 03, 05, 06, FE-01, 03, 05, JOB-02, CON-01 (session import), AI-03 (evaluation set), DUP-03, 04, 05, 06, 11, 12, 13 |
| 6 | ARC-01 finished (application layer imports nothing from infrastructure, enforced by a test), AUT-14 finished (`/resume` and `/reconcile` run in the background), AI-03 measured, DUP-12 (shared Pagination and EmptyState) |

## Fixed by choosing a default, written down in `docs/ARCHITECTURE.md`
- SEC-08 (still open, needs your decision: tokens stay in browser storage until the deployment is fixed), DB-07 (weights stay in `saved_answers`), DUP-01, 02, 07..10, 14 (documented ownership).

## Update (branch `claude/phase6-size-and-kit`, local, not pushed)

| Finding | State now | Evidence |
|---|---|---|
| FE-02 page size | **Done** | All files <= 400 lines; `npm run check:size` passes with 0 baselined files |
| FE-04 accessibility | **Done in Chromium** | axe: 0 violations on 9 pages (light and dark); `frontend/e2e/keyboard.py`: every tab stop on 9 pages has a visible focus outline and a name, the drawer takes focus and keeps it. Not tested: screen readers, Firefox, Safari |
| DUP-08 experience total vs history | **Done (hint only)** | `monthsFromHistory` + opt-in "Use this" hint beyond 6 months; never overwrites the typed value |
| DUP-12 shared UI | **Partly done** | Modal, Drawer, ConfirmDialog, StatusChip, Pagination, EmptyState, and 9 primary buttons use the kit. Many raw buttons with conditional classes are not converted |
| IMP-054 access control | **Done** | Pause/resume ownership hole found by a probe test and fixed; merged in PR #2 |
| One live run per user | **Done (SQLite)** | Partial unique index (migration 0006), 409 on conflict, start-up recovery of interrupted runs. **Postgres NOT VERIFIED** (could not be installed here; opt-in test exists) |

Tests at this point: frontend 146 vitest pass, tsc clean, build ok, browser smoke 63/63 with 0 uncaught page errors; backend 381 passed, 1 skipped (last full run, before the frontend-only changes).

## Later fixes (same branch)
- Campaign executions left active by a crash are now aborted at start-up (test added).
- DUP-10: one module (`execution_sync.py`) copies run state onto the execution; 6 tests.
- 89 raw buttons now have `type="button"` so none can submit a form by accident.
- The 102 console errors in the smoke run are blocked Google-font requests in this sandbox, not app errors (the proxy log shows fonts.googleapis.com refused).

## Decisions taken with industry-standard defaults, then built (same branch)
| Item | Decision | Built |
|---|---|---|
| SEC-08 tokens | Access token in memory, refresh token in HttpOnly SameSite=Strict cookie (scoped to `/api/v1/auth`, Secure outside dev), rotation, revocation, Origin check | Backend + frontend; 5 backend tests, 4 unit tests, browser check that nothing token-like is in storage |
| Q-02 / AUT-17 schedules | Schedules start runs. Enabling a schedule arms it (first run at its next slot). One live run per user, operating hours, daily limits and the approval band still apply. API schedules default to `auto_apply=false` (opt-in). Operator kill switch `SCHEDULED_RUNS_ENABLED`. | Found that the UI's campaign schedule was stored but never fired; added `workers/campaign_scheduler.py` (one-minute ticker, shared `launch_campaign_run`). 17 tests, mutation-checked |
| Q-03 matches volume | Server-side paging with total count; UI loads 100 at a time with "Load more" | Fixed a silent cut-off at 50. 2 backend, 2 unit, 2 browser checks |
| Q-08 Account | Change password (signs out every other session), download my data (allow-list, no secrets), delete account (already existed) | Migration 0007, 7 backend tests, 5 unit tests, 8 browser checks |
| Q-04 quick run, Q-05 mobile | Quick run stays as is; layout is responsive for full management (no horizontal scroll at 375/768 px, checked) | No code change |
| AI-03 thresholds | Not changed: score meaning needs a labelled evaluation first | Numbers above |

Latest checks: backend 420 passed, 1 skipped; frontend 156 unit tests, tsc clean, size ratchet ok, build ok; browser smoke 75/75 with axe 0 violations on 10 pages and 0 uncaught errors; keyboard check 0 issues on 10 pages.

## Still open
- DUP-01, 02, 07, 09: kept as separate scopes on purpose (see ARCHITECTURE.md); merging them would change behaviour.
- About 80 raw buttons are tabs, filter pills and icon buttons that do not fit the four Button variants; converting them needs new variants first.

- AUT-17 (needs your decision Q-02): schedules are saved and restored, but when one fires it only logs. Starting unattended auto-apply is your decision.
- AI-03: weights unchanged on purpose. On the labelled set both the current weights (sum 1.10) and weights normalised to 1.0 rank perfectly (pairwise 1.0, correlation about 0.97). Normalising removes the 8% of jobs stuck at 100, but lowers every score by about 9%, so the 60/75/90 thresholds would have to be re-set. Run `python scripts/evaluate_matching.py` to repeat the comparison.

## Not verified here
- Docker build, real job platforms, real AI providers, Postgres.
