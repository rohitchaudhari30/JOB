# OBSERVABILITY.md — Structured Logging, Tracing & Metrics

## 1. Observability Architecture

Every transaction and automated background run carries a unified correlation context across all layers:

```
[Request / Run] ──► [Correlation ID: run_abc123] ──► [API] ──► [Worker] ──► [Playwright] ──► [AI Gateway]
                                                                   │
                                                                   ▼
                                                     [Live Console / WebSocket]
```

---

## 2. Structured JSON Logging Schema

All backend logs are emitted in structured JSON format with contextual metadata:

```json
{
  "timestamp": "2026-10-04T15:35:12.451Z",
  "level": "INFO",
  "logger": "app.workers.application",
  "correlation_id": "run_98f4e21a",
  "user_id": "usr_4a8b9c",
  "application_id": "app_112233",
  "job_id": "job_556677",
  "source": "naukri",
  "workflow_state": "FORM_FILLED",
  "message": "Successfully filled 14 form fields and attached resume.",
  "duration_ms": 1420
}
```

### Sanitization Policy
Logs are automatically filtered to strip:
- Passwords, JWT secrets, and bearer tokens.
- Encrypted `storage_state` payloads and session cookies.
- Raw phone numbers, emails, and street addresses.

---

## 3. Live Event Translation Engine

To avoid displaying low-level selector clicks to end users, the internal event dispatcher translates technical logs into structured user-facing timeline events:

| Internal Playwright Action | Translated User Console Event |
|---|---|
| `page.goto("naukri.com/...")` | `PAGE_NAVIGATED` ("Opening Naukri Search") |
| `input.fill("Senior Data Engineer")` | `FILTER_APPLIED` ("Applying Title: Senior Data Engineer") |
| `locator(".jobCard").count()` | `JOBS_DISCOVERED` ("Found 37 matching jobs") |
| `intent_resolver.fill("EXPECTED_CTC")` | `FIELD_FILLED` ("Filled Expected CTC: ₹24,00,000") |
| `challenge_detector.found_otp()` | `OTP_REQUIRED` ("SMS OTP Verification Detected") |

---

## 4. Metrics & Telemetry

### 4.1 Business & Application Metrics
- `applications_submitted_total` (counter, by source and user)
- `applications_failed_total` (counter, by source and failure reason)
- `match_score_distribution` (histogram, 0 to 100)
- `approval_latency_seconds` (time taken from `APPROVAL_REQUIRED` to user decision)

### 4.2 AI Performance & Cost Metrics
- `ai_request_duration_seconds` (histogram, by provider and operation)
- `ai_tokens_consumed_total` (counter, prompt tokens and completion tokens)
- `ai_estimated_cost_usd_total` (counter, estimated financial cost)
- `ai_fallback_triggered_total` (counter, times Groq failed and Gemini was invoked)

### 4.3 Browser Worker & Live Streaming Health
- `browser_context_active_gauge` (current concurrent active Chromium contexts)
- `live_stream_fps_gauge` (current visual frame rate delivered over WebSockets)
- `form_fill_duration_seconds` (time to complete multi-step wizard)
- `challenge_detected_total` (counter, by challenge type: OTP, CAPTCHA)

---

## 5. Playwright Failure Tracing & Artifact Retention

When an application execution fails or pauses unexpectedly:
1. **Screenshot Capture**: Saved to `./storage/screenshots/{application_id}_fail.png`.
2. **Playwright Trace Archive**: Saved to `./storage/traces/{application_id}_trace.zip`.
3. **Artifact Retention Policy**: Traces and screenshots are retained for 14 days in development and 30 days in production before automated garbage collection.
