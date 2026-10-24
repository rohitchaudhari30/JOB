# 07. Performance, Load & Reliability Audit

## Performance Benchmarks, Database Query Optimization, and Resilience Engineering

This audit examines frontend bundle distribution, backend latency profiles, database index coverage, memory leak prevention, and automated crash recovery mechanisms across AutoApply.ai.

---

### 1. Frontend Performance & Bundle Distribution

- **Vite Dynamic Route Splitting**: As configured in `frontend/src/App.tsx`, all top-level workspace pages (`Dashboard`, `JobsWorkspace`, `LiveAutomation`, `ApplicationCRM`, `ProfileManager`, `Analytics`) are wrapped in `React.lazy()`:
  - Initial entry bundle downloads only core app shell, state providers, and authentication components.
  - Subsequent workspace chunks load on-demand, reducing initial page load time and eliminating layout shift (CLS).
- **File Size Discipline**: Verified via `frontend/scripts/check-file-size.mjs`:
  - 100% of frontend component files comply with strict line limits ($\le 400$ lines).
  - Vitest test suites execute in **25.05s** (224/224 unit tests passing).
  - TypeScript compilation (`npm run build`) completes in **13.70s** with zero errors or unresolved imports.

---

### 2. Backend Latency Profiling & In-Flight Request Deduplication

#### The Single-Flight Evaluator (`backend/app/core/single_flight.py`)
In automated or high-volume user workflows, rapid duplicate clicks on "Evaluate Match" could trigger redundant LLM inference calls, consuming API quota and spiking latency.
- **Implementation**: The `SingleFlightEvaluator` acts as a thread-safe in-flight registry. When multiple requests arrive with the identical `(user_id, job_id, evaluation_key)` tuple before the first request finishes:
  - Request 1 initiates the actual AI calculation.
  - Requests 2..N subscribe to the in-flight Future and await its completion.
  - All requests receive the identical canonical result in parallel without duplicate AI calls.
- **Evidence**: Verified in `test_matching_concurrency.py` Scenario 4 (Simultaneous AI evaluation calls return identical scores with zero redundant token consumption).

---

### 3. Database Indexing & Query Optimization Audit

| Table | Index Name | Columns | Purpose |
|---|---|---|---|
| `jobs` | `uq_source_external_job` | `(source_id, external_job_id)` | Fast lookup on ingestion; prevents duplicate jobs |
| `jobs` | `uq_job_canonical_key` | `canonical_job_key` (partial active) | Cross-platform job deduplication |
| `match_results` | `uq_user_job_evaluation` | `(user_id, job_id, evaluation_key)` | O(1) cached evaluation lookup; prevents duplicate rows |
| `applications` | `uq_user_job_application` | `(user_id, job_id)` | Guarantees single application per candidate per job |
| `campaign_executions` | `uq_campaign_one_active_execution`| `campaign_id` (partial active) | Prevents multiple concurrent worker processes on one campaign |
| `application_events` | Index on `application_id` | `application_id` | Fast audit trail retrieval without full table scan |

#### N+1 Query Audit
- **Dashboard & Analytics Queries**: `DashboardService` and `AnalyticsService` use explicit eager loading (`selectinload(CampaignExecutionModel.campaign)`) and SQL-level aggregations (`func.count`, `func.avg`). No N+1 query loops were detected in database access paths.

---

### 4. Process Crash Recovery & Worker Staleness Detection

1. **Server Restart Recovery (`run_persistence.py:recover_interrupted_runs`)**:
   - On server startup, `init_db()` executes `recover_interrupted_runs()` and `recover_interrupted_executions()`.
   - Any run or campaign execution left in `RUNNING` or `STARTING` status by a terminated process is cleanly transitioned to `FAILED` or `ABORTED` with `error_message="Interrupted: the server restarted while this run was active."`.
   - This eliminates deadlocks where orphaned records block subsequent runs.
2. **Heartbeat Sweeping & Worker Lease Fencing**:
   - Running automation workers emit periodic heartbeats every 30 seconds.
   - If a worker crashes or hangs for $> 300$ seconds without updating its heartbeat, the status API and sweeper flag the worker as `STALE`, allowing operators or safe automated supervisors to reclaim or terminate the task.
