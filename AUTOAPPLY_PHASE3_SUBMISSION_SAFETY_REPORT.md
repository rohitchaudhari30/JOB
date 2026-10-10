# AUTOAPPLY: PHASE 3 — END-TO-END SUBMISSION SAFETY REPORT

## Executive Summary

Phase 3 verifies and hardens the **complete application submission lifecycle**—from user action and API request through the queue, browser worker, external portal submission, confirmation detection, persistence, and reconciliation retry.

All 8 requested lifecycle scenarios have been implemented and validated against an isolated test database with controlled browser fixtures. Automated test results show **188 passing tests (100%)** across the backend test suite, and a clean frontend production build with **0 errors**.

---

## 1. Verification of the 8 Submission Safety Scenarios

| # | Scenario | Verdict | Mechanism & Safeguards | Evidence / Test Case |
| :---: | :--- | :---: | :--- | :--- |
| **1** | **Submission succeeds and confirmation is recorded** | **VERIFIED** | Browser submits form $\to$ platform adapter confirms submission $\to$ persists `APPLIED`, `SUBMITTED`, timestamp `applied_at`, attempt lease token `current_attempt_id`, and emits `APPLICATION_APPLIED` audit event. | [`test_scenario_1_submission_succeeds_and_confirmation_recorded`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/tests/integration/test_phase3_submission_safety.py#L106-L197) |
| **2** | **External submission succeeds, but worker crashes before save** | **VERIFIED** | Record is left in `SUBMITTING`. The 300s crash sweeper (`recover_stale_submitting_applications`) reclaims it atomically $\to$ sets `RECONCILIATION_REQUIRED`, `outcome_status=UNKNOWN`, and `next_retry_at=None`. Prevents unsafe automatic resubmission. | [`test_scenario_2_submission_succeeds_externally_worker_crashes`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/tests/integration/test_phase3_submission_safety.py#L200-L228) |
| **3** | **External outcome is unknown / ambiguous** | **VERIFIED** | Network drop or ambiguous portal response transitions application to `RECONCILIATION_REQUIRED` with `outcome_status=UNKNOWN`. `RetryApplicationUseCase` rejects automated retries. Requires explicit human reconciliation. | [`test_scenario_3_external_outcome_unknown_never_auto_retries`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/tests/integration/test_phase3_submission_safety.py#L231-L309) |
| **4** | **Stale worker and recovery process operate concurrently** | **VERIFIED** | **Pre-click fence**: Slow worker checks ownership before clicking submit; detects state $\ne$ `SUBMITTING` and aborts without clicking submit.<br>**Post-submit fence**: Stale worker save requires `expected_state=SUBMITTING`; rowcount 0 check triggers `ValidationException` without overwriting `RECONCILIATION_REQUIRED`. | [`test_scenario_4_stale_worker_and_recovery_operate_concurrently`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/tests/integration/test_phase3_submission_safety.py#L312-L377) |
| **5** | **User confirms that an application was submitted** | **VERIFIED** | Candidate verifies external email/receipt and calls `POST /api/v1/applications/{id}/reconcile` with `action="CONFIRM_SUBMITTED"`. State transitions to `APPLIED`, `outcome_status=SUBMITTED`, `applied_at=now`. Emits `RECONCILIATION_CONFIRMED_SUBMITTED`. | [`test_scenario_5_user_confirms_submitted`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/tests/integration/test_phase3_submission_safety.py#L380-L417) |
| **6** | **User explicitly marks not submitted and requests retry** | **VERIFIED** | Candidate calls reconcile API with `action="MARK_NOT_SUBMITTED_AND_RETRY"`. Pipeline revalidates active job, resume on disk, and safety policy limits. Increments `retry_count`, transitions to `APPROVED`, and re-triggers execution.<br>Also supports `action="MARK_NOT_SUBMITTED"` without immediate auto-run. | [`test_scenario_6_user_marks_not_submitted_and_retries`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/tests/integration/test_phase3_submission_safety.py#L420-L489) |
| **7** | **Retry occurs while another worker is processing application** | **VERIFIED** | If application is currently in `APPLYING` or `SUBMITTING`, `RetryApplicationUseCase` immediately raises `ValidationException("Application is currently being processed by another worker")`. Mutual exclusion is enforced both in memory and via database conditional update. | [`test_scenario_7_retry_while_another_worker_processing`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/tests/integration/test_phase3_submission_safety.py#L492-L521) |
| **8** | **Selected resume is valid, exists, and belongs to correct user/tenant** | **VERIFIED** | Rejection matrix enforced across all execution and retry paths:<br>1. Nonexistent resume in DB $\to$ `ValidationException("not found in database")`<br>2. Tenant mismatch (`resume.user_id != app.user_id`) $\to$ `ValidationException("does not belong to user")`<br>3. Missing file on disk $\to$ `ValidationException("inaccessible or missing on disk")`<br>4. Valid resume $\to$ successfully resolved. | [`test_scenario_8_resume_validation_ownership_and_tenant`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/tests/integration/test_phase3_submission_safety.py#L524-L627) |

---

## 2. Ambiguous Outcome Guarantees

### Why Ambiguous Outcomes Are NEVER Automatically Resubmitted
1. **The Double-Application Penalty**: Many job platforms (e.g. Workday, Greenhouse, Lever, LinkedIn, Naukri) flag candidate accounts or automatically disqualify applications if the same candidate submits duplicate applications for the same requisition within short intervals.
2. **Deterministic Isolation**: When an application outcome cannot be confirmed (network timeout, ambiguous redirect, browser crash post-click):
   - The workflow state is moved to `RECONCILIATION_REQUIRED`.
   - The outcome status is set to `UNKNOWN`.
   - `next_retry_at` is set to `None`.
   - Background workers querying retry queues (`WHERE next_retry_at <= :now AND workflow_state != 'APPLIED'`) ignore records in `RECONCILIATION_REQUIRED`.
   - Any manual or API invocation of `RetryApplicationUseCase` on `RECONCILIATION_REQUIRED` raises an explicit `ValidationException("Cannot retry application requiring reconciliation. Please resolve via reconciliation API.")`.
3. **Audit Trail**: Every ambiguous transition is logged with a screenshot, Playwright trace (if available), and an `APPLICATION_RECONCILIATION_REQUIRED` event.

---

## 3. Retries Revalidation Safeguards

Before any retried application can transition to `APPROVED` or execute:
1. **Job Availability Verification**:
   The job record is re-queried from `JobRepository`. If the job was deleted, closed, or marked inactive, the application is transitioned to `SKIPPED` with `failure_reason="Job posting is no longer available"`.
2. **Resume Existence & Ownership Verification**:
   The resume record is re-queried from `ResumeRepository`. It verifies:
   - Resume exists in the database.
   - `resume.user_id == app.user_id` (cross-tenant safety).
   - `os.path.isfile(resume.file_path)` (disk payload integrity).
3. **Safety Quota & Velocity Policy**:
   Evaluates the candidate's active campaign safety policy (`SafetyPolicyEvaluator.evaluate`):
   - `count_today_applications` $\le$ `daily_application_limit`.
   - `count_hourly_applications` $\le$ `hourly_application_limit`.
   If limits are breached, state is moved to `PAUSED_LIMIT` rather than triggering a burst.
4. **Concurrency Safeguards**:
   If the record is already in `APPLYING` or `SUBMITTING`, the retry request is blocked immediately.
5. **Max Retry Cap**:
   Hard cap of 3 retries (`retry_count >= 3`). Exceeding this marks the application permanently failed or requires manual intervention.

---

## 4. Limitations of External Job Portals (What Cannot Be Guaranteed Purely by Client Automation)

While our platform enforces strict mathematical and database atomicity internally, the following realities of third-party job portals cannot be guaranteed without human or portal-side confirmation:

| Portal Limitation | Risk Scenario | Antigravity Platform Mitigation |
| :--- | :--- | :--- |
| **Silent Form Rejection Without DOM Feedback** | Portal receives form submission, returns HTTP 200, but drops the candidate internally (e.g. silent spam filter or duplicate email detection without displaying an error on screen). | The platform checks for visible confirmation elements or portal redirect URLs. If no positive confirmation is detected, the status transitions to `RECONCILIATION_REQUIRED` rather than false-positive `APPLIED`. |
| **Portal Crash During Submit POST** | The portal database receives the candidate resume, but the portal web server crashes (HTTP 502/504) before sending the HTTP response back to Playwright. | The worker records submission uncertainty $\to$ `RECONCILIATION_REQUIRED`. The sweeper ensures no automatic re-submission occurs, giving the candidate time to check their email for an automated receipt. |
| **External Email Delivery Delays** | Confirmation is sent only via external email (not on-screen). | Candidate uses the Reconciliation UI (`POST /api/v1/applications/{id}/reconcile`) to mark `CONFIRM_SUBMITTED` once the employer confirmation email arrives. |
| **Session Invalidation During Multi-Step Forms** | Portal invalidates candidate cookies/session halfway through a 5-step application wizard. | Error taxonomy catches `AUTHENTICATION` error, transitions state to `PAUSED_SESSION`, alerts candidate via WebSocket, and preserves session context. |

---

## 5. Verification Test Suite Results

```bash
& ".venv\Scripts\python.exe" -m pytest tests/integration/test_phase3_submission_safety.py -v
```
```
test_scenario_1_submission_succeeds_and_confirmation_recorded PASSED [ 12%]
test_scenario_2_submission_succeeds_externally_worker_crashes PASSED [ 25%]
test_scenario_3_external_outcome_unknown_never_auto_retries PASSED [ 37%]
test_scenario_4_stale_worker_and_recovery_operate_concurrently PASSED [ 50%]
test_scenario_5_user_confirms_submitted PASSED [ 62%]
test_scenario_6_user_marks_not_submitted_and_retries PASSED [ 75%]
test_scenario_7_retry_while_another_worker_processing PASSED [ 87%]
test_scenario_8_resume_validation_ownership_and_tenant PASSED [100%]
============================== 8 passed in 3.49s ==============================
```

### Full Backend Regression Suite:
```bash
& ".venv\Scripts\python.exe" -m pytest -q
=========================== 188 passed in 55.14s ===========================
```

### Frontend Production Build:
```bash
npm run build
✓ 1644 modules transformed.
✓ built in 10.19s (0 errors)
```
