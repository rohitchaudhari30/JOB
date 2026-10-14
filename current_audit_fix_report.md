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
| 1 | AUT-01..11 (durable writes, auto-submit policy, quotas, caps, run end events), SEC-01..03, PRF-01, form answers no longer invented |
| 2 | SEC-04..07, 09..15 (rate limits, token revocation, password rules, admin role, account deletion, headers, upload limits, log redaction), PRV-01 |
| 3 | DB-01..06 (Alembic migrations, CHECK constraints, resume snapshot, events pagination) |
| 4 | AI-01, 02, 04, 05, 06, 07, 08; JOB-01, 03, 04, 05; ANA-01..05; CON-02, 03; PRF-02 |
| 5 | OPS-01, OPS-02, AUT-12, 13, 16, 17, 18, 19, 20, ARC-06, FE-01, FE-03, FE-04 (partly), FE-05, DUP-03 (partly), DUP-11, DUP-13 |

## Partly done
- CON-01: the server now says clearly that it has no display; a remote login flow is not built.
- FE-04: aria-labels added to icon buttons that had a `title`; other icon-only buttons still need review.
- AUT-17: schedules are saved and restored, but when one fires it only logs. Starting a real run from a timer was left out on purpose (see decisions).
- AI-03: weights unchanged (they add up to 1.10, capped at 100). Needs an evaluation set first.
- DUP-03: one shared outcome list; other literals remain.

## Not done (and why)
| Finding | Reason |
|---|---|
| AUT-14, AUT-15, JOB-02 | Need a background job runner design (long browser work outside web requests). Best done together with ARC-05. |
| ARC-01, ARC-02, ARC-03, ARC-05 | Larger refactors across many files and tests; risky without browser/e2e coverage. |
| FE-02 | Splitting large pages is a refactor with no behaviour change; left for later. |
| DUP-01, 02, 04..10, 12 | Consolidation work that touches API contracts. |
| SEC-08 | Needs a deployment decision (cookies vs localStorage). |
| DB-07 | Audit says decide before building. |
| COMP-01 | Product and legal decision, not a code fix. |

## Decisions needed from you
1. Should a schedule start real auto-apply runs unattended?
2. Cookies (same-site deployment) or keep tokens in localStorage?
3. Browser stealth settings vs platform terms (COMP-01).
4. Password minimum (set to 8), rate-limit values, `ADMIN_EMAILS`, `SEED_DEMO_USER`.
