# AutoApply UI/UX simplification and redesign plan (round 2)

| | |
|---|---|
| Status | **Planning only.** No application source, config, schema or dependency was changed to produce this document. |
| Repository state | `main` at `2bd7811` (merge of PR #3). Frontend: React 18.3, TypeScript 5.6, Vite 5.4, Tailwind 3.4, axios, lucide-react, vitest 2. Backend: FastAPI 0.143, SQLAlchemy 2.1 (async, SQLite), Alembic 1.20 (migrations 0001–0007), Playwright 1.63, APScheduler 3.11. |
| Date | 2026-10-19 |
| Relation to earlier docs | `redesig.md` (round 1 proposal and §28 implementation log), `improvement.md`, `current_audit.md`, `current_audit_fix_report.md`, `docs/ARCHITECTURE.md`. Round 1 is **implemented and merged**; this plan starts from the code as it now is and plans what is still confusing. |

**Evidence labels used throughout**

* **[V]** Verified in the source code (file named).
* **[M]** Measured in headless Chromium against the production build with every `/api/v1` call mocked (no backend, no side effects).
* **[S]** Suspected: needs a real browser session, real data or a real backend.
* **[P]** Proposal (a design recommendation, not a finding).
* **[B]** Blocked: could not be investigated here (reason given).

---

## 1. Executive summary

**State of the application.** [V] The round-1 redesign is in place: six primary items (Home, Jobs, Applications, Automation, Insights, Settings), real URLs with redirects for all 26 legacy paths, one run-state poller, one apply guard, a detail drawer for jobs and applications, and a shared UI kit (Button, Modal/side drawer, ConfirmDialog, StatusChip, EmptyState, Pagination). All files are under 400 lines. Browser checks (Chromium, mocked API) pass 75/75 with zero axe violations on 10 pages and no keyboard problems on 10 pages. The app is **no longer navigationally confusing at the top level**. What remains is confusion *inside* the workspaces and a handful of structural mismatches between what the backend can do and what the screens expose.

**The most important remaining problems** (details in §4):

1. **Jobs is still two screens pretending to be one.** [V] *Discover* has selection, a bulk "queue" bar and server paging; *AI matches* has none of those and only single apply. The same job can be acted on in two different ways. Merging them needs a backend change (a combined, paginated jobs-with-match query).
2. **There is no "save" or "dismiss" for a job anywhere.** [V] The backend has no such operation (`DELETE /jobs/{id}` is the only per-job mutation); "select" is a React `Set` that is lost on reload (`JobDiscovery.tsx:49`). The prompt's Journey A ("save or select") can only be "select, then queue" today.
3. **Application status is a guess in the browser.** [V] The backend has 28 workflow states and 8 outcome states; the UI collapses them to 7 labels in `applicationLogic.ts`, and two of the labels ("Already applied", "Company site") are derived by searching free text in `failure_reason`. A wording change in the backend silently changes what the user sees.
4. **At 320 px every page scrolls sideways.** [M] 11 of 11 pages overflow by 45 px at 320 px (top bar right-hand group, `Navbar.tsx:76`, plus a Recent-activity row on Home). 375 px and wider are clean.
5. **Thirty-one backend operations have no screen.** [V] About 6 are operational (health, heartbeat, lease reclaim), 5 are deprecated aliases, and ~20 are real capabilities users cannot reach: editing scoring weights, the API schedules, importing a platform session, per-item profile editing, fetching one job or one application. Each needs an explicit keep / expose / retire decision (§6, §15).
6. **Three levels of tabs remain in two places.** [V] Settings › Profile & resumes has seven in-page tabs under the Settings sub-navigation; Automation › Campaigns has three in-page tabs under its section tabs.
7. **About a third of controls are small.** [M] 93 of 303 interactive elements (31%) are under 32 px tall or wide at desktop widths (WCAG 2.2 AA minimum is 24 px; 32 px is this plan's comfort target). About 80 raw `<button>` elements are tabs, pills and icon buttons outside the shared kit.

**Design direction.** [P] Keep the six-item navigation and the visual language. Finish the job: one Jobs list with a lens switch and one selection model; a small, server-supplied *display status* for applications; flatten the two three-level tab stacks; fix the 320 px overflow and target sizes; add the missing shared primitives (Tabs/SegmentedControl, IconButton); and settle the ~20 unreachable capabilities one by one. No feature is removed; every existing capability has a destination in §6.

**What must happen before implementation.** Five product decisions (§15), one backend contract addition (display status), one backend query (jobs with matches), and a Postgres/Docker verification pass that this environment cannot do.

---

## 2. Repository and architecture findings

### 2.1 Frontend [V]

| Topic | Finding |
|---|---|
| Entry / shell | `main.tsx` → `App.tsx` (377 lines): sign-in screen, then shell = `Sidebar` + `Navbar` + `<main>`. Tab state is a string union `NavTab` (11 values: dashboard, discovery, matches, crm, direct_apply, schedules, live_console, analytics, profile, connections, account). |
| Routing | Custom History-API router in `utils/navigation.ts` (no react-router, decision Q-01). `TAB_TO_PATH` (11 canonical paths), `PATH_TO_TAB` (canonical + 26 legacy aliases), `getTabFromLocation`, `needsCanonicalRedirect`. Record deep links via `hooks/useRecordRoute.ts` (`/jobs/:id`, `/jobs/matches/:id`, `/applications/:id`). Filters in the URL via `useQueryParam` (`?status=`, `?q=`, `?view=`). |
| Navigation components | `Sidebar` (6 groups from `NAV_GROUPS`, run indicator), `SectionTabs` (real links for Jobs, Automation, Settings sub-views), `Navbar` (page title, run chip, notification bell, profile menu, theme toggle). |
| Pages (top level) | `Dashboard`, `JobDiscovery`, `AIMatches`, `ApplicationCRM`, `DirectApply`, `LiveAutomation`, `Analytics`, `ProfileManager`, `PlatformConnections`, `AccountSettings` (10 lazy-loaded). 89 `.tsx` and 45 `.ts` source files outside tests. |
| Shared UI kit | `components/ui/`: `Button` (primary/secondary/ghost/danger, sm/md, `loading`, default `type="button"`), `Modal` (focus trap, Esc, focus restore, `variant="right"` = side drawer), `ConfirmDialog`, `StatusChip`, `EmptyState`, `Pagination`. No Tabs, IconButton, Table, FormField or Select primitives. |
| Hooks | `useActiveRun` (one poller, 5 s live / 30 s idle, paused when tab hidden, WebSocket-debounced), `useJobActions` (evaluate, evaluate-all, queue), `useApplyReadiness`, `usePolling`, `useQueryParam`, `useRecordRoute`, `useUnsavedChanges`. |
| Data layer | `services/http.ts` (axios, in-memory access token, silent refresh on 401, queued concurrent retries), `services/endpoints/*.ts` (63 methods, merged into `api`), `services/ws.ts` (WebSocket with single-use ticket, reconnect with backoff). |
| Auth | Access token in memory; refresh token in an HttpOnly SameSite=Strict cookie scoped to `/api/v1/auth`; page start calls `/auth/refresh`. 401 → silent refresh → `auth:expired` event. |
| Styling | Tailwind 3.4, `darkMode: 'class'` (key `applyflow_theme`), CSS variables + semantic colours defined in `index.css`/`tailwind.config`, global `:focus-visible` ring, `prefers-reduced-motion` respected. Most pages still use literal Tailwind classes rather than tokens. |
| Tests / tooling | vitest (156 tests), tsc strict + `noUnusedLocals`, size ratchet (`npm run check:size`, limit 400, 0 baselined), Playwright + axe browser scripts in `frontend/e2e/` (`smoke.py` 75 checks, `keyboard.py`), not part of CI. |
| Real-time | `wsClient` connects after login; used to debounce run-state refresh and to feed `LiveTelemetryPanel`. Polling is the fallback. [S] Which WS message types the backend emits per run change was not verified (noted in `redesig.md` §28.1). |

### 2.2 Backend [V]

| Topic | Finding |
|---|---|
| Architecture | FastAPI with layered modules: `app/api/v1/*` (routers) → `app/application/*` (use cases, orchestrator, launch, execution sync) → `app/domain/*` (entities, state machines, contracts) → `app/infrastructure/*` (SQLAlchemy repositories, AI gateway, browser automation, connections). A test enforces that `application` imports nothing from `infrastructure`. |
| API surface | 94 operations (Appendix A): analytics 7, applications 13, auth 8, automation 10, campaigns 15, connections 5, dashboard 1, health 2, jobs 12 (incl. matches), matching (alias) 2, profile 9, resumes 7, websocket tickets 2, root 1. Public: root, health, readiness, login, register, refresh. Everything else requires a bearer token. |
| Ownership | Every record carries `user_id`; an access-control probe test (`test_access_control_probe.py`) walks the OpenAPI route table with a second user. |
| Domain model | `Application` has **two** state columns: `workflow_state` (system progress; 28 values incl. DISCOVERED, MATCHED, APPROVAL_REQUIRED, APPLYING, SUBMITTING, APPLIED, six PAUSED_*, RETRY_QUEUED, SUBMISSION_UNKNOWN, RECONCILIATION_REQUIRED, FAILED, SKIPPED, REJECTED, EXPIRED) and `outcome_status` (what happened at the employer; 8 values: NOT_SUBMITTED, UNKNOWN, SUBMITTED, RESPONDED, INTERVIEWING, OFFERED, REJECTED, ARCHIVED). `MatchResult` carries `match_score` (fit) and `recommendation_score` (priority) which must stay distinct. |
| Campaign model | `Campaign` (rule, safety policy, schedule, target resume, state DRAFT/SCHEDULED/RUNNING/PAUSED/COMPLETED/ARCHIVED) → `CampaignExecution` (stored owner of counters/status, one active per campaign by DB index) → `AutomationRun` (live view, one live per user by DB index) → `Application` rows. |
| Automation | `AutomationOrchestrator` holds live sessions in memory, persists run rows and events, enforces approval (REQUIRE_APPROVAL never auto-submits), daily/platform caps, operating window, quota reservations. Start-up recovery ends orphaned runs and executions. Two schedulers: `/automation/schedules` (API) and campaign schedules (UI), both now launch runs. |
| Live events | `automation_events` (sequence-numbered), `GET /automation/runs/{id}/events`, WebSocket stream, run telemetry frames. |
| Discovery / matching | `POST /jobs/discover` (background), `GET /jobs`, `POST /jobs/matches/{id}/evaluate`, `evaluate-all`, `GET /jobs/matches` (paged, `X-Total-Count`), weights endpoints, matching task queue. |
| Analytics | 7 read endpoints over applications/events; outcome rules in one table (`OUTCOME_RULES`). |
| Security | Strict secrets in non-dev, rate limits on auth, token revocation, password-change cut-off (`tokens_valid_after`), SSRF allow-list, upload limits, security headers. |
| Persistence | SQLite by default; Alembic 0001–0007; partial unique indexes for one-live-run and one-active-execution. [B] Postgres behaviour not verified here. |

### 2.3 Cross-layer relationships [V]

* Page → API map is Appendix B. The Applications page also calls `GET /jobs/matches` only to look up scores, so it sees at most the first 50 matches (and Jobs › Discover the same). [V]
* `useJobActions` is the single place that evaluates and queues; both Jobs views use it. The apply guard (`useApplyReadiness`) is shared. Queueing always goes through `POST /applications/batch-queue` with `auto_execute=false`. [V]
* Run control is split by scope on purpose: `/automation/runs/{id}/*` (a live run), `/campaigns/{id}/*` (a campaign and its execution), `/applications/{id}/stop|resume` (one application). Pausing a run also updates its execution via `execution_sync.py`. [V]
* **Same-looking, different purpose (verified not duplicates):** Match score vs Recommendation priority; run vs campaign execution; workflow_state vs outcome_status; Discover (all jobs, server paged) vs AI matches (evaluated jobs, score ordered).
* **Genuine overlaps:** `/jobs/matches/weights` = `/matching/weights` (deprecated alias); `POST /resumes` = `POST /resumes/upload`; `PATCH /resumes/{id}/default` = `POST /resumes/{id}/set-default`; `/ws/ticket` = `/api/v1/ws/ticket`; `/automation/schedules` (API) vs campaign schedule (UI) are two schedule stores that both fire; "Start profile run" (`POST /automation/start`) vs campaign Run (`/campaigns/{id}/launch`).

### 2.4 Areas not inspected

Not read line by line: the AI gateway and provider adapters, the Playwright platform adapters (Naukri/LinkedIn/ATS), the form-answering engine, `analytics_queries.py` SQL, Alembic baseline contents, Docker/nginx beyond `nginx.conf`, and every `.test.tsx` body. Coverage claims in this document apply to routes, pages, hooks, endpoints, domain state enums and the flows named above, not to those areas.

---

## 3. Existing page and feature inventory

Canonical URL → page. Every legacy path still redirects (`PATH_TO_TAB`). Backend calls per page are in **Appendix B**; the full backend operation list with "has a screen?" is **Appendix A**.

| # | URL | Page / view | User objective | Sections, tabs, filters and controls [V] | Access |
|---|---|---|---|---|---|
| 1 | `/home` | **Home** (`Dashboard`) | See what needs me and what happened | Header (Refresh, Live Console, Start Campaign) · Action required (alerts with deep links; Platform Health) · Operational command card (run progress, Open live run, Launch Auto-Apply) · Operational pulse (Applications today, Pipeline readiness, Connected platforms, Encrypted session tokens) · Top actionable matches (View all / Review in Jobs) · Recent application activity (Open Application CRM) | login |
| 2 | `/jobs` | **Jobs › Discover** (`JobDiscovery`) | Find jobs and queue them | Controls: platform select (LinkedIn, Greenhouse, Lever, Ashby, Workday, …), roles, locations, experience, Discover · Toolbar: search, posted-within chips (1 h / 24 h / 3 d / 7 d / all), "min fit" toggle, sort (freshness, newest) · List header: select all, select top 5/10, Clear all jobs (confirm) · Job card: select, evaluate, delete, open drawer, Apply · Selection bar: clear, launch queue · Server pagination · Readiness banner | login |
| 3 | `/jobs/:id` | Job detail drawer (`JobDetailDrawer`) | Understand fit, decide | Match score + decision, why-this-score, matched/missing skills, separate "Recommendation priority" (only when present), Evaluate, Queue | login |
| 4 | `/jobs/matches` | **Jobs › AI matches** (`AIMatches`) | See evaluated jobs best-first | Hero (Refresh, Evaluate all) · KPIs (total, auto-apply, review, strong, avg) · Toolbar: search, min-score presets, decision filter, sort (score, skills, semantic) · Grid of match cards (open drawer, Apply, link to Profile when fields missing) · Load more (100 per page, `X-Total-Count`) | login |
| 5 | `/jobs/matches/:id` | Match drawer | as #3 | same drawer | login |
| 6 | `/applications` | **Applications** (`ApplicationCRM`) | Track every application and resolve uncertain ones | Header (Refresh) · KPI cards · Toolbar: search, status chips (All + the derived statuses), filter panel · Secondary filters: company, min match %, date from / to · Table/row actions: open drawer, View match rationale, Approve, Reject, Verify (reconcile), Retry, expand failure reason, View screenshot · Modals: Rationale, Reconciliation (Confirm submitted / Mark not submitted and retry / Dismiss), Screenshot | login |
| 7 | `/applications/:id` | Application drawer | Evidence and next action for one application | Status, evidence (screenshot), Verify, View match, View screenshot | login |
| 8 | `/automation/campaigns` | **Automation › Campaigns** (`DirectApply`) | Configure and run a campaign | Header: campaign select, New campaign (modal), Stop execution, Delete (confirm; refused while RUNNING/PAUSED) · Preflight bar · Cockpit (run state, Open live run, connections link) · **Tabs:** Rules (`CriteriaCard`: roles, locations, sources, application mode AUTO/APPROVAL, freshness, min score, max applications, resume), Safety & schedule, Activity logs · Run / Pause / Resume / Stop | login |
| 9 | `/automation/campaigns/safety` | Campaigns › Safety & schedule tab (deep link) | Limits, operating window, timezone, schedule | Daily/hourly limits, cooldown, window start/end, timezone, schedule presets / cron / interval, active toggle | login |
| 10 | `/automation/live` | **Automation › Live run** (`LiveAutomation`) | Watch and steer the current run | Run header (view mode Split / Full viewport, Start profile run, Pause, Resume, Stop, Discover jobs link) · Browser viewport (live frame, fullscreen) · Telemetry panel (filters All / Matches / Applied / Discovery / Alerts, search, auto-scroll, event cards with expand) · OTP modal · Completion banner (to Applications) | login |
| 11 | `/insights` | **Insights** (`Analytics`) | Understand results | Date presets (Today, 7D, 30D, 90D, Custom, All time), Platform filter, Refresh · **Views:** Overview (funnel + AI status), Sources, Resumes, Campaigns, Skills, Scoring weights (read-only) | login |
| 12 | `/settings/profile` | **Settings › Profile & resumes** (`ProfileManager`) | Keep the data used on applications correct | Hero (completeness, Save, "ready for campaigns" link, unsaved-changes guard) · **7 in-page tabs:** Personal & contact · Skills matrix · Work experience · Compensation & notice · Preferences & visa · Resume library (upload, download, set default, delete) · Screening Q&A (saved answers) | login |
| 13 | `/settings/connections` | **Settings › Platform connections** | Connect, verify, disconnect platforms | Category filter (All / Job portals / Company ATS / Connected), per-platform card: Connect, Verify, Disconnect, status (CONNECTED, REAUTH_REQUIRED, SESSION_EXPIRED, …) | login |
| 14 | `/settings/account` | **Settings › Account** | Own my account | Change password (signs out other sessions), Download my data, Delete my account (password + confirm) | login |
| — | (global) | App shell | Orientation | Sidebar (6 items, run indicator) · Navbar (page title, run chip → Live run, notification bell with dismiss, profile menu → Profile / Campaigns, theme toggle) · Sign-in/register screen (with demo login in dev) | — |
| — | (global) | Dialogs | — | Modal (centre / right drawer), ConfirmDialog, RationaleModal, ReconciliationModal, ScreenshotModal, OtpModal, NewCampaignModal, delete-campaign, clear-jobs confirm, account-delete confirm | — |

**Secondary and hidden functionality found [V]:** unsaved-changes guard on Profile; deep-link alert URLs from the backend (`/settings/connections`); URL filters (`?status=`, `?q=`, `?view=`); readiness banners (missing resume / connection / profile fields) on Jobs and Campaigns; keyboard Esc/focus restore on all modals and drawers; notification polling with dismiss; reduced-motion handling; dark mode; WebSocket reconnect with backoff.

**Not present, although the product brief or earlier plans mention them [V]:**

* No **saved jobs / shortlist / dismiss**. The domain enum has `SHORTLISTED` but nothing outside `entities.py` uses it.
* No **global telemetry HUD**. `LiveTelemetryPanel` is rendered only inside `LiveAutomation.tsx` (lines 179, 224); the Navbar run chip merely opens the Live run page.
* No **breadcrumbs**, no **skip-to-content link**.
* No **in-app editing of scoring weights** (Insights shows them read-only).
* No **export of analytics** (the only export is Account › Download my data).

---

## 4. UX problems and root causes

Severity: **S1** blocks or misleads a user, **S2** causes avoidable effort or error, **S3** polish. Each row says which evidence label supports it.

### 4.1 Verified in code or measured

| ID | Sev | Problem | Evidence and affected code | Impact | Proposal (see §5–§8) |
|---|---|---|---|---|---|
| UX2-01 | S1 | **Jobs has two lists with different capabilities.** Discover has selection, select-top-N, bulk queue, server paging, delete; AI matches has single Apply only, client filtering on loaded rows. Same job, two apply paths, two filter vocabularies. | [V] `JobDiscovery.tsx` + `pages/jobs/SelectionBar.tsx` vs `AIMatches.tsx` + `pages/matches/MatchesGrid.tsx` (no selection). Both use `useJobActions`. | A user who finds a good job in AI matches cannot select several and queue them; must go back to Discover. | One Jobs list with a lens (All discovered / Matched / Needs review) and one selection bar. Needs a combined paginated jobs+matches query (§12). |
| UX2-02 | S1 | **No save or dismiss.** Selection lives in a `Set` in component state and is lost on reload. A job can only be selected, queued or deleted (deleting is global and permanent for that job). | [V] `JobDiscovery.tsx:49`; backend has only `DELETE /jobs/{id}`; `SHORTLISTED` unused. | Users cannot park or hide a job; "Clear all jobs" is the only way to reduce noise. | Decision needed (§15 Q-R2-01). If wanted: per-user job flag (`saved`, `dismissed`) + filters. Not in scope without approval. |
| UX2-03 | S1 | **Application status shown to the user is reconstructed in the browser.** 28 workflow states + 8 outcome states → 7 labels; "Already applied" and "Company site" come from substring search of `failure_reason`. | [V] `pages/applications/applicationLogic.ts` (`getDerivedStatus`), `utils/applicationHelpers.ts` (`DerivedStatus`); backend enums in `domain/applications/entities.py`. | A backend wording change silently changes labels; states such as PAUSED_OTP, APPROVAL_REQUIRED, SUBMITTING all collapse into "Pending" or other buckets, so "needs me" and "waiting on the system" look alike. | Server-supplied `display_status` + `needs_attention` (additive contract change, §12). UI keeps its labels but stops guessing. |
| UX2-04 | S1 | **Every page overflows sideways at 320 px** by 45 px. | [M] responsive matrix, 11/11 pages at 320 px; offenders: Navbar right-hand group (`Navbar.tsx:76`, avatar at x=365 in a 320 px viewport) and the Recent-activity row on Home. 375 px and wider: 0 overflow in 66 combinations. | Unusable on small phones (iPhone SE-class width is 320 px in some modes). | Collapse the top-bar actions into one overflow menu below 360 px; make list rows wrap (§8, §11). |
| UX2-05 | S2 | **31 backend operations have no screen.** ~6 operational, 5 deprecated aliases, ~20 real capabilities. | [V] Appendix A. Notable: `GET/POST /jobs/matches/weights` (weights cannot be edited), `/automation/schedules` (API schedules; the UI has the campaign schedule instead), `POST /connections/{platform}/import-session` (remote login flow for deployments where the server browser is not visible), `POST /profile/skills|experiences|educations` and deletes (UI saves everything with `PUT /profile`), `GET /jobs/{id}`, `GET /applications/{id}`, `POST /applications`, `POST /applications/{id}/execute`, `GET /automation/runs/{id}`, `POST /jobs/matches/batch-enqueue`, `GET /jobs/matches/tasks/count`. | Capabilities exist that users and support cannot reach; some matter for deployment (import-session). | Explicit keep / expose / retire list in §6 and §15. |
| UX2-06 | S2 | **Three nesting levels in two places.** Settings (primary) › Profile & resumes (section tab) › 7 in-page tabs; Automation › Campaigns › 3 in-page tabs (Rules / Safety & schedule / Logs) with Safety also reachable as its own URL. | [V] `SectionTabs.tsx`, `ProfileManager.tsx:179-186`, `campaigns/CampaignTabBar.tsx`, `navigation.ts` (`schedules` tab). | Users must remember which level a field lives on; Resume library (an upload) sits under Profile tab 6 of 7. | Flatten to two levels (§5). |
| UX2-07 | S2 | **Two schedule systems.** API schedules (`/automation/schedules`, in-memory + `automation_schedules`) and campaign schedules (`campaign_schedules`, shown in the UI). Both fire now. | [V] `workers/scheduler_worker.py`, `workers/campaign_scheduler.py`, `api/v1/automation.py`. | A user with both could get two starts per day (one live-run guard prevents overlap, but intent is unclear). | Decide one owner (§15 Q-R2-03). |
| UX2-08 | S2 | **"Start profile run" vs campaign Run.** Two ways to start a run with different inputs (`POST /automation/start` vs `POST /campaigns/{id}/launch`). | [V] `pages/live/RunHeader.tsx`, `pages/campaigns/CampaignCockpit.tsx`, `useCampaignLaunch.ts`. | A run without a campaign has no safety policy page and no logs tab. | §15 Q-R2-02 (round-1 Q-04 still open). |
| UX2-09 | S2 | **Jobs and Applications only see the first 50 matches** when they look scores up. | [V] `JobDiscovery.tsx`, `ApplicationCRM.tsx` call `api.listMatches()` with no paging. | With >50 matches, older jobs show no fit score in Discover and Applications. | Server-side join or per-id lookup (§12). |
| UX2-10 | S2 | **~31% of controls are smaller than 32 px**; ~80 raw buttons (tabs, pills, icon buttons) are outside the shared kit and styled one by one. | [M] 93/303 controls <32 px at 1280 px; [V] `grep "<button"` outside `components/ui`. | Mis-taps on touch; inconsistent hover/focus/disabled looks. | Add `Tabs`/`SegmentedControl` and `IconButton` primitives, enforce a 32 px minimum (§10). |
| UX2-11 | S3 | **Run controls appear in several places.** Pause/Resume/Stop exist on Live run and Campaign cockpit (different scopes: run vs execution); Home has links only. | [V] `RunHeader.tsx`, `CampaignHeader.tsx` (Stop execution), `CampaignCockpit.tsx`. | Acceptable by design (scope differs) but labels do not say which scope. | Label by scope: "Pause this run" vs "Stop campaign execution" (§9). |
| UX2-12 | S3 | **Every page builds its own header.** Each page has an `h1` (ten different header components: `DashboardHeader`, `MatchesHero`, `ApplicationsHeader`, `CampaignHeader`, `RunHeader`, `ProfileHero`, …) with different layouts and actions; Home's `h1` says "Dashboard" while the nav says "Home". | [V] `grep "<h1" src/pages`; `dashboard/DashboardHeader.tsx`, `navigation.ts`. | Orientation cost; page actions sit in different places on each page. | One `PageHeader` primitive with title, description and an actions slot (§10). |
| UX2-13 | S3 | **Marketing-style labels mix with task labels** ("Live Engine Ready", "Encrypted Session Tokens", "Top Actionable Job Matches", "Launch Auto-Apply"). | [V] `jobs/DiscoveryControls.tsx`, `dashboard/*`. | Slower scanning; unclear what is clickable. | Plain-label pass (§9). |
| UX2-14 | S3 | **No skip-to-content link; no breadcrumbs.** | [V] absence in `App.tsx`/`Sidebar.tsx`. Round-1 plan §17 proposed the skip link. | Keyboard users tab through the sidebar on every page. | Add skip link (§11). Breadcrumbs not needed at two levels. |

### 4.2 Suspected (needs a real session)

| ID | Sev | Concern | Why it is only suspected |
|---|---|---|---|
| UX2-S1 | S2 | Tables/cards may feel dense with realistic volumes (hundreds of applications, long job titles). | [S] All browser runs used one mocked record per list. |
| UX2-S2 | S2 | Live run page layout with a real streamed frame and long event lists may need vertical-space changes. | [S] No real frame stream available. |
| UX2-S3 | S3 | Dark-mode contrast with real data (axe passes on mocked pages only). | [S] |
| UX2-S4 | S2 | WebSocket message types for run changes may not match what `useActiveRun` listens for (polling covers it). | [S] noted since round 1. |
| UX2-S5 | S3 | Safari/Firefox rendering of sticky/overflow layouts. | [B] only Chromium available. |

### 4.3 Root causes

1. **Round 1 merged navigation, not components.** The Jobs section is one URL group with two page components and two data models; a real merge was deferred because it needs a backend query (§28.3 of `redesig.md`).
2. **The UI kit stops at dialogs and buttons.** No Tabs, IconButton, Table, FormField, PageHeader; each page therefore restyles those.
3. **The domain is richer than the screens.** The backend models states, schedules and per-item profile editing the UI never adopted; the UI compensates with browser-side heuristics (UX2-03).
4. **Capabilities were added after the screens were designed** (API schedules, import-session, weights), so the screen set has not been revisited since.

---

## 5. Proposed information architecture

**Decision [P]:** keep the six primary items and the current URLs. The earlier "Dashboard / Opportunities / Campaigns / Applications / Analytics / Settings" naming was weighed and **not adopted**: "Jobs" and "Insights" are already live, understood and bookmarked, and renaming would cost redirects for no new capability. Live Console remains a **dedicated live execution view** (a page under Automation) rather than an overlay, because it needs the full viewport for the browser frame; there is no global HUD to fold it into (§3).

```
Home                      /home                          (page)
Jobs                      /jobs                          (ONE list)
  ├ lens: All discovered  /jobs                          (filter, not a tab)
  ├ lens: Matched         /jobs?lens=matched             (alias: /jobs/matches → redirect)
  ├ lens: Needs review    /jobs?lens=review              (REQUIRE_APPROVAL matches)
  └ Job drawer            /jobs/:id                      (drawer; alias /jobs/matches/:id)
Applications              /applications                  (page; one filter bar)
  └ Application drawer    /applications/:id
Automation
  ├ Campaigns             /automation/campaigns          (page; campaign picker)
  │   └ in-page sections   Rules · Safety & schedule · Activity  (sections of one scroll page, not tabs; /automation/campaigns/safety scrolls to Safety)
  └ Live run              /automation/live               (page)
Insights                  /insights                      (page; segmented control for Overview | Breakdowns | Scoring)
Settings
  ├ Profile               /settings/profile              (personal, skills, experience)
  ├ Resumes & answers     /settings/resumes              (resume library, screening Q&A)
  ├ Preferences           /settings/preferences          (compensation, notice, visa, work mode)
  ├ Platform connections  /settings/connections
  └ Account               /settings/account
```

**Why this shape.**

* **Jobs becomes one list with a lens.** It removes the Discover / AI matches choice (UX2-01) without hiding either view: "All discovered" is today's Discover; "Matched" is today's AI matches (score-ordered, decision filter); "Needs review" is the REQUIRE_APPROVAL subset that today is buried in a decision filter. The discover controls (platform, roles, locations, experience) become a collapsible "Find new jobs" panel above the list. [P] Requires the combined query (§12) — until then the lens can be a presentation layer over the two existing queries.
* **Automation › Campaigns loses its in-page tab bar.** Rules, Safety & schedule and Activity become three stacked sections on one page with an in-page anchor list (a "jump to" row, not tabs), so Safety no longer needs its own tab id (`schedules`) and the deep link `/automation/campaigns/safety` scrolls to the section. Nesting drops from three levels to two (UX2-06). [P]
* **Settings splits the seven Profile tabs into three destinations** by user intent: *Profile* (who I am: personal, skills, experience), *Resumes & answers* (files and saved responses), *Preferences* (compensation, notice, visa, work mode). Each is a normal page with vertical sections and one Save. Two levels only: Settings › destination. [P]
* **Insights keeps its content,** replaces six equal tabs with a segmented control of three groups (Overview, Breakdowns = Sources/Resumes/Campaigns/Skills as sub-sections, Scoring weights) so the date presets and platform filter apply to everything that is shown. [P]
* **Applications, Home, Live run, Connections, Account** keep their page responsibilities; changes are inside the page (§8).

**Navigation requirements checklist**

| Item | Purpose / user task | Destination type | Consolidates | Why here |
|---|---|---|---|---|
| Home | "What needs me today?" | page | `/dashboard`, `/` | Entry point; read-only summary with deep links |
| Jobs | "Find and choose jobs" | page + drawer | `/jobs`, `/jobs/matches`, `/job-discovery`, `/ai-matches`, … | One decision space for discovery, fit and queueing |
| Applications | "Where does each application stand?" | page + drawer | `/applications`, `/crm`, `/application-crm` | Tracking and reconciliation need history and evidence |
| Automation › Campaigns | "Set up and start the robot" | page | `/automation`, `/auto-apply`, `/direct-apply`, `/schedule(s)` | Everything that configures a run |
| Automation › Live run | "Watch and steer now" | page | `/live-console`, `/live` | Needs the full viewport |
| Insights | "How is it going over time?" | page | `/analytics`, `/insights` | Historical, not operational |
| Settings › Profile / Resumes & answers / Preferences | "Keep my data right" | pages | `/settings`, `/profile`, `/candidate-profile` | Data used on every application |
| Settings › Platform connections | "Connect my accounts" | page | `/connections`, `/platform-connections` | Prerequisite for any run |
| Settings › Account | "Own my account" | page | new | Privacy and security |

**Legacy routes to preserve [V]:** all entries in `PATH_TO_TAB` (11 canonical + 26 legacy aliases tested in `src/tests/navigation*.test.ts`), plus `/jobs/matches`, `/jobs/matches/:id`, `/applications/:id`, `/automation/campaigns/safety`, `/settings`, `/settings/profile`. New paths (`/settings/resumes`, `/settings/preferences`, `?lens=`) are additive; the old Profile deep links (`/settings/profile`) must still open the Profile destination, and any link that used a Profile tab (for example the "ready for campaigns" link) must land on the right new destination. A redirect test per old path is a release gate (§14).

---

## 6. Current-to-proposed feature mapping (traceability matrix)

Every discovered feature has a destination or an explicit open decision. "Backend" lists the operation(s) the feature depends on and must stay unchanged unless §12 says otherwise.

### 6.1 Home

| Existing feature | Backend | Proposed location and interaction | Note |
|---|---|---|---|
| Refresh | `GET /dashboard/overview` | Page header action "Refresh" | unchanged |
| Live Console button | — | Run chip in top bar (already) + card link; remove duplicate header button | UX2-11 |
| Start Campaign button | — | Header primary action "Start campaign" → Automation › Campaigns | unchanged target |
| Action required (alerts, deep links) | overview.alerts (`action_url`) | Top section, one row per alert with one button | keep deep-link URLs stable |
| Operational command card (progress, Open live run, Launch Auto-Apply) | `GET /automation/active` | Single "Run status" card | label "Launch Auto-Apply" → "Start campaign" |
| Operational pulse (applications today, pipeline readiness, connected platforms, "Encrypted session tokens") | overview | KPI row; rename "Encrypted session tokens" → "Saved platform sessions" | wording only |
| Top actionable matches / View all / Review in Jobs | `GET /dashboard/overview` | "Best matches" card → `/jobs?lens=matched` | |
| Recent application activity / Open Application CRM | `GET /applications` | "Recent applications" card → `/applications` | fix 320 px row overflow (UX2-04) |

### 6.2 Jobs

| Existing feature | Backend | Proposed location and interaction | Note |
|---|---|---|---|
| Discover (platform, roles, locations, experience) | `POST /jobs/discover` | Collapsible "Find new jobs" panel on Jobs | background job; keep readiness guard |
| Search, posted-within chips, min-fit toggle, sort | `GET /jobs` | One filter bar for all lenses; sort options superset (freshness, newest, score) | |
| Select, select all / top 5 / top 10, clear | client | One selection model for every lens | persist? see Q-R2-01 |
| Queue / launch queue (bulk) | `POST /applications/batch-queue` | Selection bar (all lenses) | `auto_execute=false` stays |
| Evaluate one / evaluate all | `POST /jobs/matches/{id}/evaluate`, `/evaluate-all` | Row action + list-header action "Score all" | both via `useJobActions` |
| Delete one job / Clear all jobs | `DELETE /jobs/{id}`, `DELETE /jobs` | Row overflow menu "Delete…" (confirm); "Clear all jobs…" under list menu (confirm) | destructive: keep confirm |
| AI matches list, KPIs, min-score presets, decision filter, sort | `GET /jobs/matches` (+ `X-Total-Count`) | "Matched" lens + KPI strip + filters in the shared bar | paging via Load more until combined query exists |
| Apply (single) | `POST /applications/batch-queue` (one id) | Row primary action "Queue" | same as bulk |
| Match drawer, why-this-score, recommendation priority | (in list payload) | Job drawer (unchanged) | keep score vs priority separation |
| Readiness banner | client (profile/resume/connection) | Page top (unchanged) | |
| **Save / dismiss** | none | **Open decision Q-R2-01** | no backend today |
| `GET /jobs/{id}` | exists, unused | Use for drawer deep links when the id is not in the loaded page (fixes UX2 deep-link gap) | additive client use |
| `POST /jobs/matches/batch-enqueue`, `GET /jobs/matches/tasks/count` | exists, unused | Keep (worker queue); optionally surface "N jobs waiting to be scored" in the list header | Q-R2-05 |

### 6.3 Applications

| Existing feature | Backend | Proposed location and interaction | Note |
|---|---|---|---|
| KPI cards, status chips, search | `GET /applications`, `/applications/stats` | One filter bar; chips use server `display_status` | UX2-03 |
| Company, min match %, date range | client | "More filters" popover | URL-backed |
| Open drawer / deep link | (loaded list) | Drawer; use `GET /applications/{id}` when not in the loaded list | additive client use |
| Approve / Reject | `POST /applications/{id}/approve`, `/stop` | Row action for APPROVAL_REQUIRED only | state-driven (done in round 1) |
| Verify (reconcile) and modal (Confirm submitted / Mark not submitted and retry / Dismiss) | `POST /applications/{id}/reconcile` | Primary action for "Needs verification" only; modal unchanged | critical path, do not alter semantics |
| Retry, Resume | `POST /applications/{id}/retry`, `/resume` | Row action when supported by state | |
| View match rationale / screenshot evidence | (list payload), `GET /applications/{id}/screenshot` | Drawer "Evidence" section | |
| Failure reason expand | (payload) | Drawer detail | |
| `POST /applications`, `POST /applications/{id}/execute` | exist, unused | Keep as API/automation entry points; not exposed | Q-R2-05 |

### 6.4 Automation

| Existing feature | Backend | Proposed location and interaction | Note |
|---|---|---|---|
| Campaign picker, New campaign (modal), Delete (confirm) | `GET/POST/DELETE /campaigns` | Campaigns page header | delete refused while running (server) |
| Rules: roles, locations, sources, application mode, freshness, min score, max applications, resume | `PUT /campaigns/{id}` | Section 1 "What to apply to" | |
| Safety and schedule: limits, window, timezone, schedule preset/cron/interval, active toggle | `PUT /campaigns/{id}` (schedule/safety) | Section 2 "When and how fast" | schedule fires via ticker; state it on the page |
| Activity logs | `GET /campaigns/{id}/logs` | Section 3 "Activity" | |
| Preflight bar | client + `GET /connections`, `/resumes`, `/profile` | Sticky summary above the Run button | |
| Run / Pause / Resume / Stop (campaign) | `POST /campaigns/{id}/launch|pause|resume|stop` | Cockpit buttons labelled by scope | UX2-11 |
| Pacing | `GET /campaigns/{id}/pacing` | Cockpit tile | |
| "Start profile run" | `POST /automation/start` | **Open decision Q-R2-02** (keep as "Quick run" inside Campaigns, or retire) | |
| API schedules (`/automation/schedules` ×3) | exist, no UI | **Open decision Q-R2-03** | |
| `GET /campaigns/{id}`, `POST /campaigns/{id}/start`, heartbeats, lease reclaim | exist | Keep (API / worker) | not UI |
| Live run: view modes, fullscreen, Pause, Resume, Stop | `POST /automation/runs/{id}/pause|resume|stop`, `GET /automation/active` | Live run header (unchanged) | scope label "this run" |
| Telemetry filters, search, event cards, OTP, completion banner | `GET /automation/runs/{id}/events`, WebSocket | Unchanged; add "needs you" banner at top when paused for OTP/CAPTCHA | |
| `GET /automation/runs/{id}` | exists, unused | Keep (status by id) | |

### 6.5 Insights, Settings, shell

| Existing feature | Backend | Proposed location | Note |
|---|---|---|---|
| Date presets, platform filter, refresh | `GET /analytics/*` | One shared filter bar above all groups | |
| Funnel, AI status (Overview) | `/analytics/funnel`, `/ai-status` | Overview | |
| Sources, Resumes, Campaigns, Skills | `/analytics/sources|resumes|campaigns|skills` | Breakdowns group | |
| Scoring weights (read-only) | `/analytics/weights-tuning` | Scoring group | **editing** (`GET/POST /jobs/matches/weights`) is Q-R2-04 |
| Profile personal/skills/experience | `GET/PUT /profile` | Settings › Profile | granular endpoints (`/profile/skills|experiences|educations`) stay unused unless Q-R2-05 |
| Compensation, notice, visa, work mode | `PUT /profile` | Settings › Preferences | |
| Resume library (upload, download, set default, delete) | `POST /resumes/upload`, `GET /resumes/{id}/download`, `POST /resumes/{id}/set-default`, `DELETE /resumes/{id}` | Settings › Resumes & answers | aliases `POST /resumes`, `PATCH …/default` remain for compatibility |
| Screening Q&A | `GET/POST /profile/saved-answers` | Settings › Resumes & answers | |
| Completeness, unsaved-changes guard | client | Per-page Save bar | keep guard on every Settings page |
| Platform connections: filter, Connect, Verify, Disconnect | `POST /connections/{p}/connect|verify|disconnect` | Settings › Platform connections | |
| Import platform session | `POST /connections/{p}/import-session` | **Open decision Q-R2-06** (needed when the server browser is not visible to the user) | |
| Change password, export data, delete account | `POST /auth/change-password`, `GET /auth/me/export`, `DELETE /auth/me` | Settings › Account | done |
| Sign-in / register / logout | `/auth/*` | unchanged | demo login stays dev-only |
| Notification bell (list, dismiss) | `GET /applications` + alerts | Top bar | collapse into overflow menu < 360 px |
| Theme toggle | local | Top bar / Settings › Account | |
| Health / readiness / root | `/health`, `/health/ready`, `/` | ops only | no UI |

**Features with no destination:** none. **Explicit open decisions:** Q-R2-01 … Q-R2-06 (§15).

---

## 7. Simplified user journeys

Each journey lists the target path, the failure paths, and what the user can do next. Step counts are for the proposal [P]; "today" counts are from the inventory in §3 [V].

### Journey A: first-time setup
1. Register / sign in → Home shows a single "Finish setup" card (profile, resume, one platform connection) with one button per missing item.
2. Settings › Profile (personal, skills, experience) → Save. 3. Settings › Resumes & answers → upload, mark default. 4. Settings › Platform connections → Connect.
* **Failure:** upload rejected (type/size) → inline message with the allowed types, nothing lost; connection fails → the card shows the platform's reason and "Try again"; unsaved edits when navigating away → existing unsaved-changes guard on each Settings page.
* **Recovery:** every step is reachable from Home and from the Jobs readiness banner, so the user is never stranded.
* Today: the same data is spread over seven Profile tabs plus Connections (UX2-05, UX2-06).

### Journey B: find jobs and choose what to apply to
1. Jobs → "Find new jobs" (optional) → list refreshes. 2. Pick a lens (All / Matched / Needs review). 3. Open a row for the drawer (why this score, recommendation priority). 4. Select rows → "Queue N".
* **Failure:** discovery returns nothing or a platform is disconnected → empty state names the cause and links to Connections; queue fails for some jobs → a result summary lists which and why (the endpoint already returns per-job outcomes); score not yet computed → row shows "Not scored" with a "Score" action.
* **Recovery:** selection survives lens changes; nothing is applied until the user starts a run (`auto_execute=false` is preserved).
* Today: two lists, two selection models, two filter sets (UX2-01).

### Journey C: start and supervise an automated run
1. Automation › Campaigns → choose campaign → check rules → preflight bar says "Ready" or lists blockers → Run.
2. Live run opens (or the top-bar run chip) → watch; Pause / Resume / Stop are labelled "this run".
* **Failure:** blocker in preflight → Run disabled with the reason and a link to fix it; a run is already live → server returns the one-active-run conflict and the UI shows "A run is already active — open it"; OTP/CAPTCHA needed → banner at the top of Live run and a chip in the top bar; connection drops → existing reconnect and the events API as fallback.
* **Recovery:** after a server restart the run is marked interrupted by crash recovery and appears as such; the user can start again.
* Scheduled campaigns fire from the 60 s ticker only inside operating hours and are skipped when a run is live (§2.2); the page must say so next to the schedule control (no silent behaviour).

### Journey D: review applications and resolve problems
1. Home "Action required" or Applications → chip **Needs attention** (new, server-derived). 2. Row has one primary action chosen by state: Approve (approval required), Verify (needs verification), Retry (failed and retryable). 3. Drawer shows evidence (screenshot, failure reason, timeline).
* **Failure:** an action is no longer valid (state changed under the user) → server returns a conflict; UI refreshes the row and says what changed rather than a generic error; Verify has the confirmed/not-submitted/dismiss modal and never auto-resubmits.
* **Recovery:** every terminal state has either "Retry" or a clear "nothing to do".
* Today: the status chip is guessed from several fields in the browser (UX2-03).

### Journey E: understand performance and tune
Insights → one filter bar (dates, platform) → Overview → Breakdowns → Scoring. Weights are read-only here; editing is decision Q-R2-04. **Failure:** no data in range → empty state with the range shown and "Reset range".

### Journey F: account safety and data control
Settings › Account → change password (other sessions are signed out; the user is told), export data, delete account (typed confirmation). **Failure:** wrong current password → inline error without logging out; export fails → retry, nothing partial is downloaded. **Recovery:** password change does not lose local unsaved form data in other tabs because those are separate pages.

---

## 8. Workspace-by-workspace redesign plan

Common to all workspaces: use the shared `PageHeader` (new, §10) with title, one-line purpose, ≤1 primary action and an overflow menu; use `Tabs`/`SegmentedControl` (new) instead of hand-built tab bars; every list has loading, empty, error-with-retry states; minimum target 32 px (44 px for primary touch actions below 768 px); all destructive actions go through `ConfirmDialog`.

### 8.1 Home
* **Existing structure [V]:** header with Refresh / Live Console / Start Campaign; action-required, operational card, pulse KPIs, best matches, recent activity.
* **Verified issues:** duplicate Live Console entry points (UX2-11); recent-activity row overflows at 320 px (UX2-04); "Launch Auto-Apply" vs "Start campaign" naming; "Encrypted session tokens" wording.
* **Proposed layout [P]:** (1) Needs-you strip (alerts) (2) Run status card (3) KPI row (4) Best matches (5) Recent applications. Single primary action "Start campaign" (becomes "Open live run" while a run is active).
* **Consolidation:** one run entry point; Refresh moves to an icon button.
* **Features preserved:** all §6.1 rows.
* **Backend dependencies:** `GET /dashboard/overview`, `GET /automation/active`; none new.
* **Responsive:** stacks to one column below 768 px; KPI row wraps 2×2; no horizontal scroll at 320 px.
* **Acceptance:** at 320 px `scrollWidth ≤ innerWidth`; one primary button visible; each alert has a working deep link; axe 0 violations.

### 8.2 Jobs (Opportunities)
* **Existing [V]:** two sub-views (Discover, AI matches) with separate filters, selection and actions; drawer; readiness banner.
* **Verified issues:** UX2-01 (two lists), UX2-02 (no save/dismiss), drawer deep link only works for loaded rows, 320 px overflow.
* **Layout [P]:** header → readiness banner → "Find new jobs" collapsible → lens segmented control → single filter bar → list (table ≥1024 px, cards below) → sticky selection bar.
* **Consolidation:** one selection model, one filter bar, one set of row actions (Queue, Score, Open, overflow: Delete).
* **Actions:** Queue (primary), Score, Delete (confirm), Clear all (confirm, list menu).
* **Preserved:** all §6.2; MatchScore and RecommendationScore remain separate fields and separate labels; thresholds unchanged.
* **Backend:** `GET /jobs`, `GET /jobs/matches`, `POST /applications/batch-queue`, evaluate endpoints, `GET /jobs/{id}`; **new (optional) combined list** §12.
* **Responsive:** cards below 768 px with the primary action visible; selection bar anchored to the bottom.
* **Acceptance:** switching lens keeps selection and filters; `?lens=` and legacy `/jobs/matches[/:id]` URLs open the right view; queue never starts a run.

### 8.3 Applications
* **Existing [V]:** KPI cards, chips, search, extra filters, table, drawer, verify modal.
* **Verified issues:** UX2-03 (client-derived status), too many equal-weight row buttons (UX2-07), deep link needs the row in the loaded page.
* **Layout [P]:** header → one filter bar (search, status chips, More filters) → table/cards → drawer. One primary action per row by state; others in overflow.
* **Preserved:** all §6.3; Verify flow untouched.
* **Backend:** `GET /applications` with additive `display_status` and `needs_attention` (§12); `GET /applications/{id}`.
* **Responsive:** card list below 768 px, drawer becomes full screen.
* **Acceptance:** chip counts equal the server counts; a state that needs the user is always reachable via "Needs attention"; no client-side status derivation remains.

### 8.4 Campaigns (Automation)
* **Existing [V]:** campaign picker, tab bar (rules / safety / activity), cockpit, preflight, "Start profile run".
* **Verified issues:** UX2-06 nested tabs; UX2-11 ambiguous Pause/Stop scope; two overlapping schedule mechanisms (UX2-09).
* **Layout [P]:** header (picker, New) → preflight + Run → three sections with a jump-to row → cockpit pinned beside on ≥1280 px, above on small screens.
* **Preserved:** all §6.4; schedule semantics unchanged.
* **Backend:** campaign CRUD/launch/pause/resume/stop/pacing/logs; no change.
* **Responsive:** single column; Run stays reachable (sticky).
* **Acceptance:** `/automation/campaigns/safety` still scrolls to Safety; Run disabled with a reason whenever preflight fails; labels say "campaign" or "this run".

### 8.5 Live run (Live Console)
* **Existing [V]:** view modes, fullscreen, controls, telemetry, OTP dialog, completion banner.
* **Issues:** needs-you states are only visible inside the page; destructive Stop sits next to Pause.
* **Layout [P]:** unchanged canvas; add a "needs you" banner; Stop moves to a confirmed action separated from Pause/Resume.
* **Backend:** run endpoints, events, WebSocket ticket; none new.
* **Responsive:** telemetry below the frame under 1024 px; fullscreen kept.
* **Acceptance:** OTP/CAPTCHA state shows in the top-bar chip and in the page banner; Stop asks for confirmation. **OTP dialog in a real browser is NOT VERIFIED** in this sandbox.

### 8.6 Insights (Analytics)
* **Existing [V]:** six tabs, date presets and platform filter, funnel, breakdowns, read-only weights.
* **Issues:** filters appear to apply per tab (UX2-08); tab count vs content.
* **Layout [P]:** shared filter bar → segmented control (Overview | Breakdowns | Scoring) → sections.
* **Backend:** `GET /analytics/*`; none new.
* **Responsive:** charts collapse to tables/lists below 768 px.
* **Acceptance:** the active range and platform are shown on every group; empty range shows a reset; axe clean.

### 8.7 Settings
* **Existing [V]:** one Settings page with Profile (7 tabs), Connections, Account.
* **Issues:** UX2-05 (seven tabs), UX2-06 (nesting), save affordance differs per tab.
* **Layout [P]:** left nav (top tabs below 768 px) → Profile | Resumes & answers | Preferences | Platform connections | Account; one sticky Save bar per page with unsaved-changes guard.
* **Preserved:** all §6.5 rows; completeness meter appears on Profile.
* **Backend:** `GET/PUT /profile`, resumes, saved answers, connections, auth/account; none new.
* **Responsive:** single column; Save bar sticks to the bottom.
* **Acceptance:** each former Profile tab's fields appear in exactly one new destination (checked by a mapping test); old URLs redirect; no data loss on navigation.

---

## 9. Button, tab, menu and interaction mapping

Primary rule [P]: one primary action per page region; secondary actions as ghost buttons; destructive and rarely used actions in an overflow menu behind a confirmation.

| Control (today) | Location | Proposed label / type | Destination or effect | Enabled when | Confirmation | Feedback | Notes |
|---|---|---|---|---|---|---|---|
| Start Campaign | Home header | Primary "Start campaign" | Campaigns | always | none | navigation | becomes "Open live run" while live |
| Live Console | Home header + top bar | Secondary → remove duplicate | Live run | run active | none | — | keep top-bar chip only (UX2-11) |
| Launch Auto-Apply | Home card | "Start campaign" | Campaigns | ready | none | — | wording unified |
| Discover | Jobs | "Find jobs" | `POST /jobs/discover` | connected platform | none | progress + count | background |
| Queue / Apply | Jobs row, selection bar | Primary "Queue" | `POST /applications/batch-queue` | ≥1 selected, ready | none | per-job result toast | never auto-executes |
| Evaluate / Evaluate all | Jobs | "Score" / "Score all" | evaluate endpoints | jobs exist | confirm for all if >50 | progress | |
| Delete job / Clear all | Jobs | overflow | delete endpoints | row/list | yes (ConfirmDialog) | toast | destructive |
| Approve / Reject | Applications | state-driven | approve / stop | approval required | reject confirms | row refresh | |
| Verify | Applications | "Verify" | reconcile modal | needs verification | modal is the confirmation | row refresh | never auto-resubmits |
| Retry / Resume | Applications | overflow or primary by state | retry / resume | failed / paused | none | row refresh | |
| Run / Pause / Resume / Stop (campaign) | Campaigns cockpit | "Run campaign", "Pause campaign"… | campaign endpoints | by status | Stop confirms | status chip | scope in label |
| Pause / Resume / Stop (run) | Live run | "Pause run"… | run endpoints | by status | Stop confirms | banner | |
| New / Delete campaign | Campaigns | "New campaign" / overflow "Delete…" | create / delete | delete blocked while running | yes | toast | |
| Save | Settings pages | Primary "Save changes" | `PUT /profile` etc. | dirty | none | inline saved state | unsaved guard |
| Connect / Verify / Disconnect | Connections | per card | connection endpoints | by status | Disconnect confirms | card state | |
| Change password / Export / Delete account | Account | sections | auth endpoints | — | delete: typed confirm | toast | other sessions sign out |
| Notification bell | Top bar | icon button | list + dismiss | — | none | badge | <360 px: overflow |
| Theme toggle | Top bar | icon button | local | always | none | immediate | |

**Tabs:** all hand-built tab bars (Insights ×6, Profile ×7, Campaigns ×3, Jobs ×2) are replaced by the shared `Tabs` primitive with roving focus and `aria-selected`, or removed per §5. **Menus:** one overflow-menu primitive (button + popover, Esc closes, arrow keys). **Drawers/modals:** `Modal` stays; drawer uses `variant="right"`.

---

## 10. Design system proposal

**Existing [V]:** Tailwind 3.4 with `darkMode: 'class'`, `components/ui` (Button, Modal incl. right drawer, ConfirmDialog, EmptyState, Pagination, StatusChip). **Missing [V]:** Tabs, IconButton, PageHeader, FormField, Table, overflow menu, Toast pattern.

| Primitive | Purpose | Rules |
|---|---|---|
| `PageHeader` | Title, purpose line, ≤1 primary action, overflow | Replaces per-page headers (UX2-12); wraps at 320 px |
| `Tabs` / `SegmentedControl` | Switch views in a page | `role=tablist`, roving tabindex, arrow keys, URL-backed where a deep link exists |
| `IconButton` | Icon-only actions | Required `aria-label`, 32 px min target (44 px touch), tooltip |
| `FilterBar` | Search + chips + "More filters" | One per list, URL-backed state |
| `OverflowMenu` | Secondary/destructive actions | Esc closes, focus returns, items 32 px+ |
| `FormField` | Label, hint, error, required | `aria-describedby`, error text not colour-only |
| `DataList` | Table ≥1024 px, cards below | Same actions in both |
| `StatusChip` (exists) | State display | Server `display_status` map; text + icon, not colour only |

**Tokens [P]:** spacing 4/8/12/16/24/32; type scale 12/14/16/20/24; radius 6/10; semantic colours (success, warning, danger, info, neutral) defined for light and dark with ≥4.5:1 text contrast; focus ring 2 px offset, never removed. No new dependency is required.

**Migration rule [P]:** convert one page at a time; the 400-line size ratchet and axe gate stay on.

---

## 11. Resolution and accessibility plan

**Measured [V] (this sandbox, Chromium, mocked API):** 77 page × width combinations; only 320 px overflows horizontally (all 11 pages, 45 px), caused by the right-hand group in `Navbar.tsx` (~line 76) and the Home recent-activity row. 93 of 303 interactive controls were under 32 px at desktop widths.

| Width | Layout | Navigation | Key requirements |
|---|---|---|---|
| 320 | 1 column | bottom or hamburger; top-bar actions into overflow | no horizontal scroll; primary action ≥44 px |
| 375 | 1 column | same | same |
| 768 | 1–2 columns | collapsed nav | drawers full-width |
| 1024 | table appears | full nav | selection bar inline |
| 1280 | list + side panel | full nav | cockpit beside rules |
| 1440 | max content width ~1280 | full nav | no stretched lines |
| 1920 | centred, max width | full nav | no empty gutters beyond max |

**Accessibility [P]:** skip-to-content link (none today [V: not found in `Navbar`/`App`]); one `h1` per page (axe passes on 10 pages today); landmarks; visible focus; Tabs/Menu keyboard patterns; labels for every icon button; live region for toasts and run status; target size ≥32 px; contrast checked in both themes; reduced-motion respected.
**NOT VERIFIED here:** screen readers, Safari/Firefox, real touch devices, dark mode with real data, 200 % zoom/reflow on all pages.

---

## 12. Backend and data-integrity safeguards

**Principle:** the redesign is a front-end and read-model change. No state machine, score formula, idempotency key or migration is altered. Proposed additions are additive.

| Need | Proposal [P] | Safeguard |
|---|---|---|
| Server-owned application status (UX2-03) | Add `display_status` and `needs_attention` to the applications list/detail response, derived from `workflow_state` + `outcome_status` in one backend function | Old fields unchanged; contract test pins the mapping for all 28 × 8 values |
| One Jobs list | Optional `GET /jobs?include=match` (or a combined query) returning job + match + score fields, paginated with `X-Total-Count` | MatchScore and RecommendationScore stay separate fields; no change to evaluation; until built, lens is a UI layer |
| Deep link to unloaded rows | Use existing `GET /jobs/{id}`, `GET /applications/{id}` | No backend change |
| Save/dismiss | Decision Q-R2-01 — would need a table/column and migration | Migration reversible; default false |
| Schedules | Decision Q-R2-03 | One owner for scheduling; keep kill switch `SCHEDULED_RUNS_ENABLED`, `auto_apply=false` default |

**Must not change without a separate review:** idempotent batch-queue, one-active-run guard, reconcile semantics (never auto-resubmit), refresh-token rotation and revocation, `tokens_valid_after`, ownership checks on every resource, user-data export/delete scope.
**Data integrity checks to add:** every UI mutation maps to exactly one endpoint (Appendix B); the UI never derives state the server owns; selection and filters are client-only and never persisted server-side.
**NOT VERIFIED:** behaviour on Postgres (sandbox runs SQLite only), multi-process schedulers/crash recovery (single-process assumption documented).

---

## 13. Implementation roadmap

| Phase | Scope | Gate to exit |
|---|---|---|
| 0 | Decisions Q-R2-01…06; baseline screenshots (320/768/1280) and test counts | Decisions recorded |
| 1 | Design primitives (PageHeader, Tabs, IconButton, OverflowMenu, FilterBar) + 320 px overflow fix + skip link + 32 px targets | smoke, axe, keyboard, size ratchet, vitest green; matrix 0 overflow |
| 2 | Backend `display_status` / `needs_attention` + Applications filter bar and state-driven actions | contract test for all state pairs; no client derivation left |
| 3 | Settings split (Profile / Resumes & answers / Preferences) + redirects | field-mapping test; old URLs redirect |
| 4 | Campaigns sections (remove inner tabs), scope labels, Stop confirmation, needs-you banner | navigation tests; safety deep link works |
| 5 | Jobs single list (UI lens first, combined query second), shared selection, deep links via `GET /jobs/{id}` | selection persists across lenses; queue never executes |
| 6 | Insights shared filter bar + segmented control; Home consolidation | filters apply to all groups |
| 7 | Hardening: full responsive matrix, axe, keyboard, regression of legacy routes, docs update | all §14 checks pass |

Each phase ships on its own branch and PR, behind no feature flag unless a route change risks bookmarks (then add redirect first). Phases 3–6 are independent after Phase 1 and can be reordered.

---

## 14. Testing and acceptance criteria

* **Unit (vitest):** status mapping, filter URL state, selection model, tab keyboard behaviour, navigation/redirect table (every legacy path).
* **Backend:** contract test for `display_status` over all workflow/outcome pairs; existing 420 tests stay green; layering test stays green.
* **Browser (Playwright, mocked API):** extend `e2e/smoke.py` per page; run the 7-width matrix; axe per page; `keyboard.py` per new primitive.
* **Manual / NOT VERIFIED today:** real platforms, OTP/CAPTCHA, Postgres, Docker, Safari/Firefox, screen readers, dark mode with real data.
* **Global acceptance:** zero horizontal overflow ≥320 px; zero axe violations; every control ≥32 px; no feature lost (traceability matrix has no orphan); API contract diff limited to the two additive fields; no real application submitted by any test.

---

## 15. Risks and open questions

| ID | Question / risk | Options | Recommendation |
|---|---|---|---|
| Q-R2-01 | Save / dismiss jobs: none exists | (a) build with migration (b) skip, rely on min-score filter | (a) small column `jobs.user_state`; needs your approval |
| Q-R2-02 | "Start profile run" (quick run) overlaps campaigns | keep as "Quick run" / retire | keep until campaigns cover its use; decide with usage data |
| Q-R2-03 | Two schedule mechanisms (API schedules unreachable, campaign schedules live) | retire API schedules from UI scope / merge | campaign schedule is the single user-facing owner; leave API endpoints undocumented |
| Q-R2-04 | Edit scoring weights in UI | expose / keep read-only | keep read-only until score semantics are reviewed |
| Q-R2-05 | ~20 unreachable endpoints | expose / keep for API / retire | keep; list in Appendix A; retire only deprecated aliases after a deprecation window |
| Q-R2-06 | Import platform session in UI | expose / keep | needed if the server browser isn't visible to users; decide per deployment |
| R-1 | Route renames break bookmarks | | additive routes + redirect tests |
| R-2 | Combined Jobs query changes sorting/paging | | ship UI lens first |
| R-3 | Server-owned status mismatches old UI | | pin with contract test |
| R-4 | Scope creep | | one phase per PR with gates |

---

## 16. Final recommendation

Keep the six-area navigation and all URLs; spend the effort inside pages. Do Phase 1 first (shared primitives, 320 px fix, target sizes, skip link) because it is low-risk and removes most measured defects; then Applications server-side status (highest correctness value), then Settings and Campaigns flattening, then the single Jobs list. Do not change scoring, idempotency, reconcile or auth behaviour. Approve or reject Q-R2-01 to Q-R2-04 before Phase 5.

**Areas not inspected:** real-platform automation behaviour, AI provider output quality, Postgres/Docker deployment, Safari/Firefox, assistive technology, production data and logs, email/notification delivery, performance under load.

---

## Appendix A. Backend operations and UI callers [V]

| Method | Path | Auth | UI caller |
|---|---|---|---|
| GET | `/` | public | **no** — service root |
| GET | `/api/v1/analytics/ai-status` | auth | yes |
| GET | `/api/v1/analytics/campaigns` | auth | yes |
| GET | `/api/v1/analytics/funnel` | auth | yes |
| GET | `/api/v1/analytics/resumes` | auth | yes |
| GET | `/api/v1/analytics/skills` | auth | yes |
| GET | `/api/v1/analytics/sources` | auth | yes |
| GET | `/api/v1/analytics/weights-tuning` | auth | yes |
| GET | `/api/v1/applications` | auth | yes |
| POST | `/api/v1/applications` | auth | **no** —  |
| GET | `/api/v1/applications/applied-map` | auth | yes |
| POST | `/api/v1/applications/batch-queue` | auth | yes |
| GET | `/api/v1/applications/stats` | auth | yes |
| GET | `/api/v1/applications/{application_id}` | auth | **no** —  |
| POST | `/api/v1/applications/{application_id}/approve` | auth | yes |
| POST | `/api/v1/applications/{application_id}/execute` | auth | **no** —  |
| POST | `/api/v1/applications/{application_id}/reconcile` | auth | yes |
| POST | `/api/v1/applications/{application_id}/resume` | auth | yes |
| POST | `/api/v1/applications/{application_id}/retry` | auth | yes |
| GET | `/api/v1/applications/{application_id}/screenshot` | auth | yes |
| POST | `/api/v1/applications/{application_id}/stop` | auth | yes |
| POST | `/api/v1/auth/change-password` | auth | yes |
| POST | `/api/v1/auth/login` | public | yes |
| POST | `/api/v1/auth/logout` | auth | yes |
| GET | `/api/v1/auth/me` | auth | yes |
| DELETE | `/api/v1/auth/me` | auth | yes |
| GET | `/api/v1/auth/me/export` | auth | yes |
| POST | `/api/v1/auth/refresh` | public | yes — http.ts (raw axios) |
| POST | `/api/v1/auth/register` | public | yes |
| GET | `/api/v1/automation/active` | auth | yes |
| GET | `/api/v1/automation/runs/{run_id}` | auth | **no** —  |
| GET | `/api/v1/automation/runs/{run_id}/events` | auth | yes |
| POST | `/api/v1/automation/runs/{run_id}/pause` | auth | yes |
| POST | `/api/v1/automation/runs/{run_id}/resume` | auth | yes |
| POST | `/api/v1/automation/runs/{run_id}/stop` | auth | yes |
| GET | `/api/v1/automation/schedules` | auth | **no** —  |
| POST | `/api/v1/automation/schedules` | auth | **no** —  |
| DELETE | `/api/v1/automation/schedules/{schedule_id}` | auth | **no** —  |
| POST | `/api/v1/automation/start` | auth | yes |
| POST | `/api/v1/campaigns` | auth | yes |
| GET | `/api/v1/campaigns` | auth | yes |
| POST | `/api/v1/campaigns/executions/{execution_id}/heartbeat` | auth | **no** — worker/ops |
| POST | `/api/v1/campaigns/leases/reclaim` | auth | **no** — worker/ops |
| GET | `/api/v1/campaigns/{campaign_id}` | auth | **no** —  |
| PUT | `/api/v1/campaigns/{campaign_id}` | auth | yes |
| DELETE | `/api/v1/campaigns/{campaign_id}` | auth | yes |
| POST | `/api/v1/campaigns/{campaign_id}/heartbeat` | auth | **no** — worker/ops |
| POST | `/api/v1/campaigns/{campaign_id}/launch` | auth | yes |
| GET | `/api/v1/campaigns/{campaign_id}/logs` | auth | yes |
| GET | `/api/v1/campaigns/{campaign_id}/pacing` | auth | yes |
| POST | `/api/v1/campaigns/{campaign_id}/pause` | auth | yes |
| POST | `/api/v1/campaigns/{campaign_id}/resume` | auth | yes |
| POST | `/api/v1/campaigns/{campaign_id}/start` | auth | **no** —  |
| POST | `/api/v1/campaigns/{campaign_id}/stop` | auth | yes |
| GET | `/api/v1/connections` | auth | yes |
| POST | `/api/v1/connections/{platform}/connect` | auth | yes |
| POST | `/api/v1/connections/{platform}/disconnect` | auth | yes |
| POST | `/api/v1/connections/{platform}/import-session` | auth | **no** —  |
| POST | `/api/v1/connections/{platform}/verify` | auth | yes |
| GET | `/api/v1/dashboard/overview` | auth | yes |
| GET | `/api/v1/health` | public | **no** — ops / Docker health check |
| GET | `/api/v1/health/ready` | public | **no** — ops / readiness probe |
| GET | `/api/v1/jobs` | auth | yes |
| DELETE | `/api/v1/jobs` | auth | yes |
| POST | `/api/v1/jobs/discover` | auth | yes |
| GET | `/api/v1/jobs/matches` | auth | yes |
| POST | `/api/v1/jobs/matches/batch-enqueue` | auth | **no** —  |
| POST | `/api/v1/jobs/matches/evaluate-all` | auth | yes |
| GET | `/api/v1/jobs/matches/tasks/count` | auth | **no** —  |
| GET | `/api/v1/jobs/matches/weights` | auth | **no** —  |
| POST | `/api/v1/jobs/matches/weights` | auth | **no** —  |
| POST | `/api/v1/jobs/matches/{job_id}/evaluate` | auth | yes |
| GET | `/api/v1/jobs/{job_id}` | auth | **no** —  |
| DELETE | `/api/v1/jobs/{job_id}` | auth | yes |
| GET | `/api/v1/matching/weights` | auth | **no** —  |
| POST | `/api/v1/matching/weights` | auth | **no** —  |
| GET | `/api/v1/profile` | auth | yes |
| PUT | `/api/v1/profile` | auth | yes |
| POST | `/api/v1/profile/educations` | auth | **no** —  |
| DELETE | `/api/v1/profile/educations/{edu_id}` | auth | **no** —  |
| POST | `/api/v1/profile/experiences` | auth | **no** —  |
| DELETE | `/api/v1/profile/experiences/{exp_id}` | auth | **no** —  |
| GET | `/api/v1/profile/saved-answers` | auth | yes |
| POST | `/api/v1/profile/saved-answers` | auth | yes |
| POST | `/api/v1/profile/skills` | auth | **no** —  |
| GET | `/api/v1/resumes` | auth | yes |
| POST | `/api/v1/resumes` | auth | **no** —  |
| POST | `/api/v1/resumes/upload` | auth | yes |
| DELETE | `/api/v1/resumes/{resume_id}` | auth | yes |
| PATCH | `/api/v1/resumes/{resume_id}/default` | auth | **no** —  |
| GET | `/api/v1/resumes/{resume_id}/download` | auth | yes |
| POST | `/api/v1/resumes/{resume_id}/set-default` | auth | yes |
| POST | `/api/v1/ws/ticket` | auth | yes — ws.ts (raw fetch) |
| POST | `/ws/ticket` | auth | **no** — duplicate of /api/v1/ws/ticket (not called) |
---

## Appendix B. Page to backend calls [V]

| Workspace / view | Frontend files | Lines | Backend calls it makes (method path) |
|---|---|---|---|
| Home | 7 | 647 | `GET /applications`; `GET /connections`; `GET /dashboard/overview` |
| Jobs › Discover | 15 | 1912 | `DELETE /jobs`; `DELETE /jobs/{id}`; `GET /applications`; `GET /applications/applied-map`; `GET /connections`; `GET /jobs`; `GET /jobs/matches`; `GET /profile`; `GET /resumes`; `POST /applications/batch-queue`; `POST /jobs/discover`; `POST /jobs/matches/evaluate-all`; `POST /jobs/matches/{id}/evaluate` |
| Jobs › AI matches | 5 | 760 | `GET /jobs/matches` |
| Applications | 12 | 2184 | `GET /applications`; `GET /applications/stats`; `GET /applications/{id}/screenshot`; `GET /jobs/matches`; `POST /applications/{id}/approve`; `POST /applications/{id}/reconcile`; `POST /applications/{id}/resume`; `POST /applications/{id}/retry`; `POST /applications/{id}/stop` |
| Automation › Campaigns | 14 | 2100 | `DELETE /campaigns/{id}`; `GET /campaigns`; `GET /campaigns/{id}/logs`; `GET /campaigns/{id}/pacing`; `GET /connections`; `GET /profile`; `GET /resumes`; `POST /automation/start`; `POST /campaigns`; `POST /campaigns/{id}/launch`; `POST /campaigns/{id}/pause`; `POST /campaigns/{id}/resume`; `POST /campaigns/{id}/stop`; `PUT /campaigns/{id}` |
| Automation › Live run | 11 | 1716 | `GET /automation/active`; `GET /automation/runs/{id}/events`; `GET /profile`; `POST /automation/runs/{id}/pause`; `POST /automation/runs/{id}/resume`; `POST /automation/runs/{id}/stop`; `POST /automation/start` |
| Insights | 7 | 847 | `GET /analytics/ai-status`; `GET /analytics/campaigns`; `GET /analytics/funnel`; `GET /analytics/resumes`; `GET /analytics/skills`; `GET /analytics/sources`; `GET /analytics/weights-tuning` |
| Settings › Profile & resumes | 11 | 1706 | `DELETE /resumes/{id}`; `GET /profile`; `GET /profile/saved-answers`; `GET /resumes`; `GET /resumes/{id}/download`; `POST /profile/saved-answers`; `POST /resumes/upload`; `POST /resumes/{id}/set-default`; `PUT /profile` |
| Settings › Platform connections | 5 | 535 | `GET /connections`; `POST /connections/{id}/connect`; `POST /connections/{id}/disconnect`; `POST /connections/{id}/verify` |
| Settings › Account | 1 | 170 | `DELETE /auth/me`; `GET /auth/me/export`; `POST /auth/change-password` |
| App shell (sign-in, nav, bell, run chip) | 4 | 972 | `GET /auth/me`; `POST /auth/login`; `POST /auth/logout`; `POST /auth/register` |