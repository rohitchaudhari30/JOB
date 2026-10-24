# 09. Defect Register

## Comprehensive Inventory of Confirmed Defects, Test Reproductions & Remediation Status

Every defect discovered during the adversarial full-stack audit is cataloged here with its unique defect identifier, severity, component location, reproduction procedure, root cause, and verified remediation status.

---

### Defect DEF-AUT-01: Standalone Automation Run Teardown Invokes Campaign Persistence

- **Severity**: **MEDIUM-HIGH**
- **Component**: `backend/app/application/automation/orchestrator.py`
- **Reproduction Test**: `backend/tests/integration/test_live_console_reliability.py::test_cross_user_isolation`
- **Symptom**:
  When a standalone automation run completed, errored, or was cancelled, the orchestrator attempted to sync final state with `CampaignExecutionRepository` using `session.execution_id` (which had defaulted to `run_id`), failing because no campaign execution existed.
- **Root Cause**:
  `session.execution_id` defaulted to `execution_id or run_id`, and `_sync_final_state` checked `if session.execution_id:` instead of checking whether the run belonged to an actual campaign.
- **Remediation Applied**:
  1. Updated `AutomationSession.__init__` and `orchestrator.start_run` to set `self.execution_id = execution_id` (remaining `None` for standalone runs).
  2. Guarded heartbeat loop and `_sync_final_state` with `if session.campaign_id and session.execution_id:`.
- **Status**: **RESOLVED & VERIFIED** (12/12 tests passing in `test_live_console_reliability.py`).

---

### Defect DEF-TEST-02: Pytest In-Memory SQLite Fixture Lacks StaticPool

- **Severity**: **MEDIUM**
- **Component**: `backend/tests/conftest.py`
- **Reproduction Test**: Secondary database connections in multi-connection tests checked out blank in-memory databases.
- **Root Cause**:
  `_make_engine(False)` instantiated `create_async_engine("sqlite+aiosqlite:///:memory:")` without `poolclass=StaticPool`.
- **Remediation Applied**:
  1. Added `poolclass=StaticPool` to the `:memory:` engine.
  2. Updated `client` fixture's `override_get_db` to yield individual sessions per request via `async with test_database() as session:` rather than sharing a single session across all requests.
  3. Added `@pytest.mark.file_db` to `test_cross_user_isolation` for proper concurrency multi-connection isolation.
- **Status**: **RESOLVED & VERIFIED**.

---

### Defect DEF-TEST-01: Windows Default Encoding (`charmap`) Causes Test Failure in `test_enum_references.py`

- **Severity**: **LOW (Portability / DX)**
- **Component**: `backend/tests/unit/test_enum_references.py`
- **Reproduction Test**: Ran `pytest backend/tests/unit/test_enum_references.py` on Windows PowerShell without `-X utf8`.
- **Symptom**: `UnicodeDecodeError: 'charmap' codec can't decode byte 0x8f`.
- **Root Cause**: `path.read_text()` used system default `cp1252` encoding instead of `utf-8`.
- **Remediation Applied**: Updated `path.read_text(encoding="utf-8")`.
- **Status**: **RESOLVED & VERIFIED** (4/4 tests passing on native Windows PowerShell).

---

### Defect DEF-ARC-01: In-Memory Orchestrator State Precludes Multi-Worker Production Scaling

- **Severity**: **ARCHITECTURAL ROADMAP (Medium for v1, High for Cluster Scale)**
- **Component**: `backend/main.py:ensure_single_worker_process()` and `backend/app/application/automation/orchestrator.py`
- **Symptom**:
  Starting FastAPI with `WEB_CONCURRENCY > 1` triggers `RuntimeError` by design to prevent duplicate live runs.
- **Status**: **DOCUMENTED / PLANNED FOR v1.1** (Single-worker process model enforced for safety; distributed Redis / PostgreSQL advisory locks scheduled for multi-replica horizontal clustering).

---

### Defect DEF-LIVE-01: Controlled Third-Party External Submissions Fenced by Safety Policy

- **Severity**: **INFORMATIONAL / PROCEDURAL**
- **Component**: `backend/app/infrastructure/browser/adapters/`
- **Symptom**: Test case `TC-JD-046` marked `BLOCKED (Safety Fenced)`.
- **Status**: **VERIFIED AS WORKING AS INTENDED** (Mock & sandbox adapters active; production live submissions strictly safeguarded).
