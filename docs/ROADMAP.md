# ROADMAP.md — Phased Implementation Plan

## 1. Phasing Strategy

Development follows a strict **Vertical Slice Implementation Strategy**—proving the core discovery, matching, dynamic form filling, real-time live streaming, and safety loops end-to-end with one adapter and SQLite before expanding to multi-platform adapters or distributed infrastructure.

For detailed milestone breakdowns, deliverables, and acceptance tests, see 👉 **[docs/PHASE.md](file:///d:/Matisaar%20Projects/Automation_Tool/docs/PHASE.md)**.

---

## 2. Phase Breakdown

```
[Phase 1: Foundation & DB] ──► [Phase 2: Playwright & Naukri] ──► [Phase 3: AI Matching Engine]
                                                                            │
[Phase 6: Multi-ATS & UI]  ◄── [Phase 5: Live Console & WS]   ◄── [Phase 4: Dynamic Form Engine]
           │
[Phase 7: Postgres & Redis] ──► [Phase 8: Advanced Analytics]
```

### Phase 1A: Backend Foundation & AI Gateway (Completed)
- [x] FastAPI project structure & Clean Architecture folder layout.
- [x] Environment settings, logging, and security crypto (`AES-256-GCM` session manager).
- [x] AI Gateway base abstraction with `GroqProvider` and `GeminiProvider` (plus cost/latency telemetry).
- [x] `LocalTaskQueue` in-process queue implementation.

### Phase 1B: Database Models & Repositories (Completed)
- [x] SQLAlchemy 2.0 ORM models (Auth, Profiles, Resumes, Jobs, Matches, Applications, AI Requests).
- [x] SQLite WAL configuration (`PRAGMA journal_mode=WAL;`).
- [x] Alembic migration initialization.
- [x] Repository implementations for profiles, jobs, and applications.

### Phase 2: Playwright Core, Initial Source Discovery & Temporal Freshness (Completed)
- [x] Browser Manager, Context Manager (isolated contexts, session injection, screenshot streamer).
- [x] `BaseJobSourceAdapter` contract and `AdapterRegistry`.
- [x] Naukri Discovery Adapter (search execution, pagination, job detail extraction).
- [x] Temporal Freshness Normalization pipeline (`PostedDateParser`, `FreshnessCalculator`, `FreshnessBucketEnum`).
- [x] Normalization pipeline and SQL deduplication engine with `touch_seen()`.

### Phase 3: Multi-Stage Hybrid Matching Engine (Completed)
- [x] Stage 1: Hard Filter rules (Experience, Location, Salary, Remote, and `max_job_age_hours` freshness hard filter).
- [x] Stage 2: Structured Skill Overlap calculator.
- [x] Stage 3: Embedding semantic similarity engine.
- [x] Stage 4: Groq AI nuance reasoning provider.
- [x] Stage 5: Gemini validation fallback.
- [x] Dynamic Freshness Score integration & weight configuration.
- [x] Decision / Policy Engine assigning `AUTO_APPLY`, `REQUIRE_APPROVAL`, `SAVE`, `SKIP`, `REJECT`.

### Phase 4: Dynamic Form Automation & Human-in-the-Loop Engine (Completed)
- [x] Heuristic DOM analyzer and accessibility scanner.
- [x] Semantic Intent Classifier (mapping fields to canonical intents).
- [x] Form Value Resolver (profile data, resume attachment, fuzzy dropdown matcher).
- [x] Dynamic screening question engine (Saved Q&A bank $\to$ AI Gateway $\to$ User pause).
- [x] Multi-step wizard navigation and submit verification.
- [x] Human-in-the-loop pause protocol (`PAUSED_OTP`, `PAUSED_CAPTCHA`).

### Phase 5: Live Automation Console, WebSockets & Scheduling (Completed)
- [x] Dual-stream WebSocket server (`/api/v1/ws`) for base64 visual frames + timeline events.
- [x] Interactive live controls (`PAUSE`, `RESUME`, `TAKE_CONTROL`, `STOP`).
- [x] In-process background scheduler (cron and interval runs).
- [x] Application Finite State Machine (FSM) validation.
- [x] Application tracker & immutable audit logger.

### Phase 6: Additional Source Adapters & React Web UI (Completed)
- [x] LinkedIn discovery and Easy Apply adapter.
- [x] ATS Adapters (Greenhouse, Lever, Workday, Ashby, iCIMS).
- [x] React + TypeScript Web Dashboard (Dashboard, Job Discovery with Freshness Filters, Live Automation Console with Freshness gate, Profile, Automation Rules).

### Phase 7: Production Infrastructure Migration
- [ ] SQLite $\to$ PostgreSQL 16+ with `pgvector` HNSW indexes.
- [ ] LocalTaskQueue $\to$ Redis 7+ and Celery/ARQ workers.
- [ ] Local storage $\to$ S3-compatible object storage.
- [ ] Containerized Playwright worker pools.

### Phase 8: Advanced Analytics & Learning
- [ ] Application conversion analytics (Interview rate by role, company, resume version).
- [ ] Match weight learning and optimization suggestions.
- [ ] Automated follow-up and reminder trackers.
