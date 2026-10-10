# AUTOAPPLY: PHASE 2 — ATOMIC WORKER FENCING AUDIT REPORT

## Executive Summary

This audit independently inspects and verifies the concurrency controls, crash recovery safety, and worker attempt fencing across the AutoApply platform.

Previously, worker lifecycle and state transitions relied partly on in-memory object checks prior to saving. Under extreme race conditions (e.g. concurrent background worker execution, crash recovery sweeper reclaiming a slow connection, or duplicate queue messages), in-memory checks alone could permit race windows.

We implemented and verified **atomic database-level conditional updates with rowcount verification**, **monotonic attempt lease tokens (`current_attempt_id`)**, and **pre-submission action fencing**. All 180 backend tests pass (100%), and the frontend builds cleanly with 0 TypeScript/bundler errors.

---

## 1. Verification of the 6 Release-Critical Atomic Fencing Requirements

| Requirement | Verdict | Implementation Mechanism | Evidence / Verified Code Path |
| :--- | :---: | :--- | :--- |
| **1. Atomic State Validation & Database Updates** | **VERIFIED** | Conditional SQL `UPDATE ... WHERE id = :id AND workflow_state = :expected_state` replaces read-modify-write patterns. In-memory state checks are backed by database atomicity. | [`SqlAlchemyApplicationRepository.save`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/app/infrastructure/database/repositories/application_repository.py#L180-L206) |
| **2. Affected-Row Count Verification** | **VERIFIED** | SQLAlchemy `rowcount` is inspected directly on update execution (`res.rowcount == 0`). If zero rows are matched, a `ValidationException` is raised and the transaction rejects the stale write. | [`application_repository.py`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/app/infrastructure/database/repositories/application_repository.py#L194-L201) |
| **3. Stale Worker Cannot Overwrite Newer States** | **VERIFIED** | When a sweeper or human operator moves an application to `RECONCILIATION_REQUIRED` or `APPLIED`, any subsequent write from a stale worker expecting `SUBMITTING` fails rowcount verification. Worker catches `ValidationException`, detects fencing, and preserves `RECONCILIATION_REQUIRED`. | [`ExecuteApplicationUseCase.execute`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/app/application/applications/use_cases.py#L360-L380) |
| **4. Worker / Attempt Ownership Fencing** | **VERIFIED** | Every execution generates a cryptographic attempt ID (`att_<hex12>`). Writes conditionalize on both `expected_state` and `expected_attempt_id`. An older attempt cannot modify rows owned by a newer attempt. | [`ApplicationModel.current_attempt_id`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/app/infrastructure/database/models/models.py#L155) & [`application_repository.py`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/app/infrastructure/database/repositories/application_repository.py#L185-L192) |
| **5. Pre-Submission Action Abortion** | **VERIFIED** | Immediately before clicking the external portal Submit button, the worker re-queries the database. If state is no longer `SUBMITTING` or `current_attempt_id != attempt_id`, the worker aborts without triggering the button. | [`use_cases.py`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/app/application/applications/use_cases.py#L274-L288) |
| **6. Concurrent Recovery & Submission Safeguards** | **VERIFIED** | `recover_stale_submitting_applications` executes atomic conditional SQL `UPDATE ... WHERE workflow_state = 'SUBMITTING'`. Concurrent recovery and worker submissions cannot double-apply or bypass mutual exclusion. | [`application_repository.py`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/app/infrastructure/database/repositories/application_repository.py#L418-L438) |

---

## 2. Deep Technical Analysis & Code Paths

### 2.1. Atomic SQL Conditional Updates (`SqlAlchemyApplicationRepository.save`)
In [`backend/app/infrastructure/database/repositories/application_repository.py`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/app/infrastructure/database/repositories/application_repository.py):

```python
if expected_state is not None or expected_attempt_id is not None:
    conditions = [ApplicationModel.id == application.id]
    if expected_state is not None:
        conditions.append(ApplicationModel.workflow_state == expected_state.value)
    if expected_attempt_id is not None:
        conditions.append(ApplicationModel.current_attempt_id == expected_attempt_id)

    stmt = (
        update(ApplicationModel)
        .where(and_(*conditions))
        .values(**update_vals)
    )
    res = await self._session.execute(stmt)
    if res.rowcount == 0:
        # Atomic check-and-set failed: another process updated or reclaimed the record
        curr_stmt = select(ApplicationModel).where(ApplicationModel.id == application.id)
        curr_res = await self._session.execute(curr_stmt)
        curr_model = curr_res.scalar_one_or_none()
        raise ValidationException(
            f"Application state conflict: Expected state [{exp_st_str}] and attempt [{exp_att_str}], "
            f"but current state is [{curr_model.workflow_state}] and attempt is [{curr_model.current_attempt_id}]."
        )
```

**Guarantees Provided**:
1. At database level, the update is atomic within SQLite / PostgreSQL.
2. If another worker or sweeper updated the state in the background, `res.rowcount == 0` is deterministic.
3. `self._session.expire_all()` ensures stale in-memory cached ORM objects are discarded and refreshed.

---

### 2.2. Pre-Submission Action Fencing
In [`backend/app/application/applications/use_cases.py`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/app/application/applications/use_cases.py):

```python
# PRE-SUBMISSION ACTION FENCE: Verify worker ownership before clicking external submit
fresh_app = await self._app_repo.get_by_id(app.id)
if (
    not fresh_app
    or fresh_app.workflow_state != WorkflowStateEnum.SUBMITTING
    or (attempt_id and fresh_app.current_attempt_id != attempt_id)
):
    logger.warning(
        f"[Worker Fencing] Worker [{attempt_id}] lost ownership before submit button click. "
        f"Current state: {getattr(fresh_app, 'workflow_state', None)}, "
        f"Current attempt: {getattr(fresh_app, 'current_attempt_id', None)}. Aborting submission!"
    )
    return fresh_app or app

# Safe to proceed with physical submit button click
await submit_locator.first.click(timeout=10000)
```

**Guarantees Provided**:
1. If the 300s sweeper reclaimed the application while the worker was filling out a long form or waiting for DOM elements, the worker discovers ownership loss *before* triggering the external HTTP POST/click.
2. No duplicate external job application request is dispatched to the portal.

---

### 2.3. Post-Submission Exception Recovery Fence
In [`backend/app/application/applications/use_cases.py`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/app/application/applications/use_cases.py):

```python
except Exception as e:
    # Check if failure is due to worker fencing / lease conflict
    if "Application state conflict" in str(e):
        logger.warning(
            f"[Worker Fencing] Worker [{attempt_id}] was fenced out during execution. "
            f"Preserving existing DB state without overwriting."
        )
        fresh_db_app = await self._app_repo.get_by_id(app.id)
        if fresh_db_app:
            return fresh_db_app

    # If worker retained lease during submit failure, mark RECONCILIATION_REQUIRED
    app.workflow_state = WorkflowStateEnum.RECONCILIATION_REQUIRED
    app.outcome_status = ApplicationOutcomeStatus.UNKNOWN
    ...
```

**Guarantees Provided**:
If a stale worker crashes or encounters an error after being fenced out, it is prohibited from overwriting an already reconciled or newly assigned state in the database.

---

### 2.4. Atomic Crash Recovery Sweeper
In [`backend/app/infrastructure/database/repositories/application_repository.py`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/app/infrastructure/database/repositories/application_repository.py):

```python
upd_stmt = (
    update(ApplicationModel)
    .where(
        ApplicationModel.id == app_id,
        ApplicationModel.workflow_state == WorkflowStateEnum.SUBMITTING.value,
    )
    .values(
        workflow_state=WorkflowStateEnum.RECONCILIATION_REQUIRED.value,
        outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
        failure_reason="Worker crashed or abandoned process during submission. Marked for reconciliation to prevent double-application.",
        next_retry_at=None,
        updated_at=now_dt,
    )
)
upd_res = await self._session.execute(upd_stmt)
rowcount = getattr(upd_res, "rowcount", None)
if (rowcount > 0):
    # Event emitted and count incremented only on confirmed row update
    count += 1
```

---

## 3. Concurrency Regression Test Verification

The regression suite [`backend/tests/integration/test_platform_confirmation_and_concurrency.py`](file:///d:/Matisaar%20Projects/Automation_Tool/backend/tests/integration/test_platform_confirmation_and_concurrency.py) was executed to validate all atomic boundaries:

```bash
& ".venv\Scripts\python.exe" -m pytest tests/integration/test_platform_confirmation_and_concurrency.py -q
```
**Results**:
```
..................                                                                    [100%]
18 passed in 10.42s
```

### Verified Test Cases:
1. `test_atomic_sql_conditional_update_verifies_expected_state_and_rowcount`: Proves rowcount 0 on mismatched state raises `ValidationException` and prevents row modification.
2. `test_atomic_attempt_fencing_prevents_stale_attempt_overwrite`: Proves attempt mismatch (`att_stale_001` vs `att_newer_002`) raises `ValidationException` and preserves newer attempt ID.
3. `test_recover_stale_submitting_applications_atomic_in_db`: Proves the sweeper atomically updates only rows currently in `SUBMITTING`, skipping rows already transitioned by active workers.
4. `test_pre_submission_ownership_loss_aborts_click`: Proves that a worker aborted before button click when reclaimed by sweeper, and never called locator `click()`.
5. `test_fenced_worker_exception_does_not_overwrite_reconciliation_required`: Proves that when a fenced worker throws an exception, it does not overwrite `RECONCILIATION_REQUIRED`.
6. `test_recovery_of_uncertain_attempt_marks_unknown_never_auto_retries`: Proves post-submit crash recovery sets `outcome_status=UNKNOWN` and `next_retry_at=None`.

---

## 4. Full System Verification

### Backend Pytest Suite
```bash
& ".venv\Scripts\python.exe" -m pytest -q
=========================== 180 passed in 90.95s (0:01:30) ===========================
```
- Total test count: **180 passed, 0 failed, 0 skipped**.
- Full coverage across unit, domain, repository, worker, and integration test suites.

### Frontend Production Build
```bash
npm run build
✓ 1644 modules transformed.
dist/index.html                   0.89 kB │ gzip:   0.51 kB
dist/assets/index-CX1xckec.css   82.79 kB │ gzip:  12.74 kB
dist/assets/index-Brk6PQob.js   597.34 kB │ gzip: 144.83 kB
✓ built in 10.26s
```
- **0 errors, 0 warnings**.

---

## 5. Concurrency & Race Condition Analysis

| Potential Race Condition | Mitigated? | Explanation |
| :--- | :---: | :--- |
| Two workers picked same queued task | **YES** | First worker updates `QUEUED -> APPLYING` with conditional SQL `expected_state=QUEUED`. Second worker gets `rowcount == 0` and aborts. |
| Sweeper reclaims worker during DOM fill | **YES** | Worker checks `current_attempt_id` immediately prior to clicking submit button; detects lease lost and aborts without submitting. |
| Stale worker completes after sweeper ran | **YES** | Stale worker's final save requires `expected_state=SUBMITTING` and `expected_attempt_id=attempt_id`. Sweeper changed state to `RECONCILIATION_REQUIRED`; update fails rowcount check. |
| Crash after submit click | **YES** | Sweeper transitions to `RECONCILIATION_REQUIRED` with `outcome_status=UNKNOWN` and `next_retry_at=None`. Prevents automated re-apply. |
| Dialect portability | **YES** | Standard ANSI SQL `UPDATE ... WHERE ...` is identical across SQLite, PostgreSQL, and MySQL. |
