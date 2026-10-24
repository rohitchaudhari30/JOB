# 02. Page & Control Inventory

## Comprehensive Audit of Workspaces, Controls, Dynamic State & Edge Cases

This inventory documents all primary user-facing workspaces across AutoApply.ai, their underlying component hierarchies, data contracts, interactive controls, dynamic states, and failure behaviors.

---

### Workspace 1: Dashboard (`/home` -> `Dashboard.tsx`)

- **Primary Route / Tab**: `/home` (`activeTab === 'dashboard'`)
- **Key Components**:
  - `Dashboard.tsx`
  - `ActiveRunBanner.tsx`
  - Metric cards: "Confirmed Applied Today", "Effective Daily Limit", "Pipeline Conversion", "System Readiness"
  - `AttentionItemsCard`: Urgent alerts (expired platform tokens, failed submissions needing manual review)
  - `TopMatchesCard`: Top matching opportunities with direct link to OpportunityDrawer
- **Backend API Contracts**:
  - `GET /api/v1/dashboard/overview?client_tz=<IANA_TZ>`
  - `GET /api/v1/automation/active`
  - `GET /api/v1/health`
- **Dynamic Controls & Behaviors**:
  - `client_tz` is automatically detected from the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` and passed to the backend to calculate local midnight-to-midnight daily quota consumption.
  - Quick action buttons ("Launch Application Campaign", "Review Top Matches", "Manage Resumes") trigger navigation via canonical state pushes.
- **States Verified**:
  - *Normal / Data Loaded*: Renders metrics with visual sparklines and progress rings.
  - *Zero State*: If no applications exist, displays onboarding checklist with clear action buttons ("Upload Resume", "Connect Platform").
  - *Degraded / Offline*: Banner surfaces platform connection drops without crashing the dashboard.

---

### Workspace 2: Jobs & Search (`/jobs`, `/matches` -> `JobsWorkspace.tsx`)

- **Primary Route / Tab**: `/jobs` (`discovery`), `/matches` (`matches`)
- **Key Components**:
  - `JobsWorkspace.tsx`
  - `OpportunityDrawer.tsx` (Deep-dive drawer with tabs: "Overview", "Requirements", "Match Breakdown", "Tailor CV")
  - `JobCard.tsx` (Card layout with company, location, salary badge, dual score indicator)
  - `ResumeTailorDrawer.tsx` / `TailorModal.tsx` (ATS keyword optimization and reword suggestions)
  - `SafeExternalLink.tsx` (DEF-01: Validates HTTP/HTTPS before opening external posting)
- **Backend API Contracts**:
  - `GET /api/v1/jobs?limit=50&offset=0&search=...`
  - `GET /api/v1/matching/matches?limit=25&offset=0`
  - `POST /api/v1/matching/evaluate` (In-flight deduplication via `SingleFlightEvaluator`)
  - `POST /api/v1/tailoring/generate-plan`
  - `POST /api/v1/tailoring/apply-edits`
- **Dynamic Controls & Behaviors**:
  - **Match Evaluation**: `useJobActions.ts` enforces synchronous in-flight guard `evaluatingJobIds` to block duplicate button spamming.
  - **External Link Safety**: Validates schemes with native URL parser; renders non-clickable fallback or tooltip if link is malformed or internal.
  - **Resume Tailoring**: Renders structured diffs (Before vs After) with verified evidence quotes; disallows non-evidence additions (no hallucinated ATS keywords).

---

### Workspace 3: Automation Campaigns & Schedules (`/automation` -> `DirectApply.tsx`)

- **Primary Route / Tab**: `/automation`, `/schedules`
- **Key Components**:
  - `DirectApply.tsx`
  - Campaign creator dialog (role selection, platform targeting, salary filter, daily safety limits)
  - Recurring schedule manager (Cron / interval configuration, active toggle, pause/resume)
  - Single-worker active run indicator
- **Backend API Contracts**:
  - `GET /api/v1/campaigns`
  - `POST /api/v1/campaigns`
  - `POST /api/v1/campaigns/{id}/launch`
  - `GET /api/v1/campaigns/schedules`
  - `POST /api/v1/automation/start`
- **Dynamic Controls & Behaviors**:
  - Daily limit enforcement: Prevents creating or launching campaigns with daily application targets exceeding platform safety limits (AUT-06).
  - Mutex run guard: Rejects simultaneous runs with HTTP 409 Conflict.

---

### Workspace 4: Live Automation Console (`/live-console` -> `LiveAutomation.tsx`)

- **Primary Route / Tab**: `/live-console`
- **Key Components**:
  - `LiveAutomation.tsx`
  - `ConsoleLogViewer.tsx` (Virtualized log output with sequential replay)
  - Control bar: "Pause", "Resume", "Stop Run", "Emergency Abort"
  - Interactive browser screenshot / captcha challenge handler
- **Backend API Contracts**:
  - `GET /api/v1/automation/runs/{run_id}`
  - `GET /api/v1/automation/runs/{run_id}/events?after_seq=...`
  - `POST /api/v1/automation/runs/{run_id}/pause`
  - `POST /api/v1/automation/runs/{run_id}/resume`
  - `POST /api/v1/automation/runs/{run_id}/stop`
  - `WS /api/v1/ws/automation/{run_id}?ticket=...` (Single-use ephemeral ticket auth)
- **Dynamic Controls & Behaviors**:
  - Ephemeral ticket authentication prevents WebSocket hijacking; tickets expire in 60s and burn on connection.
  - Cursor-based event replay guarantees zero lost log messages on reconnect.

---

### Workspace 5: Platform Connections (`/connections` -> `PlatformConnections.tsx`)

- **Primary Route / Tab**: `/connections`
- **Key Components**:
  - `PlatformConnections.tsx`
  - Platform Cards: LinkedIn, Indeed, Naukri, Wellfound
  - Credential & Session modal (Encrypted storage state, 2FA prompt)
- **Backend API Contracts**:
  - `GET /api/v1/connections`
  - `POST /api/v1/connections/connect`
  - `POST /api/v1/connections/{id}/refresh-session`
  - `DELETE /api/v1/connections/{id}`
- **Security & Data Isolation**:
  - Session cookies and storage state are encrypted at rest using AES-256-GCM (`BrowserSessionModel.encrypted_storage_state`).
  - Passwords and plain-text credentials are never returned in GET payloads.

---

### Workspace 6: Applications CRM (`/crm`, `/applications` -> `ApplicationCRM.tsx`)

- **Primary Route / Tab**: `/crm`, `/applications`
- **Key Components**:
  - `ApplicationCRM.tsx`
  - Kanban Board & Tabular View (`WorkflowStateEnum`: DISCOVERED, QUEUED, APPLYING, APPLIED, FAILED, RETRYING)
  - Outcome status badges (`NOT_SUBMITTED`, `SUBMITTED`, `RESPONDED`, `INTERVIEWING`, `OFFERED`, `REJECTED`)
  - Application Detail Modal: Screenshot viewer, execution traces, answered questions audit
- **Backend API Contracts**:
  - `GET /api/v1/applications?status=...&outcome=...&page=...`
  - `GET /api/v1/applications/{id}`
  - `PATCH /api/v1/applications/{id}/outcome`
- **Dynamic Controls & Behaviors**:
  - Synchronous outcome state updates enforce valid state transitions.
  - Audit trail preserves exact question texts, confidence scores, and answer source (`SAVED_ANSWER` vs `AI_GENERATED`).

---

### Workspace 7: Insights & Analytics (`/analytics` -> `Analytics.tsx`)

- **Primary Route / Tab**: `/analytics`
- **Key Components**:
  - `Analytics.tsx`
  - Application Funnel Stage Chart (Discovered -> Qualified -> Submitted -> Responded -> Interview -> Offer)
  - Skill Demand & Gap Analysis widget
  - Platform Conversion matrix
- **Backend API Contracts**:
  - `GET /api/v1/analytics/funnel`
  - `GET /api/v1/analytics/skills`
  - `GET /api/v1/analytics/sources`
  - `GET /api/v1/analytics/resumes`

---

### Workspace 8: Profile & Resumes (`/profile`, `/resumes`, `/preferences` -> `ProfileManager.tsx`)

- **Primary Route / Tab**: `/profile`, `/resumes`, `/preferences`
- **Key Components**:
  - `ProfileManager.tsx`
  - Resume Manager: Upload dropzone (PDF/DOCX), Master Resume toggle, Tailored version history
  - Candidate Profile Form: Work experience, education, verified skills, target locations
  - Unsaved Changes Guard: `confirmLeave()` intercepts tab switching to prevent data loss
- **Backend API Contracts**:
  - `GET /api/v1/profile`
  - `PUT /api/v1/profile`
  - `GET /api/v1/resumes`
  - `POST /api/v1/resumes/upload` (Max 10MB limit, magic byte validation)
  - `DELETE /api/v1/resumes/{id}` (Preserves `resume_label_snapshot` in existing applications)

---

### Workspace 9: Account & Security Settings (`/account` -> `AccountSettings.tsx`)

- **Primary Route / Tab**: `/account`
- **Key Components**:
  - `AccountSettings.tsx`
  - Password Change Form (Current password, new password with zxcvbn/regex complexity check)
  - Data Export button (Downloads user-scoped JSON archive without credentials)
  - Danger Zone: "Delete Account & All Data" (Password confirmation required, irreversible CASCADE)
- **Backend API Contracts**:
  - `POST /api/v1/auth/change-password` (Invalidates all existing sessions by bumping `tokens_valid_after`)
  - `GET /api/v1/auth/export-data`
  - `POST /api/v1/auth/delete-account`
