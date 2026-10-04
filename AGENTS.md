# AGENTS.md — Universal Engineering Contract for Coding Agents

This document defines the strict, non-negotiable architectural and engineering rules for all AI coding agents working on the **Job Automation Platform**. Every agent must adhere to this contract before and during code modifications.

---

## 1. Core Operating Principles

1. **Clean / Hexagonal Architecture is Mandatory**:
   - `api/` depends on `application/` and `core/`.
   - `application/` orchestrates use cases and depends on `domain/` interfaces.
   - `domain/` contains pure business models, domain services, value objects, and repository/gateway interfaces. It **must never** import from `infrastructure/`, `api/`, `playwright`, `sqlalchemy`, `groq`, `google.genai`, `redis`, or `celery`.
   - `infrastructure/` implements domain interfaces (database repositories, AI gateway providers, browser engines, storage).
   - `workers/` consume tasks and execute application use cases.

2. **No Hardcoded Business Logic or Selectors**:
   - Job titles, salary bands, locations, skills, match weights, AI models, schedules, and thresholds are dynamic configuration/database-driven.
   - Core business logic must never contain website-specific selectors or hardcoded platform branches (`if platform == 'naukri': ...`). Platform differences are encapsulated entirely within **Adapters** registered in the **Adapter Registry**.

3. **Human-in-the-Loop & Safety Protocol**:
   - **Never** write code to bypass CAPTCHA, OTP, 2FA, or cloudflare/bot barriers.
   - When a challenge or unknown high-risk screening question occurs: transition state to `PAUSED_*`, notify the user via WebSocket/event dispatcher, wait for user intervention, and resume safely.
   - Never store raw portal passwords. Authenticated sessions use encrypted `storage_state` tokens with AES-256-GCM.

4. **Multi-Stage Matching Cascade & Cost Control**:
   - Hard filters (SQL/Python) $\to$ Structured Skill Overlap $\to$ Embedding Similarity $\to$ Groq LLM Reasoning $\to$ Gemini Validation (only on low confidence / ambiguity).
   - Never call LLMs directly for raw discovery or hard-filtered out jobs.

5. **Idempotency & Double-Application Prevention**:
   - Every application attempt requires an idempotency key and database-level unique constraints on `(user_id, job_id)` and `(user_id, source_id, external_job_id)`.
   - The database constraint is the final source of truth.

---

## 2. Directory Structure & Ownership Rules

```
Automation_Tool/
├── backend/
│   ├── app/
│   │   ├── api/                 # Routes, request/response models, middleware, WS
│   │   │   └── v1/
│   │   ├── application/         # Use cases, application services, DTOs, orchestrators
│   │   │   ├── profile/
│   │   │   ├── jobs/
│   │   │   ├── matching/
│   │   │   ├── applications/
│   │   │   └── automation/
│   │   ├── domain/              # Pure business rules, entities, value objects, contracts
│   │   │   ├── profile/
│   │   │   ├── jobs/
│   │   │   ├── matching/
│   │   │   ├── applications/
│   │   │   ├── automation/
│   │   │   ├── browser/
│   │   │   ├── ai/
│   │   │   └── events/
│   │   ├── infrastructure/      # Technology-specific implementations
│   │   │   ├── database/        # SQLAlchemy models, sessions, migrations
│   │   │   ├── ai/              # AI Gateway, GroqProvider, GeminiProvider
│   │   │   ├── browser/         # Playwright engine, DOM analyzer, Adapters
│   │   │   ├── queue/           # LocalTaskQueue (Dev) / CeleryQueue (Prod)
│   │   │   └── storage/         # Local / S3 storage for resumes & traces
│   │   ├── workers/             # Discovery, Matching, Application, Scheduler workers
│   │   └── core/                # App configuration, security, hashing, crypto, logging
│   ├── tests/                   # Unit, integration, domain, adapter tests
│   ├── alembic/                 # Database migrations
│   ├── requirements.txt
│   └── main.py
├── frontend/                    # React + TypeScript + Tailwind (Phase 6+)
├── docs/                        # Technical source of truth documents
├── README.md
├── AGENTS.md
└── CLAUDE.md
```

### Prohibited Actions:
- ❌ Do NOT import `infrastructure` modules into `domain`.
- ❌ Do NOT place database session queries or ORM models in `api/` or `domain/`.
- ❌ Do NOT write one monolithic worker or monolithic `JobService`.
- ❌ Do NOT hardcode AI model names (e.g. `"llama-3.3-70b-versatile"`) in business code; use settings / provider configuration.
- ❌ Do NOT commit secrets, `.env` files, or raw unencrypted cookies.

---

## 3. Technology Evolution & Migration Strategy

To ensure seamless progress without rewrites:

| Component | Phase 1 (Development) | Production Target | Abstraction Interface |
|---|---|---|---|
| **Database** | SQLite (WAL mode enabled) | PostgreSQL 16+ | `BaseRepository` / SQLAlchemy 2.0 ORM |
| **Vector Search**| In-memory / Cosine on embeddings | PostgreSQL + `pgvector` | `EmbeddingRepository` |
| **Task Queue** | `LocalTaskQueue` (Asyncio / In-Process) | Redis + Celery / ARQ | `TaskQueue` interface |
| **Event Bus** | In-process Async Event Dispatcher | Redis PubSub / RabbitMQ | `EventDispatcher` interface |
| **AI Primary** | Groq (Llama-3 / Mixtral) | Groq | `AIProvider` $\to$ `AIGateway` |
| **AI Fallback** | Google Gemini (Flash / Pro) | Google Gemini | `AIProvider` $\to$ `AIGateway` |
| **Browser Engine**| Playwright Headed / Headless | Playwright Worker Pool | `BrowserSessionManager` |

---

## 4. Definition of Done (DoD) for Any Code Change

A task is considered complete only when:
1. **Architecture Compliance**: Follows the Clean/Hexagonal directory separation without forbidden imports.
2. **Interface Grounding**: Any new capability has an abstract interface in `domain/` and an implementation in `infrastructure/`.
3. **Database Migration**: If schema changes are made, an Alembic migration is generated and verified for both SQLite and PostgreSQL syntax compatibility.
4. **Idempotency & Error Recovery**: External operations (browser actions, AI calls, state transitions) have error handling, timeout guards, and idempotency checks.
5. **Testing**: Unit/domain tests are written with mocks for AI providers and browser contexts.
6. **Documentation Update**: Any architectural or contract evolution is reflected in the relevant file in `docs/`.
