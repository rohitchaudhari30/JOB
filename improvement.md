# AutoApply — Improvement Roadmap (redesign-aligned)

> Companion to [`redesig.md`](redesig.md). **Proposal only — nothing here is implemented.** Do not start Phase 0+ until the reports are approved.
> This file **replaces** the earlier A-/B-/…-letter roadmap; that work is complete or tracked in Appendix A. Findings `UX-xx`/`SUS-xx` are defined in `redesig.md` §10; `Q-xx` in §25.

**Legend.** Priority: P0 critical-path, P1 high, P2 medium, P3 low. Effort: S ≤1 day, M 2–5 days, L 1–3 weeks, XL >3 weeks. Phases follow `redesig.md` §23.

## 0. Summary table

| ID | Title | Class | Pri | Effort | Phase |
|---|---|---|---|---|---|
| IMP-001 | Replace hard-coded "Autopilot Active" with real run state | A | P0 | S | 0 |
| IMP-002 | Remove or wire dead sidebar badges | A | P2 | S | 0 |
| IMP-003 | Fix dashboard alert deep links (`/settings`) | A | P0 | S | 0 |
| IMP-004 | Unify brand name | A | P2 | S | 0 |
| IMP-005 | Fix sidebar width class and add mobile navigation | A | P1 | M | 0 |
| IMP-006 | Global visible focus ring and minimum text size | A | P1 | M | 0/1 |
| IMP-007 | Remove duplicate pollers | A | P1 | M | 1 |
| IMP-008 | Campaign delete UI and dead API cleanup | A | P2 | S | 4 |
| IMP-010 | Addressable routes + legacy redirect table | B | P0 | L | 1 |
| IMP-011 | New shell: 6-item nav, top bar, run chip | B | P0 | L | 1 |
| IMP-012 | Settings workspace (Profile & resumes, Connections) | B | P1 | L | 2 |
| IMP-013 | ReadinessBanner replaces scattered setup prompts | B | P1 | M | 2 |
| IMP-014 | Merge AI Matches into Jobs | B | P0 | XL | 3 |
| IMP-015 | Single apply/queue path with one `source` value | B | P1 | M | 3 |
| IMP-016 | Automation workspace: Campaigns + Live run, one control cluster | B | P0 | XL | 4 |
| IMP-017 | Remove hidden `schedules` tab | B | P1 | S | 4 |
| IMP-018 | Applications: drawer, state-driven row action, URL filters | B | P1 | L | 5 |
| IMP-019 | Insights polish (tabs, empty states) | B | P2 | M | 5 |
| IMP-020 | Design tokens and shared UI kit | B | P0 | L | 1 |
| IMP-021 | Frontend module architecture and page size limit | B | P1 | L | 1–5 |
| IMP-022 | Redesign test suite | B | P0 | M | 0–6 |
| IMP-030 | Make saved schedules actually launch | C | P1 | L | 4 |
| IMP-031 | Server-side pagination/filter for matches | C | P2 | M | 3 |
| IMP-032 | Router dependency (`react-router-dom`) | C | P2 | M | 1 |
| IMP-033 | Move tokens out of `localStorage` | C | P1 | L | — |
| IMP-034 | Account settings tab | C | P3 | L | — |
| IMP-040 | Command palette / keyboard shortcuts | D | P3 | M | 6 |
| IMP-041 | Saved filter views on Jobs | D | P3 | M | 6 |
| IMP-042 | Compact/comfortable density toggle | D | P3 | S | 6 |

Class: A confirmed defect · B redesign-required · C conditional · D optional. Frontend-only unless noted: IMP-030 (backend logic), IMP-031 (API contract), IMP-033 (cross-cutting), IMP-034 (backend). No DB migration is required by any item.


## 1. Confirmed defects (fix regardless of redesign)

### IMP-001 — Replace hard-coded "Autopilot Active" with real run state
- **Objective:** Never show a status the system does not know.
- **Current limitation / evidence:** `Sidebar.tsx:198-199` always renders a pulsing "Autopilot Active".
- **Proposed improvement:** Bind to `ActiveRun`/campaign state (`api.getActiveRun`); show "Idle" / "Run in progress" / "Paused". Pulse only when running, disabled under reduced motion.
- **Benefit:** Honest UI; removes false assurance.
- **Related finding:** UX-03 (see `redesig.md` §10.1, §11)
- **Priority:** P0 · **Effort:** S · **Phase:** 0
- **Dependencies:** none
- **Risks:** Low
- **Acceptance criteria:** Idle account shows Idle; running shows Running; no pulse when idle.
- **Verification:** Vitest render tests for 3 states.

### IMP-002 — Remove or wire dead sidebar badges
- **Objective:** No dead props.
- **Current limitation / evidence:** `totalMatches`, `activeApplications` never passed from `App.tsx`.
- **Proposed improvement:** Either supply real counts from existing overview data or delete the props.
- **Benefit:** Less dead code / useful counts.
- **Related finding:** UX-04 (see `redesig.md` §10.1)
- **Priority:** P2 · **Effort:** S · **Phase:** 0
- **Dependencies:** IMP-001
- **Risks:** Low
- **Acceptance criteria:** No unused props; if kept, counts equal API values.
- **Verification:** Unit test + tsc `noUnusedLocals`.

### IMP-003 — Fix dashboard alert deep links (`/settings`)
- **Objective:** Alert buttons must navigate somewhere meaningful.
- **Current limitation / evidence:** `dashboard_queries.py:227,245` emit `action_url="/settings"`; `resolveTab('settings')` falls to Dashboard.
- **Proposed improvement:** Add client-side mapping `/settings → connections` now (frontend-only); update backend URL when new routes exist.
- **Benefit:** "Reconnect Session" works.
- **Related finding:** UX-05 (see `redesig.md` §10.1, §22)
- **Priority:** P0 · **Effort:** S · **Phase:** 0
- **Dependencies:** none
- **Risks:** Low
- **Acceptance criteria:** Clicking Reconnect Session opens Connections.
- **Verification:** Vitest on mapping + manual click.

### IMP-004 — Unify brand name
- **Objective:** One product name.
- **Current limitation / evidence:** "ApplyFlow.AI" in login vs "AutoApply.ai" in titles (`App.tsx`, `navigation.ts`).
- **Proposed improvement:** Choose name (Q-06); centralise in one constant.
- **Benefit:** Consistency.
- **Related finding:** UX-11 (see `redesig.md` §10.1)
- **Priority:** P2 · **Effort:** S · **Phase:** 0
- **Dependencies:** Q-06
- **Risks:** Low
- **Acceptance criteria:** grep finds one brand string source.
- **Verification:** grep + test.

### IMP-005 — Fix sidebar width class and add mobile navigation
- **Objective:** Navigation usable on all viewports.
- **Current limitation / evidence:** `w-68` is not in Tailwind 3.4 default scale (no match in built CSS); zero responsive classes in `Sidebar.tsx`.
- **Proposed improvement:** Use defined width (`w-64`/token); collapse to drawer under 1024 px.
- **Benefit:** Predictable layout; mobile usable.
- **Related finding:** UX-12 (see `redesig.md` §17)
- **Priority:** P1 · **Effort:** M · **Phase:** 0
- **Dependencies:** none
- **Risks:** Medium (layout shift)
- **Acceptance criteria:** No horizontal scroll at 375 px; menu reachable by keyboard.
- **Verification:** Playwright viewport test + manual.

### IMP-006 — Global visible focus ring and minimum text size
- **Objective:** Basic accessibility.
- **Current limitation / evidence:** No `:focus-visible` in `index.css`; ≈157 uses of 9–10 px text.
- **Proposed improvement:** Add focus ring utility; raise minimum to 12 px; measure contrast.
- **Benefit:** Keyboard/low-vision usability.
- **Related finding:** UX-15, SUS-01 (see `redesig.md` §16, §17)
- **Priority:** P1 · **Effort:** M · **Phase:** 0/1
- **Dependencies:** IMP-020 (tokens) optional
- **Risks:** Visual drift
- **Acceptance criteria:** All interactive elements show focus; axe contrast clean.
- **Verification:** axe-core in Playwright.

### IMP-007 — Remove duplicate pollers
- **Objective:** One source of run state.
- **Current limitation / evidence:** `App.tsx` 5 s, Dashboard 15 s, DirectApply 5 s pacing; WS exists.
- **Proposed improvement:** `ActiveRunProvider` (WS first, polling fallback); pages consume it.
- **Benefit:** Fewer requests; consistent state.
- **Related finding:** UX-10 (see `redesig.md` §9, §18)
- **Priority:** P1 · **Effort:** M · **Phase:** 1
- **Dependencies:** IMP-020
- **Risks:** WS drop → stale UI (keep fallback)
- **Acceptance criteria:** One run-state poller in code; UI updates within 5 s of change.
- **Verification:** Test with mocked WS/poll; network log count.

### IMP-008 — Campaign delete UI and dead API cleanup
- **Objective:** UI matches capability.
- **Current limitation / evidence:** No UI for `DELETE /campaigns/{id}`; 13 unused client methods.
- **Proposed improvement:** Add confirmed delete in campaign detail; delete truly dead client methods or document as reserved.
- **Benefit:** Users can remove campaigns; smaller client.
- **Related finding:** UX-13 (see `redesig.md` §19)
- **Priority:** P2 · **Effort:** S · **Phase:** 4
- **Dependencies:** IMP-016
- **Risks:** Delete of running campaign → block
- **Acceptance criteria:** Delete disabled while RUNNING; others confirmed.
- **Verification:** Integration + vitest.


## 2. Changes required for the redesign

### IMP-010 — Addressable routes + legacy redirect table
- **Objective:** Deep links, back/forward, shareable state.
- **Current limitation / evidence:** No router; sub-tabs are `useState`.
- **Proposed improvement:** Implement route table (§12, §22); legacy map; `navigate()` helper accepting old tab ids.
- **Benefit:** Enables every other change.
- **Related finding:** UX-01 (see `redesig.md` §12, §22)
- **Priority:** P0 · **Effort:** L · **Phase:** 1
- **Dependencies:** Q-01
- **Risks:** Regressions in navigation
- **Acceptance criteria:** Every legacy URL redirects; sub-tab and filter state survive reload.
- **Verification:** Redirect table test; manual back/forward.

### IMP-011 — New shell: 6-item nav, top bar, run chip
- **Objective:** Goal-oriented IA.
- **Current limitation / evidence:** 9+1 tabs, feature-oriented.
- **Proposed improvement:** Home · Jobs · Applications · Automation · Insights · Settings; global run chip.
- **Benefit:** Simpler navigation.
- **Related finding:** UX-02, UX-06 (see `redesig.md` §12)
- **Priority:** P0 · **Effort:** L · **Phase:** 1
- **Dependencies:** IMP-010, IMP-007
- **Risks:** Muscle-memory change
- **Acceptance criteria:** Nav has 6 items; run chip reflects state.
- **Verification:** Component + e2e tests.

### IMP-012 — Settings workspace (Profile & resumes, Connections)
- **Objective:** Single place for configuration.
- **Current limitation / evidence:** Profile (1430 lines) and Connections (505) are top-level.
- **Proposed improvement:** Move into Settings tabs; split Profile into sections; unsaved-changes guard.
- **Benefit:** Cleaner nav; smaller files.
- **Related finding:** FE-02, UX-14 (see `redesig.md` §12, §14)
- **Priority:** P1 · **Effort:** L · **Phase:** 2
- **Dependencies:** IMP-010
- **Risks:** Large-file refactor
- **Acceptance criteria:** Parity checklist passes; file ≤300 lines each section.
- **Verification:** Characterisation tests before split.

### IMP-013 — ReadinessBanner replaces scattered setup prompts
- **Objective:** One consistent prerequisite check.
- **Current limitation / evidence:** ≥8 `onNavigate('connections'|'profile')` prompts.
- **Proposed improvement:** Shared component driven by profile/resume/connection data.
- **Benefit:** Less duplication; clearer onboarding.
- **Related finding:** §7 (see `redesig.md` §13)
- **Priority:** P1 · **Effort:** M · **Phase:** 2
- **Dependencies:** IMP-012
- **Risks:** Low
- **Acceptance criteria:** Only one prompt implementation; shows correct missing steps.
- **Verification:** Unit tests for combinations.

### IMP-014 — Merge AI Matches into Jobs
- **Objective:** One place to find, rank and choose jobs.
- **Current limitation / evidence:** `evaluateMatch`, `evaluateAllMatches`, `createApplication`, `listMatches` split across two pages.
- **Proposed improvement:** Jobs with lenses; shared filter bar/row/drawer; keep score semantics and labels unchanged.
- **Benefit:** Removes UX-08/09.
- **Related finding:** UX-08, UX-09 (see `redesig.md` §12.2, §14)
- **Priority:** P0 · **Effort:** XL · **Phase:** 3
- **Dependencies:** IMP-010, IMP-020, Q-03
- **Risks:** Dense page; scoring display regressions
- **Acceptance criteria:** No evaluate/apply control outside Jobs; MatchScore/RecommendationScore labels unchanged (snapshot).
- **Verification:** Snapshot + e2e J2.

### IMP-015 — Single apply/queue path with one `source` value
- **Objective:** Consistent application provenance.
- **Current limitation / evidence:** `createApplication` called with `'DASHBOARD'`/`'AI_MATCHES'`; batch path separate.
- **Proposed improvement:** Jobs row action uses one path; record origin page in `source` only if analytics needs it.
- **Benefit:** Consistent data.
- **Related finding:** UX-08 (see `redesig.md` §7)
- **Priority:** P1 · **Effort:** M · **Phase:** 3
- **Dependencies:** IMP-014
- **Risks:** Analytics by source changes
- **Acceptance criteria:** Analytics source breakdown unaffected (or migrated).
- **Verification:** Backend/analytics tests.

### IMP-016 — Automation workspace: Campaigns + Live run, one control cluster
- **Objective:** One owner for run control.
- **Current limitation / evidence:** Pause/Resume/Stop in Dashboard, Live Console (×2), campaign.
- **Proposed improvement:** Remove from Dashboard; collapse Live view modes to 2; campaign controls labelled by scope.
- **Benefit:** Removes UX-06/07.
- **Related finding:** UX-06, UX-07, SUS-06 (see `redesig.md` §12.1, §14)
- **Priority:** P0 · **Effort:** XL · **Phase:** 4
- **Dependencies:** IMP-007, IMP-010
- **Risks:** Operators lose shortcut (mitigated by chip)
- **Acceptance criteria:** Exactly one run-control cluster; OTP/resume works.
- **Verification:** E2E with mocked run + vitest.

### IMP-017 — Remove hidden `schedules` tab
- **Objective:** No duplicate surfaces.
- **Current limitation / evidence:** `schedules` renders DirectApply.
- **Proposed improvement:** Redirect to campaign Safety & schedule.
- **Benefit:** Simpler routing.
- **Related finding:** UX-02 (see `redesig.md` §22)
- **Priority:** P1 · **Effort:** S · **Phase:** 4
- **Dependencies:** IMP-010
- **Risks:** Low
- **Acceptance criteria:** `/schedules` redirects.
- **Verification:** Redirect test.

### IMP-018 — Applications: drawer, state-driven row action, URL filters
- **Objective:** Reduce 39 controls to a clear flow.
- **Current limitation / evidence:** Many icon-only controls; filters local.
- **Proposed improvement:** Drawer for detail/reconcile; one primary action per state; status filter in URL; keep reconcile semantics.
- **Benefit:** Easier triage.
- **Related finding:** UX-14, SUS-04 (see `redesig.md` §14)
- **Priority:** P1 · **Effort:** L · **Phase:** 5
- **Dependencies:** IMP-010, IMP-020
- **Risks:** Hide a needed action
- **Acceptance criteria:** All prior actions reachable; reconcile outcomes unchanged.
- **Verification:** Existing reconcile tests + e2e.

### IMP-019 — Insights polish (tabs, empty states)
- **Objective:** Consistent analytics UX.
- **Current limitation / evidence:** 729-line page, 4 buttons.
- **Proposed improvement:** Tabs, shared components, honest empty states.
- **Benefit:** Consistency.
- **Related finding:** — (see `redesig.md` §14)
- **Priority:** P2 · **Effort:** M · **Phase:** 5
- **Dependencies:** IMP-020
- **Risks:** Low
- **Acceptance criteria:** Axe clean; no behaviour change.
- **Verification:** Visual + axe.

### IMP-020 — Design tokens and shared UI kit
- **Objective:** One visual language.
- **Current limitation / evidence:** Raw slate/indigo classes; `tailwind.config.js` has only `brand`.
- **Proposed improvement:** CSS variable tokens, Button/Chip/Tabs/Drawer/Modal/FilterBar/ConfirmDialog; modal focus trap.
- **Benefit:** Consistency, a11y.
- **Related finding:** UX-15, UX-16, SUS-03 (see `redesig.md` §16)
- **Priority:** P0 · **Effort:** L · **Phase:** 1
- **Dependencies:** none
- **Risks:** Visual regressions
- **Acceptance criteria:** All new pages use kit only; contrast measured.
- **Verification:** Storybook-less unit tests + axe.

### IMP-021 — Frontend module architecture and page size limit
- **Objective:** Maintainable code.
- **Current limitation / evidence:** Five pages 1,200–1,400 lines.
- **Proposed improvement:** Feature folders; lint rule/CI check for >400-line components.
- **Benefit:** Maintainability.
- **Related finding:** UX-14, FE-02 (see `redesig.md` §18)
- **Priority:** P1 · **Effort:** L · **Phase:** 1–5
- **Dependencies:** IMP-020
- **Risks:** Refactor risk
- **Acceptance criteria:** No page >300 lines; tests green.
- **Verification:** CI check.

### IMP-022 — Redesign test suite
- **Objective:** Safety net.
- **Current limitation / evidence:** 44 vitest, no e2e/axe.
- **Proposed improvement:** Route, nav, a11y smoke (Playwright+axe), snapshot for score labels.
- **Benefit:** Prevent regressions.
- **Related finding:** — (see `redesig.md` §21, §24)
- **Priority:** P0 · **Effort:** M · **Phase:** 0–6
- **Dependencies:** IMP-010
- **Risks:** Flaky e2e
- **Acceptance criteria:** Suite in CI.
- **Verification:** CI run.


## 3. Conditional improvements (need a decision)

### IMP-030 — Make saved schedules actually launch
- **Objective:** Schedules must do what they say.
- **Current limitation / evidence:** Schedules persisted/restored but firing only logs (AUT-17); no UI uses `/automation/schedules`.
- **Proposed improvement:** If approved (Q-02): fire `launchCampaign` under safety policy; else hide UI.
- **Benefit:** Honest scheduling.
- **Related finding:** AUT-17 (see `redesig.md` §19)
- **Priority:** P1 · **Effort:** L · **Phase:** 4
- **Dependencies:** Q-02, IMP-016
- **Risks:** Unattended real submissions
- **Acceptance criteria:** Scheduled run starts one execution inside caps; idempotent.
- **Verification:** Integration with fake clock.

### IMP-031 — Server-side pagination/filter for matches
- **Objective:** Scale.
- **Current limitation / evidence:** Matches filtered client-side (unverified, Q-03).
- **Proposed improvement:** Add query params if volume warrants.
- **Benefit:** Performance.
- **Related finding:** SUS (Q-03) (see `redesig.md` §19, §20)
- **Priority:** P2 · **Effort:** M · **Phase:** 3
- **Dependencies:** Q-03
- **Risks:** Contract change
- **Acceptance criteria:** P95 list <500 ms at agreed volume.
- **Verification:** Perf test.

### IMP-032 — Router dependency (`react-router-dom`)
- **Objective:** Reduce custom routing code.
- **Current limitation / evidence:** Hand-rolled `history` logic.
- **Proposed improvement:** Adopt only if approved (Q-01).
- **Benefit:** Standard patterns.
- **Related finding:** UX-01 (see `redesig.md` §18)
- **Priority:** P2 · **Effort:** M · **Phase:** 1
- **Dependencies:** Q-01
- **Risks:** New dependency
- **Acceptance criteria:** Parity with IMP-010.
- **Verification:** Tests.

### IMP-033 — Move tokens out of `localStorage`
- **Objective:** Reduce XSS blast radius.
- **Current limitation / evidence:** Tokens in `localStorage` (`api.ts`).
- **Proposed improvement:** httpOnly cookie + CSRF, or document accepted risk.
- **Benefit:** Security.
- **Related finding:** carry-over SEC-08 (see `redesig.md` §21)
- **Priority:** P1 · **Effort:** L · **Phase:** —
- **Dependencies:** user decision
- **Risks:** Auth flow change
- **Acceptance criteria:** No token readable by JS.
- **Verification:** Security tests.

### IMP-034 — Account settings tab
- **Objective:** Self-service account tasks.
- **Current limitation / evidence:** None in UI.
- **Proposed improvement:** Password change, logout everywhere, data export/delete.
- **Benefit:** Completeness.
- **Related finding:** Q-08 (see `redesig.md` §12)
- **Priority:** P3 · **Effort:** L · **Phase:** —
- **Dependencies:** backend support
- **Risks:** Privacy
- **Acceptance criteria:** As specified.
- **Verification:** Tests.


## 4. Optional features

### IMP-040 — Command palette / keyboard shortcuts
- **Objective:** Power-user speed.
- **Current limitation / evidence:** None.
- **Proposed improvement:** Cmd/Ctrl-K navigation and actions.
- **Benefit:** Efficiency.
- **Related finding:** — (see `redesig.md` —)
- **Priority:** P3 · **Effort:** M · **Phase:** 6
- **Dependencies:** IMP-010
- **Risks:** Low
- **Acceptance criteria:** Palette reaches all routes.
- **Verification:** Unit test.

### IMP-041 — Saved filter views on Jobs
- **Objective:** Reuse filters.
- **Current limitation / evidence:** Filters are ephemeral.
- **Proposed improvement:** Persist views per user (local first).
- **Benefit:** Convenience.
- **Related finding:** — (see `redesig.md` —)
- **Priority:** P3 · **Effort:** M · **Phase:** 6
- **Dependencies:** IMP-014
- **Risks:** Low
- **Acceptance criteria:** Views persist across reload.
- **Verification:** Test.

### IMP-042 — Compact/comfortable density toggle
- **Objective:** Preference.
- **Current limitation / evidence:** Single density.
- **Proposed improvement:** CSS variable-based density.
- **Benefit:** Comfort.
- **Related finding:** — (see `redesig.md` —)
- **Priority:** P3 · **Effort:** S · **Phase:** 6
- **Dependencies:** IMP-020
- **Risks:** Low
- **Acceptance criteria:** Toggle persists.
- **Verification:** Test.


## Appendix A — Legacy roadmap status (from the previous `improvement.md`)

| Legacy group | Topic | Status at `ed4ae9a` |
|---|---|---|
| A-01…A-08 | Containment (profile persistence, enum bugs, approval, fabricated answers, job deletion, demo account, secrets) | Implemented and merged (PR #1) |
| B-01…B-06 | Submission integrity, caps, uncertain outcomes, terminal events, resume/reconcile | Implemented |
| C-01…C-10 | Auth/security hardening | Mostly implemented; **C-05 token storage** open → IMP-033 |
| D-01…D-04 | Alembic, defaults, events pagination | Implemented (0001–0004) |
| E-01…E-07 | Matching quality, evaluation set, cache key | Implemented; weights sum 1.10 capped at 100 documented, not changed |
| F-01…F-08 | Discovery/analytics truthfulness | Implemented |
| G-01…G-07 | Layering, shared state | Implemented (runtime proxies, architecture test); single-process by design |
| H-01…H-03 | Frontend boundary/statuses/approval | Implemented; FE-02 (page size) open → IMP-021 |
| I-01…I-05 | Tests/CI/ops | Implemented; CI Node 22 fix; `frontend/Dockerfile` still `node:20-alpine` (unverified) |
| J-01…J-06 | Optional features | Not started |

The full previous text is available in git history (`git show ed4ae9a:improvement.md`).

## Appendix B — Backend/ops carry-over (from the paused re-audit; partial, not exhaustive)

| ID | Item | Evidence | Class |
|---|---|---|---|
| IMP-050 | Pin `pypdf` and `python-docx` versions | unpinned in requirements | Confirmed, S |
| IMP-051 | Align `campaign_safety_policies.timezone` server_default with model | one drift found | Confirmed, S |
| IMP-052 | DB-level guard for "one active run/execution" | none exists; app-level only | Conditional, M (migration) |
| IMP-053 | Verify concurrency on a non-SQLite engine before any move off SQLite | **NOT VERIFIED**: no PostgreSQL server could be installed here (pip and apt both refused). An opt-in test exists (`tests/integration/test_postgres_guards.py`, skipped unless `TEST_POSTGRES_URL` is set) but has never been run | Conditional |
| IMP-054 | Finish BOLA probe (id-based routes with a second user + anonymous) | done: probe covers every id route with user B and anonymous; found and fixed a pause/resume ownership hole (redesig.md §28.12) | Verification, M |
| IMP-055 | `frontend/Dockerfile` Node 22 | CI already on 22; Dockerfile unverified | Confirmed, S |

These were observed in the earlier adversarial pass, which was paused when the redesign request arrived. Treat them as leads, not fully reproduced defects, except where marked Confirmed.

## Appendix C — Implementation status

Local branch `claude/phase0-quick-fixes` (not pushed). See `redesig.md` §28 for decisions taken in place of the open questions.

| ID | Status |
|---|---|
| IMP-001, 002, 003, 005, 006 | **Done** (commit `cfd6073`) |
| IMP-004 | **Done** (brand = AutoApply, `utils/brand.ts`) |
| IMP-008 | **Partly done** — campaign delete UI added; dead client methods not removed; backend delete does not reject RUNNING/PAUSED campaigns (follow-up: enforce server-side) |
| IMP-010 | **Partly done** — routes + redirect table + tests; record-level deep links and URL-bound filters pending |
| IMP-011 | **Partly done** — 6-item nav + section tabs; top-bar run chip already existed (Navbar pill) |
| IMP-013 | **Partly done** — component built, used in Jobs › Discover only |
| IMP-014 | **Partly done** — shared actions hook, job drawer, `/jobs/:id` deep links, score util (see redesig.md §28.3). List views still two components |
| IMP-016 | **Partly done** — Dashboard controls removed; Live Console view-mode reduction and start-path consolidation pending |
| IMP-017 | **Done** — `/schedules` is a deep link to Campaigns › Safety & schedule |
| IMP-020 | **Started** — tokens only |
| IMP-022 | **Partly done** — route/nav/section/readiness tests; no e2e/axe |
| IMP-007, 012, 015, 018, 019, 021 | **Not started** |
| IMP-030…034, 040…042, 050…055 | **Not started** (need decisions or are optional) |

### Appendix C — update (second pass, local, not pushed)

| ID | Status now |
|---|---|
| IMP-007 | **Done** — `useActiveRun` + `usePolling` (tests: idle/active cadence, hidden tab, WS refresh) |
| IMP-013 | **Done** where applicable (Jobs › Discover, Jobs › AI matches, Campaigns) |
| IMP-015 | **Withdrawn** — apply paths already share one backend command; `source` is provenance. The real defect (AI Matches skipped readiness checks) is fixed |
| IMP-016 | **Mostly done** — duplicate view toggle and dead `LiveConsoleDrawer` removed; start-path consolidation waits on Q-04 |
| IMP-020 | **Started** — Button, StatusChip, Modal/Drawer, ConfirmDialog built and tested; page migration pending |
| IMP-014 | **Not done** — navigation-level merge only (see `redesig.md` §28.1) |

### Appendix C — update (third pass, local, not pushed)

| ID | Status now |
|---|---|
| IMP-006 | **Done and verified with axe** (labels, contrast, focus ring); 4 dimmed captions remain |
| IMP-008 | **Done** — server-side 409 guard + 12 dead client methods removed |
| IMP-010 | **Mostly done** — routes, redirects, record deep link (`/applications/:id`), URL filters on Applications and Insights. Jobs/campaign record routes not added |
| IMP-012 | **Partly done** — 2 of 7 profile tabs extracted; no unsaved-changes guard |
| IMP-018 | **Done** (drawer, deep link, URL filters). One-primary-action-per-state row redesign not done |
| IMP-019 | **Done** (tabs). Empty-state polish not done |
| IMP-021 | **Ratchet done**; Applications split 1,471→712 lines (redesig.md §28.4). DirectApply split 1,277→~660 (§28.5). Discovery 1,182→~640 (§28.6). Profile 1,004→~480 (§28.7) |
| IMP-022 | **Partly done** — 114 vitest tests + optional Chromium/axe smoke (`frontend/e2e/smoke.py`, not in CI) |
| IMP-050 | **Done** (pypdf/python-docx pinned) |
| IMP-051 | **Done** (model server_default + test) — redesig.md §28.11 |
| IMP-052 | **Done for campaign executions** (partial unique index, race handled, skip-if-duplicates); `automation_runs` not guarded — §28.11 |
| IMP-055 | **Done** (frontend image Node 22; not built here) |
| IMP-020 | **Partly done** — all dialogs now use the shared Modal (redesig.md §28.8); buttons/chips/tokens on older pages still local |
| Still open | IMP-014, 020 (migration), 030–034, 040–042, 051–054 |
| Profile unsaved-changes guard | **Done** (in-app nav + tab close; browser Back not covered) — §28.7 |
