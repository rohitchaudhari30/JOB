# AutoApply.ai — Job Detail Page Adversarial QA & Forensic Audit Report
**Document Version**: 1.1.0 (Evidence-Validated & Reconciled)  
**Audit Type**: Full-Stack Adversarial Break-It Audit, Security Probe & Algorithmic Integrity Assessment  
**Date**: October 2026  
**Auditor**: Lead Principal Software Engineer, Senior QA Architect & Adversarial Application Auditor  

---

## 1. Executive Summary & Audit Reconciliations

This forensic audit report documents the adversarial break-it testing of the complete **Job Detail** experience and CV optimization subsystem in AutoApply.ai. Rather than trusting unit test summaries or static claims, the investigation challenged the interactive elements, data streams, scoring algorithms, and security boundaries.

### 1.1 Reconciliation of Previous Documentation Discrepancies
* **Test Case Count & Status Reconciliation**:
  - Preliminary test matrix headers noted 45 planned, 42 passed, and 3 failed.
  - Reconciled inspection confirms: **46 Total Planned Cases**, **45 Executed**, **40 Passed**, **5 Failed (Confirmed Defects)**, and **1 Formally Blocked**.
  - The 5 failed test cases map to confirmed findings `DEF-01` (`TC-JD-016`), `DEF-02` (`TC-JD-014`), `DEF-03` (`TC-JD-010`), `DEF-04` (`TC-JD-007`), and `DEF-05` (`TC-JD-012`).
  - An additional finding `DEF-06` covers silent error swallowing and hardcoded name fallback in [`TailorResumeDialog.tsx`](file:///d:/AutoApply.ai-main/frontend/src/pages/jobs/tailor/TailorResumeDialog.tsx).
* **Live Job Board Fencing**:
  - Previous draft claimed "0 Blocked / 0 Untested" while simultaneously stating live job-board submissions were fenced.
  - Reconciled: Live external portal submissions are explicitly cataloged under `TC-JD-046` with status `BLOCKED (Safety Fenced)`.

---

## 2. Reconciled Test Execution Summary

| Domain | Tests Executed | Tests Passed | Defects Discovered | Status |
| :--- | :---: | :---: | :---: | :---: |
| **Frontend Component & Logic (Vitest)** | 207 | 207 | 0 regressions | **100% PASS** |
| **Backend Architecture & Linter** | 6 | 6 | 0 errors | **100% PASS** |
| **Backend Integration & Matching APIs** | 32 | 32 | 0 failures | **100% PASS** |
| **Domain State, Rules & Document Editors** | 39 | 39 | 0 failures | **100% PASS** |
| **Access Control & BOLA/IDOR Probe** | 12 | 12 | 0 breaches | **100% PASS** |
| **Adversarial Edge & Interactive Tests** | 45 | 40 | 5 failures | **88.9% PASS** |
| **Live External Portals (Third-Party ATS)** | 1 | 0 | 0 | **BLOCKED (Fenced)** |

---

## 3. Independent Reproduction & Analysis of Confirmed Findings

### Finding DEF-01: Unsanitized External Job Link Allows Non-HTTP Protocols (P2 - Medium)
* **Status**: **CONFIRMED (Active Defect)**
* **Location**: `frontend/src/pages/jobs/JobDetailDrawer.tsx` lines 328–338
* **Exact Code**:
  ```tsx
  {model.applyUrl && (
    <a href={model.applyUrl} target="_blank" rel="noreferrer" className="...">
      <ExternalLink className="w-3.5 h-3.5" />
      <span>Job Link</span>
    </a>
  )}
  ```
* **Reproduction Evidence**:
  - Supplying `model.applyUrl = "javascript:alert(1)"` or `"data:text/html,<script>alert(1)</script>"` renders directly in DOM.
  - Supplying relative strings like `"boards.greenhouse.io/job/123"` (missing scheme) causes the browser to navigate to an internal relative route (`http://localhost:5173/boards.greenhouse.io/job/123`), producing a 404.
* **Challenging URL Safety**:
  - Mere regex checks like `/^https?:\/\//` can fail on leading whitespace or bypasses (`https://` preceded by null bytes or spaces).
  - **Industry-Standard Recommendation**: Validate using the browser's native WHATWG `new URL()` parser:
    ```ts
    function getSafeExternalUrl(raw?: string): string | null {
      if (!raw || typeof raw !== 'string') return null;
      const trimmed = raw.trim();
      if (!trimmed) return null;
      try {
        const u = new URL(trimmed);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
      } catch {
        return null;
      }
    }
    ```

---

### Finding DEF-02: Rapid Re-click on "Evaluate fit" Dispatches Duplicate Calls & Risks DB Race (P2 - Medium)
* **Status**: **CONFIRMED (Active Defect)**
* **Location**: `frontend/src/hooks/useJobActions.ts` lines 31–48 and `backend/app/infrastructure/database/repositories/matching_repository.py` lines 146–180
* **Reproduction Evidence**:
  - Two rapid clicks on the Evaluate button before React flushes its render cycle dispatch two parallel POST requests to `/api/v1/matching/{job_id}/evaluate`.
* **Challenging the Duplicate-Request Finding (Deep Architecture Analysis)**:
  - Adding a client-side `if (evaluatingIds.has(jobId)) return null;` in `useJobActions.ts` is helpful for single-tab ergonomics, but **does NOT guarantee duplicate prevention**:
    1. **Multi-Tab Concurrency**: A user opening the same job in two browser tabs and clicking Evaluate simultaneously.
    2. **Network Layer Retries**: Upstream proxies or client retry interceptors re-issuing transient timeout requests.
    3. **Backend Race Condition**: In `matching_repository.py`, both concurrent executions find `cached_result = None` and compute the evaluation. When both reach `save()`, both attempt to insert `MatchResultModel` with `id=f"match_{profile.id}_{job.id}"` and `UniqueConstraint("user_id", "job_id", "evaluation_key")`. One succeeds, and the other crashes with an unhandled SQLAlchemy `IntegrityError` (HTTP 500)!
  - **True End-to-End Resolution**:
    - **Frontend**: Add an inflight guard in `useJobActions.ts`.
    - **Backend**: Wrap `self._session.add(model)` / `commit()` in `matching_repository.py` with an `IntegrityError` handler that rolls back and returns the newly committed record, guaranteeing true database idempotency.

---

### Finding DEF-03: Falsy `decision` Renders Literal String `"undefined"` (P3 - Low)
* **Status**: **CONFIRMED (Active Defect)**
* **Location**: `frontend/src/pages/jobs/JobDetailDrawer.tsx` line 146
* **Exact Code**:
  `<StatusChip tone={decisionTone(m.decision)}>{String(m.decision).replace(/_/g, ' ')}</StatusChip>`
* **Reproduction Evidence**:
  - When `m.decision` is `undefined`, `String(undefined)` evaluates to `"undefined"`.
* **Remediation**: Use `String(m.decision || 'PENDING EVALUATION').replace(/_/g, ' ')`.

---

### Finding DEF-04: Quick Tab Segmented Control Lacks ARIA Tab Semantics (P3 - Low)
* **Status**: **CONFIRMED (Active Defect)**
* **Location**: `frontend/src/pages/jobs/JobDetailDrawer.tsx` lines 159–179
* **Reproduction Evidence**:
  - Screen reader DOM inspection reveals generic `<button>` elements within an unlabelled `<div>`.
* **Remediation**: Add `role="tablist"` to container, `role="tab"` and `aria-selected={activeTab === t.id}` to buttons.

---

### Finding DEF-05: Multi-Stage Fit Dimensions Grid Renders Empty Card on Null Dimensions (P3 - Low)
* **Status**: **CONFIRMED (Active Defect)**
* **Location**: `frontend/src/pages/jobs/JobDetailDrawer.tsx` lines 196–223
* **Reproduction Evidence**:
  - When `m` exists but all dimension scores (`skill_match_score`, `semantic_score`, etc.) are null/undefined, the outer border card renders with an empty inner grid.
* **Remediation**: Conditionally render the container only if `DIMENSIONS.some(([_, key]) => typeof m[key] === 'number')`.

---

### Finding DEF-06: Silent Error Swallowing & Hardcoded Fallback Name in Tailoring Studio (P3 - Low)
* **Status**: **CONFIRMED (Active Defect)**
* **Location**: `frontend/src/pages/jobs/tailor/TailorResumeDialog.tsx` lines 43–54
* **Exact Code**:
  ```tsx
  const download = async (format: 'docx' | 'pdf') => {
    if (!item) return;
    try {
      const blob = await api.downloadTailored(item.id, format);
      const personal = item.analysis?.nextraise?.structured_resume?.personal;
      const candidate = personal ? `${personal.first_name} ${personal.last_name}` : 'Rohit Chaudhari';
      const cleanName = cleanResumeFileName(item.file_name, candidate, format);
      saveBlob(blob, cleanName);
    } catch {
      // download retry
    }
  };
  ```
* **Reproduction Evidence**:
  - If PDF download fails (e.g. backend returns 404 because LibreOffice/ReportLab conversion timed out), the error is caught by `catch { // download retry }` with no toast or user notification.
  - If `personal` is undefined, `candidate` falls back to hardcoded `'Rohit Chaudhari'`.
* **Remediation**: Show error notification in catch block and fall back to `jobTitle` or `'Resume'`.

---

## 4. End-to-End Lifecycle & Metrics Verification

* **Score Formula & Decoupling**:
  - Verified pure candidate-job fit: $\sum (w_i \cdot s_i)$ bounded in $[0, 100]$.
  - Quota, freshness, and platform connection states are strictly kept in `recommendation_score` and `RecommendationEngine`, preventing distortion of the candidate's core fit score.
* **Skill Token Integrity**:
  - Whole-word regex parsing (`(?<![a-z0-9#+])` ... `(?![a-z0-9#+])`) prevents false substring collisions.
  - LLM-claimed skills are strictly filtered through the candidate's real profile (`AI-07`), eliminating fabricated match claims.
* **Document Synthesis & Master Immutability**:
  - Master resume files remain SHA-256 hash-identical before and after tailoring runs.
  - Tailored outputs preserve XML styles and font properties.

---

## 5. Forensic Findings Remediation & Verification Status

| Finding ID | Title | Severity | Remediation Summary | Regression Test ID & Location | Status |
| :--- | :--- | :---: | :--- | :--- | :---: |
| **DEF-01** | Unsanitized External Job Link Allows Non-HTTP Protocols | **P2** | Implemented `getSafeExternalUrl` in `frontend/src/utils/urlSafety.ts` with WHATWG parser. Rejects `javascript:`, `data:`, relative strings, malformed links, and trims whitespace. Integrated into `JobDetailDrawer.tsx`. | `TC-REG-01` (`frontend/src/tests/url_safety.test.ts`, `frontend/src/tests/job_detail_remediation.test.tsx`) | **FIXED AND VERIFIED** |
| **DEF-02** | Rapid Re-click on "Evaluate fit" Dispatches Duplicate Calls & Risks DB Race | **P2** | Frontend: Added synchronous `inflightEvalRef` in `useJobActions.ts` blocking re-entrant calls before re-render. Backend: In `matching_repository.py`, handled exact evaluation identity (`user_id`, `job_id`, `eval_key`), rolled back on uniqueness collisions, reloaded canonical record, and guaranteed unrelated errors (e.g. NOT NULL) are re-raised. | `TC-REG-02` (`frontend/src/tests/job_detail_remediation.test.tsx`, `backend/tests/integration/test_matching_concurrency.py`) | **FIXED AND VERIFIED** |
| **DEF-03** | `StatusChip` Displays Literal `"undefined"` on Falsy Decision | **P3** | Replaced literal string rendering with `'PENDING EVALUATION'` fallback and neutral tone when decision is null or undefined. | `TC-REG-03` (`frontend/src/tests/job_detail_remediation.test.tsx`) | **FIXED AND VERIFIED** |
| **DEF-04** | Quick Tabs Render as Unadorned Buttons Missing `tablist`/`tab` Semantics | **P3** | Implemented `role="tablist"` with `aria-label="Job detail views"`, `role="tab"`, `aria-selected`, `aria-controls`, `tabIndex`, arrow key navigation (`ArrowRight`/`ArrowLeft`), and `role="tabpanel"` on content views. | `TC-REG-04` (`frontend/src/tests/job_detail_remediation.test.tsx`) | **FIXED AND VERIFIED** |
| **DEF-05** | Multi-Stage Fit Dimensions Grid Renders Empty Card on Null Dimensions | **P3** | Added `hasDimensions` boolean check requiring at least one numeric dimension while correctly preserving 0 as a valid score (`typeof val === 'number'`). | `TC-REG-05` (`frontend/src/tests/job_detail_remediation.test.tsx`) | **FIXED AND VERIFIED** |
| **DEF-06** | Silent Error Swallowing & Hardcoded Fallback Name in Tailoring Studio | **P3** | Imported `useToast`, displayed error toasts in `catch` block on download failure, and dynamically derived candidate fallback from `jobTitle` / candidate profile instead of hardcoded `'Rohit Chaudhari'`. | `TC-REG-06` (`frontend/src/tests/tailor_dialog.test.tsx`) | **FIXED AND VERIFIED** |

