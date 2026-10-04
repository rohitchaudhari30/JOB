# SECURITY.md — Security Architecture, Session Encryption & Threat Mitigation

## 1. Security Tenets & Zero-Trust Model

- **No Plaintext Passwords**: Password-less, authenticated browser session tokens (`storage_state`) are used for portal automation. User login credentials for external portals are **never** requested or saved.
- **Envelope Encryption**: All sensitive portal cookies, local storage blobs, and external API tokens are encrypted at rest using authenticated **AES-256-GCM**.
- **Least Privilege Access**: API endpoints enforce user-ownership checks ensuring a tenant can only view, modify, or trigger automation for their own candidate profile and applications.
- **Sanitized Logging & Live Streams**: Personal Identifiable Information (PII), email addresses, phone numbers, auth tokens, and session cookies are strictly scrubbed from structured log output and masked during live visual streams.

---

## 2. Browser Session Storage State Encryption

```
                    ┌────────────────────────────────────────┐
                    │ Raw Playwright StorageState JSON Blob  │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │    AES-256-GCM Encryption     │
                        │ (Using 32-byte ENCRYPTION_KEY)│
                        └───────────────┬───────────────┘
                                        │
                                        ▼
         ┌─────────────────────────────────────────────────────────────┐
         │ Encrypted Base64 Payload: IV (12B) + Tag (16B) + Ciphertext │
         └──────────────────────────────┬──────────────────────────────┘
                                        │
                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │ Stored in DB: browser_sessions (Postgres/DB) │
                 └──────────────────────────────────────────────┘
```

---

## 3. Live Streaming Privacy & Visual Masking

- **WebSocket Stream Security**: Visual browser frames and timeline events are broadcast exclusively over TLS-encrypted WebSocket connections (`wss://`) authenticated via scoped JWT bearer tokens.
- **Tenant Scope Isolation**: Users can only subscribe to active live automation runs belonging directly to their authenticated `user_id`.
- **Sensitive Field Masking**: During frame captures, password inputs and sensitive authentication token fields are masked in the DOM before snapshotting to prevent inadvertent credential leakage.

---

## 4. Threat Model & Mitigations

| Threat Vector | Potential Impact | Preventive Control / Mitigation |
|---|---|---|
| **Credential Theft via DB Compromise** | Exposure of user portal sessions | AES-256-GCM encryption with master key in environment variables outside the database. |
| **Double Application / Race Condition** | Accidental repeated applications | Composite unique database constraints + unique idempotency keys per application attempt. |
| **Bot Detection / IP Blacklisting** | Account throttling or verification locks | Random human-like input delays, realistic headers, stealth scripts, and strict cooldown limits. |
| **Malicious Resume Upload (RCE/XSS)** | Server compromise or parser crash | MIME-type validation, file size caps ($5\text{ MB}$), filename sanitization, and sandboxed text extraction. |
| **AI Prompt Injection in JDs** | AI hijacking or jailbreaks during parsing | Strict system prompts with output schema enforcement and JSON validation via Pydantic. |
| **Automated Anti-Bot Bypass Attempts** | Account ban / Terms violation | Strict human-in-the-loop pause protocol for OTP, CAPTCHA, and 2FA. |

---

## 5. Human-In-The-Loop Safety & Takeover Policy

When a verification modal or anti-bot challenge is detected:
1. Browser execution **halts immediately**.
2. Application state transitions to `PAUSED_OTP` or `PAUSED_CAPTCHA`.
3. An urgent WebSocket alert is dispatched to the candidate's Live Automation Console.
4. The candidate clicks **"Take Control"** and completes the challenge in their browser window.
5. Once verified, the candidate clicks **"Resume"**, and the worker securely continues the automation workflow.
