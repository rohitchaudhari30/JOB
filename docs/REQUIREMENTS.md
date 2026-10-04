# REQUIREMENTS.md — System & Functional Requirements

## 1. Product Vision & Goals

The **Job Automation Platform** is an enterprise-grade, intelligent SaaS platform designed to automate the entire lifecycle of job discovery, match evaluation, customized application submission, and interview tracking.

Unlike brittle single-site scrapers or bot scripts, this system provides:
- A standardized **Adapter Architecture** supporting diverse job portals (Naukri, LinkedIn) and ATS platforms (Greenhouse, Lever, Workday, Ashby, iCIMS, Rippling).
- A **Dynamic Form & Question Engine** that understands form structure semantically without fragile CSS selector dependencies.
- A **Cost-Optimized Multi-Tier AI Matching Engine** (Groq primary + Gemini fallback).
- A **Human-in-the-Loop Safety Model** pausing for OTP/CAPTCHA/2FA and requesting user intervention seamlessly.

---

## 2. Requirement Priority Classification (RFC 2119)

- **MUST**: Essential for core functional compliance and safety.
- **SHOULD**: Highly recommended for operational reliability and user experience.
- **MAY**: Optional or nice-to-have optimizations.
- **FUTURE**: Planned for later enterprise phases.

---

## 3. Functional Requirements

### 3.1 Candidate Profile & Resume Management
- **FR-PRF-001 (MUST)**: Support comprehensive candidate profiles including contact information, work experience, education, skills, certifications, salary expectations, notice period, location preferences, and work authorization status.
- **FR-PRF-002 (MUST)**: Support multiple resumes in PDF/DOCX formats with versioning and target role tagging (e.g. "Data Engineer", "Backend Developer").
- **FR-PRF-003 (SHOULD)**: Automated resume text extraction and structured parsing into profile attributes via AI Gateway on upload.
- **FR-PRF-004 (MUST)**: Maintain a personal Question & Answer Knowledge Base (`saved_answers`) mapped to canonical intents (e.g. `NOTICE_PERIOD`, `EXPECTED_CTC`, `WORK_AUTHORIZATION`).

### 3.2 Job Source Management & Authentication
- **FR-SRC-001 (MUST)**: Support isolated browser session storage per user and job platform (`storage_state` containing authenticated cookies/local storage).
- **FR-SRC-002 (MUST)**: Strictly forbid plaintext password storage. All browser session storage states must be encrypted at rest using AES-256-GCM.
- **FR-SRC-003 (MUST)**: Pre-flight session health check to verify authentication status before triggering discovery or application runs.

### 3.3 Job Discovery, Freshness & Normalization
- **FR-DSC-001 (MUST)**: Execute automated job searches based on user-defined dynamic automation rules (roles, locations, experience, date posted).
- **FR-DSC-002 (MUST)**: Normalize job listings into a unified schema (`jobs`) containing standardized title, company, locations, raw description, parsed requirements, salary range, employment type, and source external ID.
- **FR-DSC-003 (MUST)**: Enforce deduplication at the database level using composite unique indexes (`source_id` + `external_job_id`).
- **FR-FRSH-001 (MUST)**: Parse and normalize noisy relative source portal dates ("Just now", "45 mins ago", "3 hours ago", "Today", "Yesterday", "3 days ago", "2 weeks ago") into standardized UTC timestamps (`posted_at`).
- **FR-FRSH-002 (MUST)**: Maintain temporal separation between `posted_at` (actual job posting age), `first_seen_at` (system first discovery timestamp), and `last_seen_at` (most recent scrape encounter). Never overwrite `posted_at` with discovery time.
- **FR-FRSH-003 (MUST)**: Categorize every normalized job into dynamic Freshness Buckets (`JUST_NOW`, `LAST_1_HOUR`, `LAST_3_HOURS`, `LAST_6_HOURS`, `LAST_12_HOURS`, `LAST_24_HOURS`, `LAST_3_DAYS`, `LAST_7_DAYS`, `LAST_14_DAYS`, `LAST_30_DAYS`, `OLDER_THAN_30_DAYS`).
- **FR-FRSH-004 (MUST)**: Compute a configurable Freshness Score ($0\text{--}100$) incorporated as a primary weighted ranking dimension in the Multi-Stage Matching Engine.
- **FR-FRSH-005 (MUST)**: Provide hard freshness gates in Automation Rules (e.g. "Only auto-apply to jobs posted within 24 hours").
- **FR-FRSH-006 (MUST)**: Store `raw_posted_text`, `posted_at_precision` (`EXACT`, `APPROXIMATE`, `UNKNOWN`), and `posted_at_source` for complete auditability.

### 3.4 Multi-Stage Matching & Decision Engine
- **FR-MCH-001 (MUST)**: Execute Stage 1 Hard Filters (Location, Minimum Experience, Minimum Salary, Remote Preferences). Non-matching jobs are marked `REJECTED` or `SKIPPED` with 0 AI API cost.
- **FR-MCH-002 (MUST)**: Execute Stage 2 Structured Skill Overlap scoring based on mandatory and preferred candidate skills.
- **FR-MCH-003 (MUST)**: Execute Stage 3 Semantic Similarity calculation (Local cosine similarity in Phase 1; `pgvector` in Production).
- **FR-MCH-004 (MUST)**: Execute Stage 4 Groq Reasoning to generate nuanced match scores ($0\text{--}100$), matched skills list, missing skills, and detailed pros/cons reasoning.
- **FR-MCH-005 (SHOULD)**: Execute Stage 5 Gemini Validation when match confidence is borderline or for high-CTC target roles.
- **FR-MCH-006 (MUST)**: Dedicated **Policy/Decision Engine** to evaluate match results against user automation rules:
  - $\ge 90\% \implies \text{AUTO\_APPLY}$ (if auto-apply enabled) or $\text{SHORTLISTED}$
  - $75\text{--}89\% \implies \text{APPROVAL\_REQUIRED}$
  - $60\text{--}74\% \implies \text{SAVED}$
  - $< 60\% \implies \text{REJECTED}$

### 3.5 Dynamic Application & Form Automation
- **FR-APP-001 (MUST)**: Dynamically detect form fields on job application pages using heuristic DOM inspection, accessibility labels, and semantic intent classification.
- **FR-APP-002 (MUST)**: Support multi-step wizard applications (Step 1 of $N$) with field validation before triggering navigation.
- **FR-APP-003 (MUST)**: Semantic option resolution for dropdowns and radio buttons (mapping candidate profile values to closest UI option).
- **FR-APP-004 (MUST)**: Automatic resume file attachment to target file input elements.
- **FR-APP-005 (MUST)**: Dynamic screening question resolution:
  1. Check `saved_answers` knowledge base by intent.
  2. If unknown, invoke AI Gateway to generate context-grounded response.
  3. If confidence is below threshold, request user review.

### 3.6 Human-in-the-Loop & Safety Controls
- **FR-SAF-001 (MUST)**: Transition application state to `PAUSED_OTP` upon detecting SMS/Email OTP modals, dispatch WebSocket alert to UI, and await user verification.
- **FR-SAF-002 (MUST)**: Transition application state to `PAUSED_CAPTCHA` upon detecting visual challenges, alert user to solve in browser, and resume.
- **FR-SAF-003 (MUST)**: Never attempt automated bypass of anti-bot or security verification systems.

### 3.7 Application Tracking & Observability
- **FR-TRK-001 (MUST)**: Immutable audit history of every application attempt (`applications`, `application_events`, `application_questions`, `application_answers`).
- **FR-TRK-002 (MUST)**: Capture screenshot and Playwright trace artifacts on application failures for debugging.
- **FR-TRK-003 (MUST)**: Real-time execution telemetry streaming to frontend over WebSockets.

---

## 4. Non-Functional Requirements

- **NFR-PERF-001 (Performance)**: API endpoint responses $\le 200\text{ ms}$ for standard CRUD operations.
- **NFR-PERF-002 (AI Latency)**: Groq reasoning queries $\le 1.5\text{ s}$ per job description.
- **NFR-SEC-001 (Security)**: All secrets, session storage states, and API keys encrypted at rest with AES-256-GCM.
- **NFR-SEC-002 (Data Privacy)**: No personal candidate data or session cookies included in server log output.
- **NFR-REL-001 (Reliability)**: Browser worker crashes must be isolated per task without bringing down API or scheduler.
- **NFR-EXT-001 (Extensibility)**: Adding a new job platform requires adding an adapter file in `infrastructure/browser/adapters/` without altering core application use cases.
