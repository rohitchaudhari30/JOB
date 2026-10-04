# API.md — RESTful API & WebSocket Contracts

## 1. Authentication & Security Headers

All protected REST and WebSocket endpoints require the HTTP Bearer Authorization token:
```http
Authorization: Bearer <JWT_ACCESS_TOKEN>
```
For WebSocket handshakes: `ws://localhost:8000/api/v1/ws?token=<JWT_ACCESS_TOKEN>`

---

## 2. REST API Endpoints

### 2.1 Authentication (`/api/v1/auth`)
- `POST /register`: Register a new user account.
  - *Request*: `{ "email": "user@example.com", "password": "...", "full_name": "John Doe" }`
  - *Response* ($201$): `{ "id": "...", "email": "user@example.com", "access_token": "...", "token_type": "bearer" }`
- `POST /login`: Authenticate and receive a JWT token.
  - *Request*: `{ "email": "user@example.com", "password": "..." }`
  - *Response* ($200$): `{ "access_token": "...", "token_type": "bearer", "expires_in": 86400 }`
- `GET /me`: Fetch authenticated user profile.

### 2.2 Profile Management (`/api/v1/profile`)
- `GET /`: Retrieve candidate profile with experiences, educations, and skills.
- `PUT /`: Update candidate profile details.
  - *Request*: `{ "headline": "Senior Data Engineer", "current_ctc": 1800000, "expected_ctc": 2400000, "notice_period_days": 30, "location": "Bangalore", "work_authorization": "Citizen", ... }`
- `POST /experiences`: Add work experience entry.
- `PUT /experiences/{id}`: Update work experience.
- `DELETE /experiences/{id}`: Delete work experience.
- `POST /skills`: Bulk add/update candidate skills.
- `GET /saved-answers`: List all personal Q&A knowledge base entries.
- `POST /saved-answers`: Add or update a verified Q&A entry.

### 2.3 Resumes (`/api/v1/resumes`)
- `GET /`: List uploaded resumes with metadata.
- `POST /upload`: Upload a new PDF/DOCX resume file (Multipart form).
  - *Form*: `file: binary`, `label: "Data Engineer Resume"`, `target_role: "Data Engineer"`, `is_default: true`
  - *Response* ($201$): `{ "id": "...", "file_name": "resume.pdf", "parsed_skills": ["Python", "Spark", "SQL"], ... }`
- `DELETE /{id}`: Delete a resume.

### 2.4 Platform Connections & Authorized Sessions (`/api/v1/connections`)
- `GET /`: List all available job discovery portals (Naukri, LinkedIn) and ATS connectors (Greenhouse, Lever, Workday, Ashby) with real-time status, capabilities, and health.
- `POST /{platform}/connect`: Initiate interactive headed browser login session (user logs in directly on portal, system securely extracts and encrypts `storage_state` via AES-256-GCM).
- `POST /{platform}/verify`: Probe live session validity and return health status (`CONNECTED` vs `REAUTH_REQUIRED`).
- `POST /{platform}/disconnect`: Revoke session and purge encrypted storage state.

### 2.5 Job Discovery & Matching (`/api/v1/jobs`)
- `GET /`: Paginated list of discovered jobs with multi-attribute filtering.
  - *Query Parameters*: `q` (keyword), `location`, `source_type`, `posted_within` (`1h`, `3h`, `6h`, `12h`, `24h`, `3d`, `7d`, `14d`, `30d`), `freshness_bucket`, `min_score`, `sort_by` (`newest`, `freshness`, `salary`, `created_at`), `page`, `page_size`.
  - *Response* ($200$): `{ "items": [...], "total": 128, "page": 1, "page_size": 20 }`
- `GET /{id}`: Detailed job description with extracted requirements, freshness temporal metrics (`posted_at`, `raw_posted_text`, `freshness_bucket`, `freshness_score`), and match evaluation.
- `POST /discover`: Trigger immediate job discovery run for selected sources with keyword and location criteria.
- `GET /matches`: Filtered list of matched jobs with AI scoring breakdown, freshness score, and policy decision.
- `POST /matches/{id}/evaluate`: Manually re-run matching cascade against a specific resume.

### 2.6 Application Automation & Control (`/api/v1/applications`)
- `GET /`: List applications with status filter (`APPLIED`, `APPROVAL_REQUIRED`, `PAUSED_OTP`, `PAUSED_CAPTCHA`, `FAILED`).
- `GET /{id}`: Detailed application audit history (steps taken, questions asked, answers filled, screenshot on failure).
- `POST /{id}/approve`: Approve an application in `APPROVAL_REQUIRED` state to enqueue for submission.
- `POST /{id}/resume`: Signal browser worker to resume after human intervention on `PAUSED_OTP` / `PAUSED_CAPTCHA`.
- `POST /{id}/take-control`: Request interactive takeover of browser window for manual intervention.
- `POST /{id}/stop`: Immediately terminate active browser application run.
- `POST /{id}/reject`: User manually skips or rejects the job application.

### 2.7 Automation Rules & Orchestration (`/api/v1/automation`)
- `GET /rules`: List automation rules (target roles, locations, minimum match score, auto-apply toggle, `max_job_age_hours`, `freshness_weight`).
- `POST /rules`: Create/update automation rule.
- `POST /start-run`: Start an interactive or headless automation run.
  - *Request*: `{ "keywords": "Data Engineer", "location": "Bangalore", "platform": "naukri", "headless": false, "auto_apply": false, "max_job_age_hours": 24, "prefer_fresh_hours": 3, "freshness_weight": 0.20 }`
  - *Response* ($200$): `{ "run_id": "...", "status": "RUNNING", "message": "Automation run initiated" }`
- `GET /schedules`: List configured scheduled cron/interval runs.
- `POST /schedules`: Create new scheduled automation run.

### 2.8 Analytics (`/api/v1/analytics`)
- `GET /overview`: High-level metrics (Total applications submitted, daily breakdown, response rate, avg match score).
- `GET /ai-usage`: Total AI token usage, latency, and estimated cost breakdown by provider and model.

---

## 3. WebSocket Real-Time Stream & Live Console (`/api/v1/ws`)

### 3.1 Connection Protocol
- **Endpoint**: `ws://localhost:8000/api/v1/ws?token=<JWT_TOKEN>`
- **Channels Supported**:
  - `visual_frames`: Periodic base64 JPEG screenshots of active browser session ($5\text{--}10\text{ FPS}$).
  - `automation_timeline`: Structured domain events (search, match, fill, challenge).

### 3.2 Server-to-Client Domain Event Message
```json
{
  "type": "AUTOMATION_EVENT",
  "run_id": "run_98a7b6c5",
  "session_id": "sess_112233",
  "platform": "naukri",
  "timestamp": "2026-10-04T15:30:18.412Z",
  "event_name": "FIELD_FILLED",
  "display_message": "Filled Notice Period: 30 Days",
  "data": {
    "field_intent": "NOTICE_PERIOD",
    "value_filled": "30 Days",
    "step": "1 of 2",
    "confidence": 0.98
  }
}
```

### 3.3 Server-to-Client Visual Frame Message
```json
{
  "type": "BROWSER_FRAME",
  "run_id": "run_98a7b6c5",
  "timestamp": "2026-10-04T15:30:18.500Z",
  "frame_jpeg_base64": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDA..."
}
```

### 3.4 Client-to-Server Live Control Commands
```json
{
  "command": "PAUSE" | "RESUME" | "TAKE_CONTROL" | "STOP",
  "run_id": "run_98a7b6c5",
  "payload": {
    "reason": "USER_MANUAL_PAUSE"
  }
}
```
