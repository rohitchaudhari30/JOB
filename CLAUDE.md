# CLAUDE.md — Agent Execution Instructions

This file guides Claude and other AI assistants working in this repository.

---

## 1. Primary Rule: Read Documentation First

Before creating or editing any code in this repository:
1. Read `AGENTS.md` for mandatory engineering contracts and folder boundaries.
2. Read the relevant technical documentation in `docs/`:
   - System Architecture: [ARCHITECTURE.md](file:///d:/Matisaar%20Projects/Automation_Tool/docs/ARCHITECTURE.md)
   - Product Requirements: [REQUIREMENTS.md](file:///d:/Matisaar%20Projects/Automation_Tool/docs/REQUIREMENTS.md)
   - Database Schema: [DATABASE.md](file:///d:/Matisaar%20Projects/Automation_Tool/docs/DATABASE.md)
   - API Contracts: [API.md](file:///d:/Matisaar%20Projects/Automation_Tool/docs/API.md)
   - AI Architecture: [AI.md](file:///d:/Matisaar%20Projects/Automation_Tool/docs/AI.md)
   - Browser Automation: [BROWSER_AUTOMATION.md](file:///d:/Matisaar%20Projects/Automation_Tool/docs/BROWSER_AUTOMATION.md)
   - Adapters & Registry: [ADAPTERS.md](file:///d:/Matisaar%20Projects/Automation_Tool/docs/ADAPTERS.md)
   - State Machine: [STATE_MACHINE.md](file:///d:/Matisaar%20Projects/Automation_Tool/docs/STATE_MACHINE.md)
   - Workers & Scheduling: [WORKERS_AND_SCHEDULING.md](file:///d:/Matisaar%20Projects/Automation_Tool/docs/WORKERS_AND_SCHEDULING.md)
   - Security Policies: [SECURITY.md](file:///d:/Matisaar%20Projects/Automation_Tool/docs/SECURITY.md)

---

## 2. Non-Negotiable Development Constraints

- **Never create parallel or redundant architectures**: Reuse existing abstract base classes, repositories, and domain services.
- **Never bypass security controls**: Never attempt to write CAPTCHA solvers, OTP bypass hacks, or cloudflare bypassers. Use the `PAUSED_OTP` / `PAUSED_CAPTCHA` human-in-the-loop flow.
- **Never put business logic in route handlers or Playwright scripts**: Routes only validate inputs and invoke application use cases. Playwright only executes browser actions and returns normalized data.
- **Never hardcode dynamic attributes**: Roles, skills, salary bands, match thresholds, prompt templates, and AI model names must be loaded from settings or database models.
- **Never execute raw un-mocked AI calls in tests**: Mock `AIProvider` responses in test suites.

---

## 3. Common Development Commands

### Backend (Python / FastAPI)
- **Activate Virtual Environment**:
  ```powershell
  .venv\Scripts\Activate.ps1
  ```
- **Install Dependencies**:
  ```powershell
  pip install -r backend/requirements.txt
  playwright install chromium
  ```
- **Run FastAPI Development Server**:
  ```powershell
  uvicorn backend.main:app --reload --port 8000
  ```
- **Run Tests**:
  ```powershell
  pytest backend/tests/ -v
  ```
- **Run Database Migrations**:
  ```powershell
  alembic upgrade head
  ```

---

## 4. When Making Architecture Changes

If a requirement requires updating an interface, state machine transition, or database model:
1. Modify the domain interface and domain models first.
2. Update the corresponding technical specification in `docs/`.
3. Implement the infrastructure changes and database migration.
4. Add unit and integration tests.
