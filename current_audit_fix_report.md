# Fix report for `current_audit.md`

Branch: `claude/autoapply-audit-reports` (commits are local; pushing needs GitHub write access).

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
- SEC-08 (tokens stay in browser storage until the deployment is fixed), DB-07 (weights stay in `saved_answers`), DUP-01, 02, 07..10, 14 (documented ownership).

## Still partial
- FE-02: the largest pages are smaller but still big (ApplicationCRM 1407 lines, DirectApply 1212, ProfileManager and JobDiscovery not split yet). Modals, pagination, activity tab and the safety tab are separate components.
- FE-04: icon-only buttons have labels; keyboard order and colour contrast were not checked in a browser.
- AUT-17: schedules are saved and restored, but when one fires it only logs. Starting unattended auto-apply is your decision.
- AI-03: weights unchanged on purpose. On the labelled set both the current weights (sum 1.10) and weights normalised to 1.0 rank perfectly (pairwise 1.0, correlation about 0.97). Normalising removes the 8% of jobs stuck at 100, but lowers every score by about 9%, so the 60/75/90 thresholds would have to be re-set. Run `python scripts/evaluate_matching.py` to repeat the comparison.

## Not verified here
- Docker build, real job platforms, real AI providers, Postgres.
