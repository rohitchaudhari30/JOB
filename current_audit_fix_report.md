# Fix report for `current_audit.md`

Branch: `claude/autoapply-audit-reports` (commits are local; pushing needs GitHub write access).

## Test results (run in this sandbox)
- Backend: 320 passed, 14 failed. All 14 failures need a Chromium browser that is not installed here (`test_platform_confirmation_and_concurrency` x9, `test_playwright_controlled_e2e` x5).
- Frontend: type-check clean, 26 of 26 tests pass, production build works (main bundle 600 kB -> 252 kB).
- Not verified: Docker build, real job platforms, real AI providers, Postgres.

## Fixed (with tests unless noted)
| Phase | Findings |
|---|---|
| 0 | TST-01 test isolation |
| 1 | AUT-01..11, SEC-01..03, PRF-01, form answers no longer invented, COMP-01 (stealth is off by default and configurable) |
| 2 | SEC-04..07, 09..15, PRV-01 |
| 3 | DB-01..06 |
| 4 | AI-01, 02, 04..08; JOB-01, 03, 04, 05; ANA-01..05; CON-02, 03; PRF-02 |
| 5 | OPS-01, OPS-02, AUT-12..20, ARC-01, 02, 03, 05, 06, FE-01, 03, 05, JOB-02, CON-01 (session import), AI-03 (regression set), DUP-03, 04, 05, 06, 11, 13 |

## Fixed by choosing a default, written down in `docs/ARCHITECTURE.md`
- SEC-08 (tokens stay in browser storage until the deployment is fixed), DB-07 (weights stay in `saved_answers`), DUP-01, 02, 07..10, 14 (documented ownership).

## Still partial
- FE-02: only the applications page helpers were split out; the big page components are unchanged.
- FE-04: icon-only buttons now have labels; other keyboard and contrast checks were not run (no browser).
- AUT-17: schedules are saved and restored, but when one fires it only logs.
- AI-03: weights unchanged; a ranking regression set now guards future changes.
- ARC-01: application code still imports some infrastructure modules (browser, adapters).
- DUP-12: shared UI components not extracted.

## Not verified here
- Docker build, real job platforms, real AI providers, Postgres, and the 14 Chromium tests (no browser installed).
