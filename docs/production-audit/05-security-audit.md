# 05. Security & Threat Model Audit

## Comprehensive Threat Defense, OWASP Top 10 Evaluation, and Vulnerability Analysis

This security audit inspects the authentication lifecycle, multi-tenant access control boundaries, cryptographic implementations, network attack surfaces, and external link safety guards across AutoApply.ai.

---

### 1. OWASP Top 10 Assessment Matrix

| Threat Category | Risk Level in AutoApply.ai | Mitigating Controls Verified in Code | Verdict |
|---|---|---|---|
| **A01: Broken Access Control (IDOR)** | Critical | Every database repository query strictly binds `WHERE user_id = :current_user_id`. Verified by `test_access_control_probe.py` (4/4 passed). User B cannot read or alter User A's jobs, resumes, applications, or campaigns. | **SECURE** |
| **A02: Cryptographic Failures** | High | Passwords hashed using `bcrypt` (work factor 12). Browser session storage state encrypted with `AES-256-GCM` via Fernet/AES. Throwaway dev keys rejected in production (`validate_production_secrets`). | **SECURE** |
| **A03: Injection (SQL / Command)** | High | 100% parameterized queries via SQLAlchemy 2.0 ORM. Zero raw SQL string interpolation. Playwright controlled-browser inputs sanitized against command injection. | **SECURE** |
| **A04: Insecure Design** | Medium | Single-flight deduplication (`SingleFlightEvaluator`) prevents AI compute exhaustion. Rate limits on auth routes. Daily submission caps prevent account bans. | **SECURE** |
| **A05: Security Misconfiguration** | High | Security headers middleware enforces `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'self'`, and `Strict-Transport-Security` (HTTPS only). | **SECURE** |
| **A06: Vulnerable Dependencies** | Low | Dependencies locked in `package-lock.json` and `requirements.txt`. Zero unvetted third-party runtime evaluators. | **SECURE** |
| **A07: Identification & Auth Failures** | Critical | Short-lived JWTs (15 min) + HttpOnly SameSite=Strict refresh cookies. `tokens_valid_after` invalidates old tokens upon password change. Logout clears cookies and revokes tokens. | **SECURE** |
| **A08: Software & Data Integrity** | Medium | Resume uploads validated against magic bytes (PDF `%PDF-`, DOCX ZIP magic bytes) up to 10MB limit. No unverified third-party executable code. | **SECURE** |
| **A09: Logging & Monitoring Failures** | Medium | Structured logging across all API controllers. Passwords, secrets, and raw tokens automatically redacted from log strings. | **SECURE** |
| **A10: SSRF & External Link Hijacking** | High | Strict URL scheme validation (`validate_external_url`) permits ONLY `http:` and `https:`. Rejects `file://`, `javascript:`, `ftp://`, loopback (`127.0.0.1`), link-local (`169.254.169.254`), and private RFC 1918 ranges in production mode. | **SECURE** |

---

### 2. Multi-Tenancy & Access Control Probe Verification

In `backend/tests/integration/test_access_control_probe.py`:
- **Anonymous Access**: All non-public endpoints automatically return `401 Unauthorized`.
- **Route Classification**: Every endpoint requiring an ID parameter (`{id}`, `{job_id}`, `{run_id}`) is categorized and enforces user ownership checks.
- **Cross-Tenant Attack Simulation**: An attacker authenticated as User B attempting to read, update, or delete User A's resources receives `404 Not Found` or `403 Forbidden`. No state leakage occurs.

---

### 3. External URL Safety & SSRF Defenses (DEF-01)

The external job URL handler in `backend/app/domain/jobs/url_safety.py` and frontend `SafeExternalLink.tsx` enforces:
1. **Scheme Allowlist**: Only `http:` and `https:` are permitted.
2. **SSRF Blocking**: Rejects private and internal hostnames in production:
   - `localhost`, `127.0.0.1`, `::1`
   - Cloud metadata IP: `169.254.169.254`
   - RFC 1918 subnets: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
3. **Frontend Rendering**: If an external URL is invalid or unsafe, the UI renders the job source label as non-clickable plain text with an explanatory tooltip, preventing click-jacking or arbitrary scheme invocation (`javascript:`, `data:`).

---

### 4. WebSocket Authentication & Ticket Hijacking Defense

WebSocket connections (`/api/v1/ws/automation/{run_id}`) do not accept long-lived JWTs in query parameters (which could leak into server access logs):
1. **Ticket Protocol**: The client calls `POST /api/v1/automation/runs/{run_id}/ticket` with a valid Bearer token.
2. **Ephemeral Ticket**: A cryptographically random ticket (UUID4) is generated, bound to the user ID and run ID, with a 60-second TTL.
3. **Single-Use Burn**: When the WebSocket connects, the ticket is immediately consumed and deleted from memory. Any subsequent attempt to reuse the ticket is refused.
