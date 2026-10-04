# 🚀 Enterprise Job Automation Platform

A production-grade, adapter-driven platform for automated job discovery, intelligent multi-tier matching, dynamic form automation, screening question generation, real-time live browser streaming, and application lifecycle tracking.

---

## 🌟 Key Capabilities

- **Live Automation Console (Dual-Stream)**: Real-time visual frame streaming (5–10 FPS) coupled with human-friendly automation event timeline over WebSockets. Includes **"Take Control"**, Pause, Resume, and Stop capabilities.
- **Modular Adapter Architecture**: Decoupled discovery and application engines for multiple platforms (Naukri, LinkedIn, Greenhouse, Lever, Workday, Ashby, etc.) without platform-specific code in domain logic.
- **Dynamic Form Engine**: Heuristic DOM analyzer and semantic intent mapping (First Name, CTC, Notice Period, Visa, Relocation) to navigate complex ATS forms without brittle CSS selectors.
- **5-Stage Hybrid Matching Cascade**:
  1. *Hard Filters* (Location, Min Experience, Salary, Remote) $\to$ $0$ API cost.
  2. *Structured Skill Overlap* (Set / Jaccard / Fuzzy matching) $\to$ $0$ API cost.
  3. *Embedding Semantic Similarity* (Local similarity in Dev / `pgvector` in Prod).
  4. *Groq Fast Reasoning* (Llama-3 sub-second parsing & match score generation).
  5. *Gemini Fallback & Validation* (Handles ambiguous JDs or high-impact validation).
- **Human-in-the-Loop Safety**: Automatic state transitions to `PAUSED_OTP` / `PAUSED_CAPTCHA` with WebSocket alerts for user intervention—no brittle bot-bypass hacks.
- **Strict FSM & Idempotency**: Finite state machine with composite uniqueness constraints to guarantee zero double-applications.
- **Pluggable Infrastructure**: Clean/Hexagonal design enabling seamless evolution from local SQLite/TaskQueue to PostgreSQL + pgvector + Redis + Celery.

---

## 🏗️ Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │       React + TypeScript Web UI        │
                      │  (Dashboard, Live Console, Tracker)    │
                      └───────────────────┬────────────────────┘
                                          │ REST / WebSockets
                                ┌─────────┴─────────┐
                                │                   │
                            REST API            WebSocket
                                │           ┌───────┴────────┐
                                │           │                │
                                │      Live Events      Browser Frames
                                ▼           ▼                ▼
                            ┌────────────────────────────────────┐
                            │          FastAPI Backend           │
                            │  ┌──────────────────────────────┐  │
                            │  │  Application / Domain Layer  │  │
                            │  └──────────────┬───────────────┘  │
                            └─────────────────┼──────────────────┘
                                              │
                   ┌──────────────────────────┼──────────────────────────┐
                   ▼                          ▼                          ▼
       ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
       │   Playwright Engine   │  │      AI Gateway       │  │   Repository Layer    │
       │  (Isolated Sessions)  │  │ (Groq + Gemini Fall)  │  │  (SQLite → Postgres)  │
       └───────────────────────┘  └───────────────────────┘  └───────────────────────┘
```

---

## 📂 Project Structure

```
Automation_Tool/
├── backend/
│   ├── app/
│   │   ├── api/                 # API controllers & WebSocket live streams
│   │   ├── application/         # Use case orchestrators (Profile, Jobs, Matching, Apps, Automation)
│   │   ├── domain/              # Pure domain models, entities, value objects, contracts
│   │   ├── infrastructure/      # Database models, AI Gateway, Playwright, Adapters, Storage
│   │   ├── workers/             # Discovery, Matching, Application, Scheduler background tasks
│   │   └── core/                # Configuration, cryptography, security, logging
│   ├── tests/                   # Pytest test suite
│   ├── alembic/                 # Database migrations
│   ├── requirements.txt
│   └── main.py
├── frontend/                    # Modern React + Vite UI (Phase 6+)
├── docs/                        # Complete technical specifications & contracts
├── README.md
├── PHASE.md
├── AGENTS.md
└── CLAUDE.md
```

---

## 📚 Technical Documentation Index

For in-depth architecture, data schemas, API contracts, and operating guides, refer to `docs/`:

1. [Phased Implementation Blueprint](file:///d:/Matisaar%20Projects/Automation_Tool/docs/PHASE.md)
2. [Live Automation Console & Dual-Stream](file:///d:/Matisaar%20Projects/Automation_Tool/docs/LIVE_AUTOMATION.md)
3. [Requirements & Vision](file:///d:/Matisaar%20Projects/Automation_Tool/docs/REQUIREMENTS.md)
4. [System Architecture](file:///d:/Matisaar%20Projects/Automation_Tool/docs/ARCHITECTURE.md)
5. [Engineering Design Principles](file:///d:/Matisaar%20Projects/Automation_Tool/docs/DESIGN.md)
6. [End-to-End Workflows](file:///d:/Matisaar%20Projects/Automation_Tool/docs/FLOW.md)
7. [Database Schema & Migrations](file:///d:/Matisaar%20Projects/Automation_Tool/docs/DATABASE.md)
8. [API & WebSocket Contracts](file:///d:/Matisaar%20Projects/Automation_Tool/docs/API.md)
9. [AI Gateway & Matching Engine](file:///d:/Matisaar%20Projects/Automation_Tool/docs/AI.md)
10. [Browser Automation & Playwright](file:///d:/Matisaar%20Projects/Automation_Tool/docs/BROWSER_AUTOMATION.md)
11. [Adapter Architecture & Registry](file:///d:/Matisaar%20Projects/Automation_Tool/docs/ADAPTERS.md)
12. [Security & Session Protection](file:///d:/Matisaar%20Projects/Automation_Tool/docs/SECURITY.md)
13. [Dynamic Configuration](file:///d:/Matisaar%20Projects/Automation_Tool/docs/CONFIGURATION.md)
14. [Workers & Scheduling](file:///d:/Matisaar%20Projects/Automation_Tool/docs/WORKERS_AND_SCHEDULING.md)
15. [State Machine & Transitions](file:///d:/Matisaar%20Projects/Automation_Tool/docs/STATE_MACHINE.md)
16. [Testing Strategy](file:///d:/Matisaar%20Projects/Automation_Tool/docs/TESTING.md)
17. [Observability & Telemetry](file:///d:/Matisaar%20Projects/Automation_Tool/docs/OBSERVABILITY.md)
18. [Deployment & Environment Migration](file:///d:/Matisaar%20Projects/Automation_Tool/docs/DEPLOYMENT.md)
19. [Implementation Roadmap](file:///d:/Matisaar%20Projects/Automation_Tool/docs/ROADMAP.md)

---

## ⚡ Getting Started (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 18+ (for frontend)
- Git

### Backend Setup
1. **Clone & Setup Virtual Environment**:
   ```powershell
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r backend/requirements.txt
   playwright install chromium
   ```
2. **Configure Environment Variables**:
   ```powershell
   copy .env.example .env
   # Update GROQ_API_KEY and GEMINI_API_KEY in .env
   ```
3. **Initialize Database**:
   ```powershell
   alembic upgrade head
   ```
4. **Start Backend API Server**:
   ```powershell
   uvicorn backend.main:app --reload --port 8000
   ```

---

## 🔒 Security & Safe Automation Notice

This system enforces authorized browser automation:
- It **never** bypasses OTP, CAPTCHA, or multi-factor authentication.
- It **never** stores plaintext passwords.
- Users connect authorized sessions, and all automated steps respect platform rate limits and cooldown periods.
