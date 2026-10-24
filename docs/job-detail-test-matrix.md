# AutoApply.ai — Job Detail & Resume Tailoring Forensic Test Matrix
**Document Version**: 2.0.0 (Remediated & Verified Release Matrix)  
**Scope**: Full interactive and API execution matrix for Job Detail Page, Drawer, Tailoring Dialog & Export  
**Date**: October 2026  
**Auditor**: Principal QA Architect & Automated Test Lead  

---

## 1. Test Matrix Summary & Reconciliation

* **Total Test Cases Planned**: 46
* **Total Test Cases Executed**: 45
* **Initial Passed**: 40
* **Initial Failed**: 5 (`TC-JD-007`, `TC-JD-010`, `TC-JD-012`, `TC-JD-014`, `TC-JD-016`)
* **Remediated & Verified (Post-Fix)**: **45** (100% of executed suite)
* **Active Defects Remaining**: **0**
* **Blocked (Safety Fenced)**: **1** (`TC-JD-046` Live third-party external job board submission)
* **Not Tested**: **0**
* **Not Applicable**: **0**

### Reconciliation & Remediation History
* **Header Arithmetic Reconciled**: The preliminary draft listed 42 passed / 3 failed due to combining UI layout findings under a single failure bucket. The matrix was strictly reconciled to reflect all 5 individual test failures (40 passed, 5 failed).
* **Live Submission Status**: Live external platform submissions were marked "0 Blocked" in the summary despite section 14 declaring live submissions fenced. This is formally tracked as `TC-JD-046` with status `BLOCKED (Safety Fenced)`.
* **Post-Remediation Verification**: All 5 failing test cases plus DEF-06 were remediated and verified with regression tests in `job_detail_remediation.test.tsx`, `url_safety.test.ts`, and `tailor_dialog.test.tsx`. Current passing rate is 45/45 (100%).

---

## 2. Comprehensive Test Case Execution Matrix

| Test ID | Feature | Scenario | Preconditions | Steps | Expected Result | Actual Result | Status | Severity | Finding ID | Evidence / Automation Ref |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `TC-JD-001` | Drawer Lifecycle | Open drawer from Discovered Jobs table | Job list loaded | Click on job title in `JobCard` or table | `JobDetailDrawer` opens smoothly with job details populated | Drawer opens, title and company match record | **PASS** | — | — | `discovery_split.test.tsx` |
| `TC-JD-002` | Drawer Lifecycle | Close drawer via 'X' button | Drawer open | Click top-right close icon (`X`) | Drawer closes, DOM portal unmounts, focus restored | Drawer closes and active element regains focus | **PASS** | — | — | `jobs_merge.test.tsx` |
| `TC-JD-003` | Drawer Lifecycle | Close drawer via Escape key | Drawer open | Press `Escape` key | Topmost drawer closes; parent page intact | Drawer closes immediately | **PASS** | — | — | `ui_kit.test.tsx` |
| `TC-JD-004` | Drawer Lifecycle | Close drawer via backdrop click | Drawer open | Click outside drawer on dimmed backdrop | Drawer closes cleanly | Backdrop click triggers `onClose` | **PASS** | — | — | `ui_kit.test.tsx` |
| `TC-JD-005` | Tab Navigation | Switch to Skills Alignment tab | Drawer open | Click Quick Tab "Skill Alignment" | Active tab switches to verified and missing skills | Content transitions instantly without layout shift | **PASS** | — | — | `jobs_merge.test.tsx` |
| `TC-JD-006` | Tab Navigation | Switch to Full Job Description tab | Drawer open | Click Quick Tab "Job Description" | Employer posting text renders in scrollable container | Full description rendered cleanly | **PASS** | — | — | `jobs_merge.test.tsx` |
| `TC-JD-007` | Quick Tab ARIA | ARIA Tablist semantics | Drawer open | Inspect DOM of quick tabs container | Container has `role="tablist"`, buttons have `role="tab"` | Role `tablist`, `tab`, `aria-selected`, `aria-controls`, and arrow-key cycling fully implemented | **PASS** | — | `DEF-04` (Fixed) | `job_detail_remediation.test.tsx` |
| `TC-JD-008` | Match Fit | Unevaluated Job state | Match result is `null` | Open unevaluated job drawer | Displays "Opportunity not evaluated", shows "Calculate Fit Now" button | Correct empty/pending card displayed | **PASS** | — | — | `jobs_merge.test.tsx` |
| `TC-JD-009` | Match Fit | Evaluated Job score display | Match result present | Open evaluated job drawer | Indigo circle badge displays `{score}%`, recommendation tone matches decision | Score badge and decision chip match API data | **PASS** | — | — | `jobs_merge.test.tsx` |
| `TC-JD-010` | Match Fit | Falsy decision display | `m.decision` is undefined | Mock match with undefined decision | Chip renders clean fallback text | Chip renders 'PENDING EVALUATION' with neutral tone | **PASS** | — | `DEF-03` (Fixed) | `job_detail_remediation.test.tsx` |
| `TC-JD-011` | Dimensional Fit | Dimension bars rendering | Match contains dimension scores | Inspect "Multi-Stage Fit Dimensions" | Progress bars render with correct colors (green/indigo/amber) | Colors and percentages reflect backend scores | **PASS** | — | — | `jobs_merge.test.tsx` |
| `TC-JD-012` | Dimensional Fit | Empty dimensions handling | Match missing all dimension keys | Mock match with no dimension scores | Card renders gracefully or displays empty notice | Outer card gracefully omitted when no numeric dimensions exist | **PASS** | — | `DEF-05` (Fixed) | `job_detail_remediation.test.tsx` |
| `TC-JD-013` | Re-evaluate Fit | Trigger fit re-evaluation | Evaluated job open | Click "Re-evaluate" button | Button shows loading spinner, calls `api.evaluateMatch`, updates score on success | Evaluation API called, success toast shown | **PASS** | — | — | `jobs_merge.test.tsx` |
| `TC-JD-014` | Re-evaluate Fit | Rapid double-click on Evaluate | Evaluated job open | Rapidly click "Re-evaluate" twice | Single evaluation sent or second click ignored | Synchronous in-flight guard blocks re-entrant clicks; backend handles DB race | **PASS** | — | `DEF-02` (Fixed) | `job_detail_remediation.test.tsx`, `matching_repository.py` |
| `TC-JD-015` | External Link | Job Link button click | `model.applyUrl` valid | Click "Job Link" button | Opens target URL in new tab with `rel="noreferrer"` | Opens external link cleanly | **PASS** | — | — | `jobs_merge.test.tsx` |
| `TC-JD-016` | External Link | Malformed URL protocol | `model.applyUrl = "javascript:..."` | Supply non-http URL | Sanitized or suppressed | Rejected by WHATWG parser helper; link omitted | **PASS** | — | `DEF-01` (Fixed) | `url_safety.test.ts`, `job_detail_remediation.test.tsx` |
| `TC-JD-017` | Application Queue | Single job queue action | Platform connected & resume uploaded | Click "Queue Application" button | Job enqueued to applications list; notification shown | Job queued via `batchQueueApplications` API | **PASS** | — | — | `matches_selection.test.tsx` |
| `TC-JD-018` | Application Queue | Missing connection guard | No connected platforms | Click "Queue Application" button | Warning toast displayed; prompts to connect platform | Blocked with warning toast; navigates to connections | **PASS** | — | — | `apply_readiness.test.tsx` |
| `TC-JD-019` | Application Queue | Missing resume guard | No uploaded resumes | Click "Queue Application" button | Warning toast displayed; prompts to upload resume | Blocked with warning toast; navigates to resumes | **PASS** | — | — | `apply_readiness.test.tsx` |
| `TC-JD-020` | Tailor Dialog | Open tailoring studio | Job open in drawer | Click "Optimize Resume" button | `TailorResumeDialog` opens in modal overlay over drawer | Tailor modal mounts cleanly; drawer remains in background | **PASS** | — | — | `tailor_dialog.test.tsx` |
| `TC-JD-021` | Tailor Dialog | Nested Modal Esc handling | Both drawer and tailor modal open | Press `Escape` key | Topmost tailor modal closes first; drawer remains open | Tailor modal closes; drawer stays open | **PASS** | — | — | `tailor_dialog.test.tsx` |
| `TC-JD-022` | Tailor Step 1 | Diagnosis metrics dynamic | Tailoring analysis completed | Step 1 renders | Role match %, requirements breakdown, and missing keywords are dynamic | Zero hardcoded counts; matches real backend breakdown | **PASS** | — | — | `tailor_dialog.test.tsx` |
| `TC-JD-023` | Tailor Step 2 | Keyword selection toggle | Step 2 renders | Uncheck 2 keywords | Active selection set excludes unchecked keywords | Generation payload filters planned edits by selected keywords | **PASS** | — | — | `tailor_dialog.test.tsx` |
| `TC-JD-024` | Tailor Step 2 | Section toggle | Step 2 renders | Deselect "Summary" section | Edits in Summary section are omitted from generation | Only edits in active sections submitted | **PASS** | — | — | `tailor_dialog.test.tsx` |
| `TC-JD-025` | Tailor Step 3 | Dynamic score improvement | Step 3 renders | Inspect before/after score | Score improvement is dynamic based on approved edits / gaps | Dynamic formula applied; no static +28 fabrication | **PASS** | — | — | `tailor_dialog.test.tsx` |
| `TC-JD-026` | Tailor Step 3 | 1-Page / 2-Page Toggle | Step 3 renders | Click "Fit to 1 page" | Canvas fits into single-page layout; page count reflects change | Canvas layout re-renders with 1-page constraints | **PASS** | — | — | `tailor_dialog.test.tsx` |
| `TC-JD-027` | Tailor Step 3 | Download PDF | Generated resume ready | Click "Download PDF" | Clean HR resume filename downloaded | PDF blob downloaded with clean filename | **PASS** | — | — | `tailor_dialog.test.tsx` |
| `TC-JD-028` | Tailor Step 3 | Download DOCX | Generated resume ready | Click "Download DOCX" | Clean HR resume filename downloaded | DOCX blob downloaded with clean filename | **PASS** | — | — | `tailor_dialog.test.tsx` |
| `TC-JD-029` | Tailor Step 3 | Save tailored resume | Generated resume ready | Click "Save to Profile" | Tailored resume marked saved; saved copy badge shown | Saved copy registered; drawer reflects saved status | **PASS** | — | — | `tailor_dialog.test.tsx` |
| `TC-JD-030` | Canvas Rendering | Dynamic company names | Candidate in Law or Marketing | Inspect work experience on canvas | Displays actual candidate employers; no fake demo companies | Real candidate history rendered | **PASS** | — | — | `tailor_dialog.test.tsx` |
| `TC-JD-031` | Canvas Rendering | Empty sections handling | Candidate has no certifications | Canvas renders | Empty section header is omitted (`null`) | No empty header rendered | **PASS** | — | — | Unit test / Canvas |
| `TC-JD-032` | Canvas Rendering | Raw text fallback | Unstructured resume parsed | Canvas renders | Raw text fallback block renders cleanly | Raw text displayed with mono font | **PASS** | — | — | Unit test / Canvas |
| `TC-JD-033` | Filename Safety | Clean filename generation | File named `resume_123.pdf` | Inspect generated filename | Formatted as `Candidate_Role_Resume.pdf` or `Resume.pdf` | Clean HR-standard filename generated | **PASS** | — | — | `tailor_dialog.test.tsx` |
| `TC-JD-034` | App Drawer Download | Download from App Drawer | Tailored resume sent | Click Download in `ApplicationDrawer` | Downloaded with clean HR filename | Clean name used via `cleanResumeFileName` | **PASS** | — | — | `applications_drawer_and_url.test.tsx` |
| `TC-JD-035` | Security / IDOR | Anonymous API access | Unauthenticated client | Call non-public endpoints | HTTP 401 Unauthorized returned | All protected endpoints reject anonymous calls | **PASS** | — | — | `test_access_control_probe.py` |
| `TC-JD-036` | Security / IDOR | Cross-user tailored resume access| User B token | Request User A's tailored resume | HTTP 403 Forbidden or 404 Not Found returned | Access blocked; User A's data not leaked | **PASS** | — | — | `test_access_control_probe.py` |
| `TC-JD-037` | Security / IDOR | Cross-user download | User B token | Download User A's tailored resume file | HTTP 403 or 404 returned | Binary file download blocked | **PASS** | — | — | `test_access_control_probe.py` |
| `TC-JD-038` | Prompt Injection | Malicious JD text | JD with `"Ignore previous instructions"` | Trigger 5-stage matching cascade | Injection isolated; candidate skills not fabricated | Model reasoning validates against profile only | **PASS** | — | — | `test_phase4_matching.py` |
| `TC-JD-039` | Script Tag Injection | Stored XSS in JD | JD contains `<script>alert(1)</script>` | Open Job Description tab in drawer | React escapes text; script does not execute | Rendered safely as plain text | **PASS** | — | — | `discovery_split.test.tsx` |
| `TC-JD-040` | Master File Safety | Master resume immutability | Run tailoring generation | Check master resume hash before and after | Master resume SHA-256 hash unchanged | Master resume unchanged | **PASS** | — | — | `test_tailoring_api.py` |
| `TC-JD-041` | Document Fidelity | DOCX editing accuracy | DOCX tailored | Compare paragraph styles and XML structure | Structural integrity preserved; only planned runs edited | XML document map valid | **PASS** | — | — | `test_tailoring_editor.py` |
| `TC-JD-042` | Clean Architecture | Layer decoupling | Run architecture import checker | Domain & Application layers have 0 infra imports | All architecture rules satisfied | **PASS** | — | — | `test_architecture_rules.py` |
| `TC-JD-043` | Matching Speed | Evaluation latency | Local embedding + Groq/fallback | Time single job evaluation | Completes within acceptable SLA | Average latency < 2.5s | **PASS** | — | — | `test_matching_api.py` |
| `TC-JD-044` | Cache Invalidation | Profile update cache bust | Profile updated with new skill | Re-evaluate match | New evaluation key generated; cache missed & updated | Recomputed with fresh skills | **PASS** | — | — | `test_matching_cache_and_skills.py` |
| `TC-JD-045` | Job Switch Leakage | Rapid job switching in Drawer | Job 1 open, then Job 2 opened | Inspect state across transitions | State resets; Job 1 data does not leak into Job 2 | State cleaned up via `useEffect([model?.jobId])` | **PASS** | — | — | `jobs_merge.test.tsx` |
| `TC-JD-046` | Live Portal Apply | Live third-party external submission | Target job has external ATS | Trigger live browser auto-submit to external platform | Submission completes on external domain | **BLOCKED (Safety Fenced)**: All browser external entry points fenced to prevent live external spam | **BLOCKED** | — | — | `test_access_control_probe.py` |
