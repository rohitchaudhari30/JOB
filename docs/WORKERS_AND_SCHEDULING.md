# WORKERS_AND_SCHEDULING.md — Asynchronous Processing, Queues & Workers

## 1. Decoupled Worker Strategy

The system splits workload into **four isolated worker types** to prevent slow browser sessions from blocking API responsiveness, matching calculations, or discovery runs.

```
                           ┌───────────────────────────┐
                           │      Scheduler Worker     │
                           └─────────────┬─────────────┘
                                         │ Enqueues Runs
                                         ▼
                            ┌─────────────────────────┐
                            │    Task Queue Manager   │
                            │ (Local Dev / Redis Prod)│
                            └────────────┬────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
│   Discovery Worker    │  │    Matching Worker    │  │  Application Worker   │
│ (Scans Source Portals)│  │ (5-Stage Score Engine)│  │ (Playwright Form Fill)│
└───────────────────────┘  └───────────────────────┘  └───────────────────────┘
```

---

## 2. Worker Roles & Responsibilities

### 2.1 Scheduler Worker (`app/workers/scheduler/`)
- Evaluates active user schedules (`automation_schedules`).
- Periodically checks for due discovery batches, session health probe schedules, and application retry queues.
- Dispatches task messages to the queue manager.

### 2.2 Discovery Worker (`app/workers/discovery/`)
- Pulls discovery tasks from the queue.
- Acquires isolated browser context with user's encrypted `storage_state`.
- Navigates target source, paginates search results, extracts job cards, checks DB deduplication, and inserts new records into `jobs`.
- Dispatches `JOB_DISCOVERED` events.

### 2.3 Matching Worker (`app/workers/matching/`)
- Processes newly discovered or updated jobs.
- Executes the 5-Stage Matching Cascade (Hard filters $\to$ Skill overlap $\to$ Embedding similarity $\to$ Groq AI $\to$ Gemini validation).
- Runs the Decision Engine to assign `AUTO_APPLY`, `REQUIRE_APPROVAL`, `SAVE`, `SKIP`, or `REJECT`.
- Inserts `match_results` record and enqueues approved jobs for application.

### 2.4 Application Worker (`app/workers/applications/`)
- Pulls applications in `APPROVED` or `AUTO_APPLY` state.
- Launches isolated Playwright browser context.
- Traverses application form steps, resolves fields, solves questions, attaches resume, and submits.
- On challenge detection: halts, updates state to `PAUSED_OTP` / `PAUSED_CAPTCHA`, and dispatches WebSocket notification.
- On completion: updates state to `APPLIED` or `FAILED` (capturing trace artifacts).

---

## 3. Queue Abstraction (`LocalTaskQueue` $\to$ `RedisTaskQueue`)

```python
class TaskQueue(ABC):
    @abstractmethod
    async def enqueue(self, queue_name: str, payload: dict, delay_seconds: int = 0) -> str:
        """Enqueues a task and returns a unique task ID."""
        pass

    @abstractmethod
    async def dequeue(self, queue_name: str, timeout_seconds: int = 5) -> dict | None:
        """Pulls a task from the queue."""
        pass
```

- **Phase 1 (Development)**: `LocalTaskQueue` uses in-memory `asyncio.Queue` workers.
- **Production Target**: `RedisTaskQueue` utilizes Redis + Celery / ARQ with distributed worker containers.
- **Rule**: Application use cases only interact with `TaskQueue`, ensuring zero code changes during production migration.
