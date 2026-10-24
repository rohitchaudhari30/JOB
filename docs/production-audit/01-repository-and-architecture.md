# 01. Repository & Architectural Audit

## Executive Architecture Overview

AutoApply.ai is an automated job search, matching, and multi-platform application execution system. The architecture is composed of a decoupled modern single-page application (React 18 / Vite / TypeScript) and an asynchronous RESTful backend service (FastAPI / SQLAlchemy 2.0 / Pydantic v2).

```
+-------------------------------------------------------------------------------+
|                               Frontend (Vite / React 18)                      |
|                                                                               |
|  [App Shell] <---> [TanStack Query / Zustand Store]                           |
|       |                     |                                                 |
|  [Pages]                    |  (HTTP REST / Bearer Auth / CSRF Header)        |
|   - Dashboard (Home)        v                                                 |
|   - Jobs & Search     <--------------------+                                  |
|   - OpportunityDrawer                      |                                  |
|   - Applications & Kanban                  |                                  |
|   - Automation & Schedules                 |                                  |
|   - Insights / Analytics                   |                                  |
|   - Settings & Credentials                 |                                  |
+--------------------------------------------|----------------------------------+
                                             v
+-------------------------------------------------------------------------------+
|                           Backend (FastAPI / Python 3.12)                     |
|                                                                               |
|  [HTTP Middleware & Security Headers: HSTS, CSP, CORS, Single-Worker Guard]   |
|       |                                                                       |
|  [API Routers: Auth, Jobs, Matching, Applications, Automation, Analytics]    |
|       |                                                                       |
|  [Application Services / Use Cases]                                           |
|       - SingleFlightEvaluator (In-flight duplicate request de-duplication)     |
|       - MatchingOrchestrator & ScoreEvaluators (Deterministic + Cascade LLM)  |
|       - ResumeTailoringService (Diff-based ATS optimization)                  |
|       - ApplicationOrchestrator & LeaseFencingManager                         |
|       |                                                                       |
|  [Infrastructure / Persistence Layer (SQLAlchemy 2.0 Async)]                  |
|       - MatchResultRepository (Uniqueness, concurrency-safe upserts)          |
|       - MatchingTaskRepository (Task queues, advisory/row locking)            |
|       - ApplicationRepository, UserRepository, JobRepository                 |
|       |                                                                       |
|  [Database Layer: PostgreSQL in Prod / aiosqlite in Local/CI]                |
|       - Real Foreign Keys with Safe Restrict/Cascade                          |
|       - Partial Unique Indexes for Single Active Run Fencing                  |
|       - Strict Enums and Check Constraints                                    |
+-------------------------------------------------------------------------------+
```

---

## 1. Directory Structure and Boundaries

```
AutoApply.ai-main/
|-- backend/
|   |-- alembic/                        # Migration scripts and environment
|   |-- app/
|   |   |-- api/                        # FastAPI route controllers
|   |   |   |-- routers/                # auth, jobs, applications, automation, matching, analytics...
|   |   |-- core/                       # Config, security, exceptions, logging, single_flight
|   |   |-- domain/                     # Entities, schemas, value objects, business enums
|   |   |-- infrastructure/             # DB sessions, SQLAlchemy models, repositories, adapters
|   |   |-- services/                   # Business logic orchestrators, matching, tailoring
|   |-- tests/                          # Pytest unit & integration test suites
|-- frontend/
|   |-- src/
|   |   |-- components/                 # UI components, layout, common modals, drawers
|   |   |-- context/                    # Auth, Theme, and App state contexts
|   |   |-- hooks/                      # Custom hooks (useJobActions, useMatching, useAuth...)
|   |   |-- lib/                        # API client, utilities, URL sanitizers
|   |   |-- pages/                      # Dashboard, Jobs, Applications, Automation, Insights...
|   |   |-- types/                      # TypeScript domain models and interfaces
|   |-- tests/                          # Vitest component & unit tests
|-- scripts/                            # Verification and ratchet validation scripts
```

---

## 2. Source Code Modularization & The 400-Line Ratchet Rule

A critical architectural mandate requires all `.py` and `.tsx` source files to remain at or under **400 lines** to maintain cohesion, eliminate "god files", and facilitate independent auditing.

### Recent Modularization Audit
1. **`backend/app/infrastructure/database/repositories/matching_repository.py`**:
   - *Previous state*: 534 lines (violation).
   - *Refactored into*:
     - `match_result_repository.py` (313 lines): Handles match score persistence, unique key resolution, and query lookups.
     - `matching_task_repository.py` (244 lines): Handles asynchronous task queuing, status transitions, and SQLite/Postgres lock handling.
     - `matching_repository.py` (17 lines): Facade maintaining backwards compatibility.
2. **`backend/app/services/matching/cascade.py`**:
   - *Previous state*: 463 lines (violation).
   - *Refactored into*:
     - `cascade.py` (390 lines): Cascade orchestrator.
     - `evaluators.py` (97 lines): Specialized sub-evaluators.
3. **`backend/app/core/single_flight.py`**:
   - Modular 60-line concurrency deduplicator ensuring identical in-flight matching evaluations share an existing task.
4. **Ratchet Verification Script (`frontend/scripts/check-file-size.mjs`)**:
   - Fully patched to support cross-platform Windows/POSIX environments (`fileURLToPath`).
   - Verified clean with **0 violations** against current baseline.

---

## 3. Concurrency Model & Single-Worker Constraint

In `backend/main.py:ensure_single_worker_process()`, the system enforces `WEB_CONCURRENCY=1`:
```python
# backend/main.py:41
if concurrency > 1:
    raise RuntimeError(
        f"AutoApply.ai requires WEB_CONCURRENCY=1 (found {concurrency}). "
        "Multi-worker setups risk duplicate live application runs."
    )
```

### Architectural Implications
1. **Vertical Safety**: Within a single process, `SingleFlightEvaluator` and async locks effectively prevent in-flight duplicate calls from racing.
2. **Horizontal Scaling Limitation**: AutoApply.ai currently relies on in-memory locks (`asyncio.Lock`) for application lease fencing and single-flight evaluation. True horizontal scaling across multiple worker containers or pods will require Redis or PostgreSQL advisory locks (`pg_try_advisory_xact_lock`) for distributed synchronization.
