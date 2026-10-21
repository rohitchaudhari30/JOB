# Job-specific resume tailoring: implementation plan

Status: **planning only. Nothing in this plan has been built.** No source, schema, API contract or dependency was changed to produce it.
Scope: the AutoApply.ai repository at `main` (commit `44e9dc3`).

How to read the labels used throughout:

- **[V] Verified**: read directly from the code in this repository.
- **[R] Recommendation**: my technical proposal.
- **[A] Assumption**: needs your confirmation before it is relied on.

An earlier, shorter proposal exists on branch `claude/resume-tailoring-plan` (`docs/resume-tailoring-and-application-record-plan.md`). This document replaces it wherever the two differ.

---

## 1. Executive summary

The feature: from a job's detail view the user clicks **Tailor resume for this job**. The app compares the job description to the user's master resume, shows an honest analysis, proposes small wording edits that are each backed by evidence in the master resume, lets the user review them, and then produces a **separate** tailored file that can be downloaded and used for that application.

Main conclusions:

1. **Best entry point: the existing job detail drawer** (`pages/jobs/JobDetailDrawer.tsx`), used by both Discover and Matched. No new page, tab or top-level navigation item. [R]
2. **Format fidelity is realistic for DOCX only.** The repository already depends on `python-docx` and `pypdf`. A DOCX can be edited at paragraph and run level while keeping styles. A text PDF cannot be edited reliably with the installed tools. For PDF the safe fallback is: analysis and suggestions only, original file untouched, with an explicit option to convert to an editable copy. [V for libraries, R for approach]
3. **The AI must never write the file.** The model only returns a structured list of proposed edits, each pointing at evidence. Deterministic code validates the list and applies approved edits to a copy of the DOCX. [R]
4. **Tailored resumes must not be stored as rows in `resumes`.** That table feeds "most recent resume" and "default resume" fallbacks in matching and in application validation, so a tailored row could silently hijack them (section 4.4). A separate table is proposed. [V for the fallbacks, R for the table]
5. **Missing infrastructure:** there is no document renderer (LibreOffice or similar) in the image, no structured-output validation of AI responses, and no prompt-injection hardening in the existing prompts. All three are needed (sections 6 and 9).
6. **No claim of pixel-perfect output.** The plan validates what can be measured (styles, structure, page count, overflow signals) and states the limits (section 5.3).

---

## 2. Verified repository architecture and current resume workflow

**Stack [V]:** FastAPI, SQLAlchemy 2.1 async on SQLite (PostgreSQL supported), Alembic (`backend/migrations/versions/0001` to `0007`), React 18 + TypeScript + Vite + Tailwind. AI providers: Groq (primary) and Gemini (fallback) behind `MultiTierAIGateway` (`app/infrastructure/ai/gateway.py`). Layering is enforced by `tests/unit/test_architecture_rules.py`: `domain` -> `application` -> `infrastructure` -> `api`.

**Current resume flow, traced:**

| Step | What happens | Where |
|---|---|---|
| Upload | `POST /resumes` or `/resumes/upload`. Extension allow-list `.pdf,.docx` (`ALLOWED_RESUME_EXTENSIONS`), magic-byte check (`%PDF-` or `PK\x03\x04`), 10 MB cap (`MAX_RESUME_SIZE_BYTES`) streamed in 1 MB chunks. | `app/api/v1/resumes.py` |
| Storage | `{STORAGE_DIR}/resumes/{user_id}/{uuid}{ext}`. Row in `resumes`: `file_path`, `file_name`, `mime_type`, `raw_text`, `is_default`, `label`, `target_role`. | `models.py` `ResumeModel` |
| Text | `extract_resume_text` uses `pypdf` for PDF and `python-docx` for DOCX, capped at 20,000 characters, never raises. | `app/infrastructure/resume_text.py` |
| Matching | `MatchJobUseCase` picks the resume by: explicit `resume_id`, else default, else most recent, else profile only. The cascade uses only the first **500 characters** of `raw_text` for the semantic profile text. | `application/matching/use_cases.py`, `cascade.py:322` |
| Apply | `ApplicationValidator` picks `resume_id` by: command, else campaign `target_resume_id`, else default, else first. The application stores `resume_id` and `resume_label_snapshot`. | `application/applications/validators.py`, `models.py:362,375` |
| Submit | `DeferredExecuteUseCase` reads `resume.file_path`, checks the file exists, and the form engine uploads that path to the page's file input. | `application/applications/use_cases.py:150-159`, `infrastructure/browser/form_engine.py:334-365` |
| Download | `GET /resumes/{id}/download` returns the file after an ownership check (`resume.user_id != current_user.id` -> 404). | `resumes.py` |
| Delete | Blocked when an active application or a RUNNING campaign uses it (`can_delete`). File removed from disk. | `profile_repository.py:278-347` |
| Account erase / export | Eraser removes resume files and `storage/resumes/{user_id}`. Export includes resume records, not files. | `user_data_eraser.py:50,87`, `user_data_export.py` |

---

## 3. Existing frontend entry points and recommended location

**Existing surfaces [V]:**

| Surface | File | Notes |
|---|---|---|
| Job detail drawer | `pages/jobs/JobDetailDrawer.tsx` (198 lines) | Opened from Discover and Matched. Shows description, match breakdown, and buttons **Queue application**, **Evaluate fit**, **Open job posting**. |
| Jobs workspace | `pages/JobsWorkspace.tsx` with `JobDiscovery.tsx`, `AIMatches.tsx` | Both render `JobDetailDrawer` with their own model mappers (`jobToDetailModel`, `matchToDetailModel`). |
| Application drawer | `pages/applications/ApplicationDrawer.tsx` | Per-application view. |
| Resume library | `pages/profile/ResumeLibraryTab.tsx` (Settings > Resumes & answers) | List, upload, set default, download, delete. |
| Campaign resume picker | `pages/campaigns/CriteriaCard.tsx:315` | A `<select>` of `resumes`, label "Attach Resume Version". |
| Readiness prompts | `components/ReadinessBanner.tsx`, `hooks/useJobActions.ts` | Send the user to Settings > Resumes when no resume exists. |
| UI kit | `components/ui/`: `Modal` (center or right, focus trap, Esc), `ConfirmDialog`, `Button`, `Tabs`, `OverflowMenu`, `IconButton`, `PageHeader`, `EmptyState`, `StatusChip` | Reuse these; do not add a new design system. |
| API client | `services/http.ts`, `services/api.ts`, `services/endpoints/*.ts` | Axios; resume endpoints in `services/endpoints/profile.ts`. |
| Download pattern | `URL.createObjectURL(blob)` in `ResumeLibraryTab.tsx:56` and `ApplicationCRM.tsx:91` | Reuse the same pattern for tailored files. |
| Toasts, polling | `context/ToastContext`, `hooks/usePolling.ts` | Use for progress and errors. |

**Recommended primary entry point [R]:** a **Tailor resume** button in `JobDetailDrawer`, next to **Queue application**. Reasons:

- It is the one place the user already reads the real job description and decides whether to apply.
- It serves both the Discover and Matched views with one change, because both use the same drawer.
- A tailored resume belongs to one job, so the job is the natural owner. A resume-library entry or a new page would force the user to pick a job first.
- It adds no navigation, no tab and no list-card button, so the job grid is not cluttered.

**Secondary, contextual only [R]:** the tailored version appears (a) in the application drawer as "Resume sent", and (b) as a choice when queueing that job. The Settings resume library stays master-only, with a small link "N tailored versions" at most.

**Interaction pattern [R]:** one `Modal` (center, wide) opened from the drawer, with three stages in one place rather than nested tabs: (1) choose master resume and start; (2) analysis and proposed changes with per-change approve or skip; (3) comparison and save/download/discard. Drawer stays open behind it.

---

## 4. Existing backend endpoints, services and data models

### 4.1 Endpoints used or touched [V]

`api/v1/resumes.py` (upload, list, delete, set-default, download), `api/v1/jobs.py` (`GET /jobs/{id}` returns `JobDetailResponse` with `raw_description` and `parsed_requirements`), `api/v1/matching.py` (`POST /matches/{job_id}/evaluate`), `api/v1/applications.py` and `application/applications/*` (queue and execute), `api/v1/campaigns.py` (`target_resume_id`).

### 4.2 Services [V]

- `MultiTierAIGateway` exposes `analyze_resume`, `analyze_job`, `match_job`, question intent and answer generation (`domain/ai/contracts.py`). Calls are logged to `ai_requests` (tokens, latency, cost, success). Circuit breaker routes to Gemini on rate limits.
- Existing prompts are one-line system prompts; the resume or job text is passed as the **user message** with no delimiter, no "treat as data" instruction, and `json.loads` on the raw reply with `.get()` defaults and **no schema validation** (`groq_provider.py:52-100`). Output is capped by `GROQ_MAX_TOKENS = 2048`.
- Durable background work exists as `matching_tasks` (QUEUED, LEASED, COMPLETED, RETRY, FAILED, lease and fencing columns) processed by `workers/matching_worker.py`. A lighter `application/background.py:spawn` exists for non-durable tasks.
- Log redaction exists (`core/logging.py`: tokens, JWTs, passwords, API keys) but does **not** know about resume text.

### 4.3 Data models [V]

`ResumeModel` (no version, no parsed skills columns; the cascade reads `version` and `parsed_skills` with `getattr` defaults, so they are effectively absent), `JobModel` (`raw_description`, `parsed_requirements`, `is_active`), `ApplicationModel` (`resume_id` FK ondelete SET NULL, `resume_label_snapshot`, unique `(user_id, job_id)`), `CampaignModel` (`target_resume_id`), `MatchResultModel` (`resume_id`), `MatchingTaskModel`, `AIRequestModel`, `CandidateProfileModel` with skills, experiences, educations.

### 4.4 Why a separate table is required [V + R]

`MatchJobUseCase` and `ApplicationValidator` both fall back to "default resume, else the most recent / first resume" from `list_by_user_id`. `GET /resumes` feeds the Settings list and the campaign picker. If tailored files were `ResumeModel` rows, they would appear in those lists, could become the "most recent" resume for unrelated jobs, would change `_compute_resume_canonical_hash` inputs, and could be set as default. A dedicated table avoids all of that.

---

## 5. Supported formats and document-preservation feasibility

### 5.1 What the application accepts [V]

`.pdf` and `.docx` only (magic bytes checked). No scanned-document detection or OCR exists anywhere (`extract_resume_text` returns "" when a PDF has no text layer). No LibreOffice, `soffice`, PyMuPDF, or reportlab is installed or referenced (`requirements.txt`, `Dockerfile`).

### 5.2 Feasibility by format [R]

| Format | Can edit in place? | Plan |
|---|---|---|
| **DOCX, normal** (paragraphs, runs, bullets, tabs) | **Yes.** `python-docx` exposes paragraphs and runs with their formatting. Replacing text inside an existing run, or moving a paragraph, keeps style, font, size and numbering. | Supported edit target. |
| **DOCX with tables** (common for two-column resumes) | **Partly.** Cells hold paragraphs and can be edited the same way. **Note:** `extract_resume_text` reads `doc.paragraphs` only, so table, header and footer text is missing from today's `raw_text` [V]. Tailoring must read the whole document tree. | Supported for text inside cells; no cell merges or row changes. |
| **DOCX with text boxes, shapes, images of text, content controls, tracked changes, fields** | **Unreliable.** Text boxes live in drawing XML, not in `doc.paragraphs`. | Detect and mark as "not editable"; leave those blocks unchanged and say so. |
| **Text-based PDF** | **No reliable method with installed tools.** `pypdf` can read text but editing content streams does not preserve fonts, kerning or reflow, and is fragile. | Analysis and suggestions only. Original file untouched. Optional, explicit conversion to an editable DOCX is a separate, user-aware action, not an edit. |
| **Scanned PDF** (no text layer) | **No.** No OCR in the stack. | Fail safely with a clear message: "This PDF has no readable text." Offer upload of a DOCX. |

### 5.3 Fidelity validation and its limits [R]

A tailored DOCX is checked by comparing it with the master:

1. **Structure:** same paragraph count in each section container, same style names per paragraph, same numbering ids, same section/page settings, same header and footer XML (hash), same table dimensions.
2. **Text:** the only differences from the master are the approved edits (computed as a diff and matched one-to-one to the edit plan). Name, email, phone, employers, titles, dates and degrees are compared as protected tokens.
3. **Layout:** render master and tailored to PDF with LibreOffice headless and compare **page count** and **per-page text line counts**. Overflow shows up as extra lines or an extra page.

Limits, stated honestly: LibreOffice does not lay out text exactly as Microsoft Word does (font substitution, kerning). So the check can **detect likely layout shifts**; it cannot **prove** the file looks identical in Word. The UI must say "checked for structure, wording and page count" and never "pixel-perfect". Missing fonts on the server make rendering comparisons less reliable; the check should be reported as "unavailable" rather than passing when the font is substituted.

---

## 6. Current problems and verified limitations

1. No tailored-resume concept anywhere in code or schema (grep for `tailor` finds nothing). [V]
2. No document renderer in the runtime image. [V]
3. Resume text extraction ignores tables, headers, footers; truncates at 20,000 characters. [V]
4. Matching uses only the first 500 characters of resume text. A tailored resume will not be reflected in the match score unless that is revisited. [V]
5. AI replies are parsed with bare `json.loads` and defaults; malformed JSON would raise out of the provider. No schema validation. [V]
6. Existing prompts do not mark resume or job text as untrusted. [V]
7. `GROQ_MAX_TOKENS = 2048` may be too small for a full edit plan on a long resume. [V]
8. `JobModel.raw_description` can change when a job is re-discovered; nothing records which version an analysis used. [V]
9. Application submit reads `resume.file_path` from `resumes` only. A tailored file cannot currently be sent. [V]
10. Account export does not include resume files; erasure removes `storage/resumes/{user_id}` only, so tailored files stored elsewhere would be missed. [V]
11. Campaigns bind one `target_resume_id` for many jobs; a tailored resume is per job, so the campaign model does not map directly. [V + R]

---

## 7. Proposed user experience and end-to-end workflow

Primary action: **Tailor resume for this job** (in the job drawer).

1. **Open dialog.** Shows the job title and company, the master resume that will be used (default pre-selected; a select if the user has several), and a one-line promise: "Your original resume is never changed. This creates a separate copy." Button **Analyse**.
2. **Prerequisite checks (server-side, shown as clear next steps):**
   - no master resume -> "Upload a resume" link to Settings > Resumes & answers;
   - PDF master -> explain suggestions-only mode (section 5.2);
   - scanned PDF -> unreadable message;
   - job description missing or too short (for example under 300 characters) -> "This posting has no usable description; open the posting";
   - job no longer active -> warn but allow the user to continue.
3. **Analysis (background job, progress shown).** Output shown in plain language:
   - **Strengths:** requirements already supported, with the resume line that supports each.
   - **Supported improvements:** proposed edits (category A below).
   - **Questions for you:** requirements with no evidence, each asking "Do you have this?" (category B).
   - **Gaps:** requirements you have not confirmed (category C), shown honestly, with transferable skills that are really in the resume.
   - **Honest match note** (not a score inflated by edits).
4. **User decisions.** Each proposed edit has Approve or Skip. Each question has Yes (with a small form for factual details: where, how long, how used) or No. Yes answers become **confirmed facts** (section 9.4) and may produce additional proposed edits to approve.
5. **Generate.** Only approved edits are applied by code to a copy. Progress shown. Cancel is available.
6. **Validate** (section 5.3). On failure the result is shown as **failed validation** with the reason; no download of an unvalidated file as if it were good.
7. **Review.** Side-by-side text comparison of changed lines (original vs tailored, with reason and evidence), plus validation summary. Buttons: **Download**, **Save as version for this job**, **Regenerate**, **Discard**.
8. **Use.** After saving, **Queue application** from the drawer offers "Use tailored resume" (on by default for that job). The application stores which file was used. For campaigns, see 9.6.

Changes grouped by type (the plan must keep these separate):

- **A. Safe content improvements** (need only user approval of the line): reword an existing responsibility so an existing skill is explicit; reorder existing bullets inside a section; fix grammar without changing meaning; emphasise an existing technology (bold only if the original already uses that style at that position); remove pure repetition only if approved and reversible (the master is untouched, so reversible).
- **B. User-confirmed additions:** a skill or experience absent from the master. Never added from the job description. Added to the tailored copy only after the user says Yes and supplies details; stored as a confirmed fact with source and timestamp; the master is not modified.
- **C. Unsupported requirements:** reported as gaps. May suggest learning or another job. Never turned into resume text, and never counted to raise the match.

States to design (all with real behaviour): no master resume, missing job description, unsupported format, analysing, generating, success, validation failure, provider failure, cancelled, saved, job expired/unavailable, duplicate request or retry.

---

## 8. Resume integrity and factual accuracy rules

Rules enforced **in code**, not only in the prompt:

1. The master file and the `resumes` row are never written by this feature. The output is a new file path under a different directory.
2. Every proposed edit must carry **evidence**: either a quote and location (paragraph id) from the master, or a reference to a confirmed fact id. An edit without valid evidence is rejected.
3. Evidence quotes are checked by exact (normalised) substring match against the master text. The model cannot invent a quote.
4. **Protected tokens** are extracted from the master (name, emails, phones, URLs, employer names, job titles, date ranges, degree names, certification names). An edit may not change them. The validator diffs these tokens between master and output.
5. **New technology guard:** any skill-like term in the edit text that appears neither in the master nor in confirmed facts is rejected. This list is built from the job's `parsed_requirements` plus a generic technical-term pattern, so "add Kubernetes because the job lists it" is rejected.
6. **Numbers guard:** any number (years, percentages, counts, money) in an edit must appear in the master line it is based on or in a confirmed fact.
7. **Scope guard:** an edit may only target paragraphs marked editable (experience bullets, summary, skills line). Name/contact blocks and headers are non-editable by default.
8. **Length guard:** an edit may not be longer than the original line by more than a small ratio (for example 15%), to avoid overflow. [A: ratio to be tuned on real resumes.]
9. **Nothing is silently claimed:** the review screen always lists every changed line and its evidence.
10. **Master mutation test:** file hash of the master before and after must be equal (tested).

---

## 9. AI analysis and deterministic document-editing architecture

### 9.1 Split of responsibilities [R]

| Stage | Done by | Output |
|---|---|---|
| Read DOCX structure | Deterministic code (`python-docx`) | A **document map**: list of blocks with stable ids, location (body, table cell, header/footer), style name, text, editable flag |
| Analyse job and resume | AI (via gateway) | **Analysis JSON**: requirement list with status SUPPORTED, UNSUPPORTED or UNVERIFIED, each with evidence |
| Propose edits | AI (via gateway) | **Edit plan JSON** (below) |
| Validate edit plan | Deterministic code | Accepted / rejected edits with reasons |
| Apply approved edits | Deterministic code | New DOCX (copy) |
| Validate output | Deterministic code + renderer | Validation report |

### 9.2 Edit-plan representation [R]

```json
{
  "edits": [
    {
      "id": "e1",
      "type": "REWORD",
      "block_id": "p14",
      "before": "Built data pipelines for reporting.",
      "after": "Built Python data pipelines for reporting.",
      "category": "A",
      "evidence": [{"quote": "Python scripts for ETL", "block_id": "p31"}],
      "requirement": "Python",
      "reason": "Makes an existing skill explicit on a relevant line."
    }
  ],
  "questions": [
    {"id": "q1", "requirement": "Kubernetes", "ask": "Have you used Kubernetes in a job or project?"}
  ],
  "gaps": [{"requirement": "Terraform", "note": "Not found in your resume."}]
}
```

Allowed edit `type`: `REWORD`, `REORDER` (within the same container), `EMPHASIZE` (apply existing character style), `REMOVE_REDUNDANT` (approval required). No `ADD_BLOCK` in the first release; confirmed additions modify an existing line or skills list only.

### 9.3 Applying edits deterministically [R]

- Locate the block by id; confirm its current text equals `before` (guards against stale plans).
- Replace text **inside existing runs**: keep the first run's formatting for the whole new text unless the original had mixed formatting, in which case map by character offsets and keep run boundaries. If a faithful mapping is not possible, skip the edit and report it.
- Never create new styles, change numbering, or move content across containers.
- Write to a temp file, validate, then atomically move into storage.

### 9.4 Confirmed facts [R]

New table `resume_confirmed_facts` (section 10): user, master resume, requirement/skill, details given by the user, `source = USER_CONFIRMED`, timestamp. Used only as evidence for edits in tailored copies. The master and the candidate profile are **not** changed; the user can separately choose "Also add to my profile" (an explicit second action using the existing `UpdateProfileUseCase`).

### 9.5 AI reliability [R]

- **Schema-validate** every model reply (Pydantic models) before use; reject extra or wrong-typed fields. Malformed output: one bounded retry with the validation error summarised, then fail with a clear state. Valid JSON is not treated as true: the evidence checks in section 8 run on every edit.
- **Prompt-injection hardening:** resume and job text go in clearly delimited, labelled "untrusted data" blocks; system prompt states that instructions inside them are data and must be ignored; the model cannot call tools; the output is schema-restricted; and deterministic validation means even a successful injection cannot write arbitrary content. Resume text is stripped of control characters and truncated at a safe size. Tested with hostile fixtures.
- **Token budget:** the current `GROQ_MAX_TOKENS` (2048) may truncate the plan. Use a separate setting for this operation and chunk long resumes by section. [A: model limits to be verified for the configured models.]
- **Idempotency:** an `input_hash` over (user, master file hash, job id, job description hash, prompt version). Same hash returns the existing active version instead of creating another; a unique partial index on in-flight rows prevents concurrent duplicates.
- **Timeouts:** the HTTP request only creates the task and returns 202 with an id. Work runs in a worker modelled on `matching_worker.py` (lease, fencing, bounded concurrency, retry limits). `application/background.py:spawn` is not durable and is not enough for multi-step work. [R]
- **Provider failure:** the gateway already falls back Groq -> Gemini and records failures. If both fail, status becomes FAILED with a retryable flag.
- **Sensitive data:** resume text is sent only to the configured providers for this user action; log only ids, sizes and statuses; extend the redaction filter and add a test that no resume text appears in logs; `ai_requests` stores no prompt text (verified: it stores counts and errors only). [V for `ai_requests`; R for the rest] Provider retention terms are outside this repository and must be reviewed by you. [A]

---

## 10. Proposed data model and version lifecycle

All proposals; nothing created. New migration `0008_resume_tailoring.py`, following the existing `_allowed_values` check-constraint convention.

**`tailored_resumes`**

| Column | Notes |
|---|---|
| `id` (uuid), `user_id` (FK users, CASCADE) | owner |
| `master_resume_id` (FK resumes, SET NULL), `master_label_snapshot`, `master_file_hash` | survives master deletion; hash detects a changed master |
| `job_id` (FK jobs, CASCADE), `job_description_hash`, `job_title_snapshot`, `company_snapshot` | which job text was used |
| `version` int | per (user, master, job), starts at 1 |
| `status` | see lifecycle |
| `analysis` (JSON), `edit_plan` (JSON), `approved_edit_ids` (JSON), `validation` (JSON) | no copy of the full resume text; edits hold only changed lines |
| `file_path`, `file_name`, `mime_type`, `file_hash` | output; path under `storage/tailored_resumes/{user_id}/` |
| `input_hash` | idempotency |
| `provider`, `model_name`, `prompt_version` | audit |
| `error_code`, `error_message` | failure detail |
| `created_at`, `updated_at`, `approved_at`, `expires_at` | retention |

Constraints: unique `(user_id, master_resume_id, job_id, version)`; partial unique index for one in-flight row per `(user_id, master_resume_id, job_id)`; index on `(user_id, job_id)`.

**`resume_confirmed_facts`**: `id`, `user_id`, `master_resume_id`, `term`, `details` (JSON), `source` (`USER_CONFIRMED`), `created_at`; unique on `(user_id, master_resume_id, normalized term)`.

**`applications.tailored_resume_id`** (nullable FK, SET NULL) plus `resume_label_snapshot` reuse. Resolution order proposed for the file to upload: explicit command `resume_id` -> **approved tailored resume for this user and job** -> campaign `target_resume_id` -> default. The same order must be applied in `application/applications/use_cases.py` (lines ~150 and ~975) and in `validators.py`. [R]

**Lifecycle states:** `QUEUED` -> `ANALYZING` -> (`AWAITING_INPUT` if questions) -> `GENERATING` -> `VALIDATING` -> `READY_FOR_REVIEW` -> `SAVED` (user approved) or `DISCARDED`. Side exits: `FAILED`, `CANCELLED`, `STALE` (master file or job description changed after generation). Only `SAVED` can be sent. Transitions enforced in a small domain state machine with tests, like `domain/campaigns` and `domain/applications`.

**Retention [A]:** unsaved drafts expire after 7 days; `DISCARDED` files deleted immediately; saved versions kept until the user deletes them or the account is erased. `can_delete` for masters should also block deletion while a SAVED tailored version is attached to an active application.

**Campaigns [R]:** a campaign spans many jobs, so v1 does not add a campaign FK. Instead a campaign option "use my saved tailored version when one exists for the job" resolves per job at apply time and never generates anything unattended. Generation always needs the user.

---

## 11. Security and privacy requirements

- **Ownership:** every endpoint loads the master and tailored rows by id and compares `user_id` to the authenticated user; 404 (not 403) on mismatch, matching existing behaviour. Job access follows existing job endpoints.
- **Downloads:** `GET /tailored-resumes/{id}/download` mirrors the resume download with ownership check; paths are never taken from client input; files served only from the tailored storage root (resolve and verify the path prefix).
- **Files:** reuse the extension, magic-byte and size checks; validate the DOCX zip (member count and uncompressed size limits against zip bombs) and the XML (parse with defusedxml-style protections against entity expansion) before editing. Malformed documents -> UNREADABLE error, nothing partial left behind.
- **Temp files:** per-request temp directory, removed in `finally`; renderer runs with a timeout, no network and a restricted working directory. LibreOffice processes get a per-run profile directory to avoid cross-user state.
- **Isolation of concurrent requests:** unique in-flight index, per-row lease fencing in the worker, and no shared mutable files.
- **Logs:** ids, statuses, byte counts and durations only. Add resume-text patterns (email, phone) to redaction and test it.
- **Model providers:** resume text leaves the system to Groq or Gemini. Add a visible one-line notice in the dialog; check provider data-retention settings. [A]
- **Prompt injection:** section 9.5.
- **Deletion and erase:** extend `user_data_eraser.py` to remove `storage/tailored_resumes/{user_id}` and the new rows; extend `user_data_export.py` table list to include `tailored_resumes` and `resume_confirmed_facts` records. Both are existing tested paths, so extending their tests is required.
- **Access to history:** list endpoints filter by `user_id` always; no admin listing is added.

---

## 12. Frontend changes required (actual paths)

| Change | File | Type |
|---|---|---|
| Add **Tailor resume** button; accept `onTailor` prop | `pages/jobs/JobDetailDrawer.tsx` | edit (198 lines; stays under the 400-line limit) |
| Pass handler and job id from both views | `pages/JobDiscovery.tsx`, `pages/AIMatches.tsx` | edit |
| Tailoring dialog, three stages | `pages/jobs/tailor/TailorResumeDialog.tsx` (+ `AnalysisStep.tsx`, `ReviewStep.tsx`, `ChangeList.tsx`) | new; keep each under 400 lines |
| Polling hook for status | `pages/jobs/tailor/useTailoring.ts` using `hooks/usePolling.ts` | new |
| Endpoints | `services/endpoints/tailoring.ts`, registered in `services/api.ts` | new + edit |
| Types | `types/identity.ts` or new `types/tailoring.ts`, exported from `types/index.ts` | new + edit |
| "Use tailored resume" choice when queueing | `hooks/useJobActions.ts` and the queue call in `services/endpoints/applications.ts` | edit |
| Show "Resume sent" with the tailored file | `pages/applications/ApplicationDrawer.tsx` | edit |
| Optional campaign checkbox | `pages/campaigns/CriteriaCard.tsx` | edit (later phase) |
| Tests | `tests/tailor_dialog.test.tsx`, `tests/job_drawer_tailor.test.tsx` | new |
| Smoke and keyboard checks | `e2e/smoke.py`, `e2e/keyboard.py` | edit |

Use existing `Modal`, `Button`, `ConfirmDialog`, toasts and download pattern. Accessibility: dialog labelled, progress announced with `role="status"`, change list keyboard-operable, no colour-only meaning.

## 13. Backend changes required (actual paths)

| Change | Path | Type |
|---|---|---|
| Entities, status enum, state machine, protected-token and evidence rules | `app/domain/resume_tailoring/` | new (pure, no I/O) |
| Use cases: start analysis, answer questions, generate, approve, discard, download | `app/application/resume_tailoring/` | new |
| AI contract methods (`analyze_for_tailoring`, `propose_edits`) and Pydantic schemas | `app/domain/ai/contracts.py`, `app/infrastructure/ai/groq_provider.py`, `gemini_provider.py`, `gateway.py` | edit |
| DOCX reader/editor, document map, fidelity checks | `app/infrastructure/documents/docx_editor.py` | new |
| Renderer wrapper (LibreOffice headless with timeout) | `app/infrastructure/documents/renderer.py` | new |
| Repository | `app/infrastructure/database/repositories/tailored_resume_repository.py` | new |
| Models | `app/infrastructure/database/models/models.py` | edit |
| Migration | `migrations/versions/0008_resume_tailoring.py` | new |
| Worker | `app/workers/tailoring_worker.py`, started where `matching_worker` is started | new + edit |
| API router | `app/api/v1/tailoring.py`, registered with the other routers; dependencies in `app/api/deps.py` | new + edit |
| Resolution of the file to upload | `application/applications/use_cases.py`, `validators.py`, `application/campaigns/launch.py` | edit |
| Full-document text extraction (tables, headers, footers) | `app/infrastructure/resume_text.py` | edit (also improves matching input) |
| Erase and export | `user_data_eraser.py`, `user_data_export.py` | edit |
| Config: tokens, size limits, renderer path, retention days | `app/core/config.py` | edit |
| Runtime image: LibreOffice and fonts | `backend/Dockerfile` | edit |
| Tests | `tests/unit/test_tailoring_*.py`, `tests/integration/test_tailoring_api.py`, fixture DOCX files in `tests/data/` | new |

New dependency [R]: none strictly required for editing (`python-docx` already present); LibreOffice as a system package for rendering (adds image size). Any new Python library (for example `defusedxml`, `pydantic` is already used by FastAPI) must be listed and approved before use. [A]

## 14. API contract changes (proposals, not implemented)

| Method and path | Purpose | Response |
|---|---|---|
| `POST /jobs/{job_id}/tailor` body `{master_resume_id}` | Create or return the in-flight/active tailoring (idempotent) | 202 `{id, status}` |
| `GET /tailored-resumes/{id}` | Status, analysis, edit plan, validation | 200 |
| `POST /tailored-resumes/{id}/answers` | Yes/No and details for questions | 200 |
| `POST /tailored-resumes/{id}/generate` body `{approved_edit_ids}` | Apply approved edits | 202 |
| `POST /tailored-resumes/{id}/save` | Mark SAVED | 200 |
| `POST /tailored-resumes/{id}/discard`, `/cancel` | Discard or cancel | 204 |
| `GET /tailored-resumes/{id}/download` | File after ownership check | file |
| `GET /jobs/{job_id}/tailored-resumes` | Versions for this user and job | list |
| Existing queue/apply request | add optional `tailored_resume_id`; omitted -> current behaviour | unchanged when omitted |

Existing endpoints keep their shapes. Error codes follow the current pattern (409 for conflicts, 404 for not found or not yours, 413 for size, 422 for validation).

## 15. Error handling and recovery

| Situation | Behaviour |
|---|---|
| No master, unsupported or unreadable file, thin job description | Immediate 4xx with a plain next step; no task created |
| Provider down or rate-limited | Gateway fallback; if exhausted, status FAILED with `retryable`; **Retry** button creates no duplicate (idempotent hash) |
| Malformed or schema-invalid model output | One bounded retry; then FAILED with a readable reason |
| Edit rejected by validation | Edit dropped and listed as "not applied: reason"; the rest continue |
| Stale plan (master or job changed) | STALE; user must re-analyse |
| Validation failure (structure, protected tokens, page count) | Result kept for inspection, **cannot** be saved or downloaded as "ready"; reasons shown |
| Renderer missing, timeout or font substituted | Layout check reported as "not available"; the user is told this, and structural and text checks still apply |
| Worker crash | Lease expiry returns the task to QUEUED within attempt limit (same pattern as matching) |
| User cancels | CANCELLED, temp files removed |
| Job removed while saved version exists | Version kept; application drawer notes the job is gone |
| Master deleted | Blocked while a saved version is used by an active application; otherwise `master_resume_id` becomes NULL with label snapshot kept |

## 16. Testing strategy and acceptance criteria

**Content accuracy (unit):** fabricated skill in an edit -> rejected; skill from job description only -> rejected; name, email, phone, employer, title, date, degree unchanged; any new number needs a source; confirmed addition requires an explicit answer record; hostile resume and job text (injection strings) cannot add content.

**Document fidelity (unit, fixture DOCX):** paragraph styles, run fonts and sizes preserved on edited lines; numbering, headers, footers, section settings, tables unchanged; master file hash identical before and after; edits inside table cells work; text boxes are detected and left untouched; PDF master -> suggestions only; scanned PDF -> fails safely; corrupt and zip-bomb files rejected; output opens with `python-docx` and renders with LibreOffice.

**Workflow (integration and frontend):** action appears in the drawer in both Discover and Matched; the job description used is the stored one; the selected master is the one analysed; progress and errors match backend status; duplicate POST returns the same id; saved version is tied to the job; the queue call sends the tailored file and `form_engine` receives the tailored path (extending `test_autoapply_resume_propagation.py`).

**Security:** other user's master, tailored row, download and job-version list -> 404; temp directories removed after success, failure and cancel; no resume text in logs (log capture test); erase and export include the new data.

**Regression:** existing suites remain green: `test_resume_text.py`, `test_resume_validation.py`, `test_campaign_resume_policy.py`, `test_autoapply_resume_propagation.py`, matching tests, `test_migrations.py` (upgrade and downgrade of 0008), architecture layering test, frontend `profile_tabs`, `settings_split`, `jobs_workspace`, `matches_selection`, smoke 93/93, keyboard walkthrough, size ratchet (400 lines).

**Measurable acceptance criteria (no unverified claims):**
1. On a fixture set of at least 10 DOCX resumes of different layouts, 100% of generated outputs preserve master style names per paragraph, section settings and protected tokens, or are rejected with a reason.
2. 0 accepted edits contain a term absent from the master and confirmed facts, across an adversarial fixture set including injection attempts.
3. The master file hash is unchanged in every test.
4. Page count equals the master's in every output that reaches READY_FOR_REVIEW when the renderer is available; otherwise the report says "layout check unavailable".
5. Cross-user access attempts fail in all new endpoints.
6. Existing automated suites pass unchanged.

Performance targets are **not** set: they must be measured after a first build with the real providers.

## 17. Implementation roadmap

| Phase | Deliverable | Exit criteria |
|---|---|---|
| T0 | Decisions on section 18 questions; confirm provider data-retention terms; choose renderer packaging | Written answers |
| T1 | Full-document text extraction (tables, headers, footers) and DOCX document map; fixtures | Unit tests; existing resume tests green |
| T2 | Domain rules (evidence, protected tokens, numbers, scope, length), state machine, schemas | Unit tests incl. adversarial cases |
| T3 | Deterministic DOCX editor and fidelity checks, renderer wrapper, Dockerfile | Fidelity tests; master hash invariant |
| T4 | Schema, migration 0008, repositories, worker | Migration up/down test; lease and idempotency tests |
| T5 | AI analysis and edit-plan with validation, bounded retry, injection hardening | Mocked-provider tests; adversarial set |
| T6 | API and ownership, erase/export extension | Integration and security tests |
| T7 | Frontend dialog, drawer button, review, download, save | Component tests, smoke, keyboard, axe |
| T8 | Resolution at apply time, application drawer display, optional campaign option | Propagation tests; regression suite |
| T9 | Hardening: real-provider trial on your resumes, tune ratios and prompts, document limits | Your review of real outputs |

Each phase is a separate local commit with tests, as in the UI redesign.

## 18. Risks, dependencies, unresolved questions and fallbacks

**Risks**
- Fidelity in Word cannot be proven from the server (section 5.3). Mitigation: conservative edits, structural checks, clear wording, user review.
- Complex DOCX layouts reduce editable coverage. Mitigation: mark non-editable blocks and skip.
- LLM edit quality varies by provider; validation reduces harm but cannot make weak suggestions good. Mitigation: human approval of every edit.
- Image size and rendering variance from LibreOffice and fonts.
- Resume text goes to third-party AI providers.
- Tailored text may diverge from what a human recruiter expects; edits are intentionally small.

**Dependencies:** LibreOffice (system package), fonts matching common resume fonts, provider quotas, a decision on the match score (below).

**Unresolved questions (need your decision) [A]**
1. Are DOCX resumes the main format for you? If most are PDF, the feature value drops unless conversion to DOCX is acceptable.
2. For PDF masters: suggestions only, or also allow an explicit "convert to editable DOCX copy" (layout will change; user must accept)?
3. Should the tailored resume be re-scored against the job (the current matching reads only 500 characters, so it would barely change)? Recommend: show the honest analysis only and do not alter the stored match score.
4. Retention period for unsaved drafts (proposed 7 days).
5. Acceptable to add LibreOffice to the backend image, or must rendering be optional?
6. Are you comfortable sending resume text to Groq and Gemini for this feature?
7. Campaign behaviour: only "use saved tailored version when one exists" (recommended), or also prompt for generation before a run?

**Fallbacks:** renderer unavailable -> structural and text checks only, labelled; provider unavailable -> feature disabled with message, existing flows untouched; validation fails -> original resume continues to be used.

## 19. Feature traceability and regression safeguards

| Requirement from the brief | Where covered |
|---|---|
| Identify job and description | 7 (step 2), 14 (`POST /jobs/{id}/tailor`), 10 (`job_description_hash`) |
| Verify resume ownership | 11, 16 security tests |
| Analyse required and preferred qualifications | 9.1, 9.2 analysis |
| Distinguish supported, confirmed, unsupported | 7 (A, B, C), 8, 9.4 |
| Edit existing document, preserve format | 5, 9.3 |
| Separate output, never overwrite master | 8 rule 1 and 10, hash test |
| Comparison view | 7 step 7, 12 `ReviewStep` |
| Download, save, discard, select for application | 7 steps 7 and 8, 14, 10 resolution order |
| Honest handling of gaps | 7 (C), 8 rule 9 |
| Format-specific feasibility | 5.2 |
| AI reliability, injection, deterministic edits | 9.5, 9.3 |
| Data model and lifecycle | 10 |
| Security and privacy | 11 |
| Tests and acceptance | 16 |

**Existing behaviour that must not change:** upload, parsing and download of resumes; match scoring and its cache keys; campaign `target_resume_id`; application idempotency (`uq_user_job_application`); submit flow when no tailored version exists (resolution order falls through to today's behaviour); account erase and export; the 400-line file limit and layering test.

## 20. Final recommendation

Build this as a **DOCX-first, evidence-gated, human-approved** feature entered from the job drawer. Start with the foundation phases (T1 to T3) because they are useful on their own: full-document text extraction improves matching input today, and the deterministic editor with fidelity checks is the part that decides whether the feature can be trusted. Add AI only after those exist (T5), so the model can never be the thing that touches the file.

Do not promise exact visual preservation; promise "same styles, same structure, same page count, checked", show every changed line with its evidence, and keep the original resume as the default whenever validation does not pass.

Please answer the questions in section 18 (especially 1, 2 and 5) before phase T1 starts.

## Implementation status addendum

Implemented on branch `claude/resume-tailoring-impl` with the defaults: DOCX edited, PDF suggestions only, LibreOffice layout check, 7-day draft retention, Groq/Gemini providers.

- v1 ships only **REWORD** and **REORDER** edits (the plan's §9.2 listed more; adding or deleting lines is deliberately not offered).
- Complex DOCX content (hyperlinks, text boxes, fields, tracked changes, tabs, headers/footers) is locked, not edited.
- Not verified here: rendering in Microsoft Word, real Groq/Gemini output quality (tests script only the AI call), PostgreSQL, real devices.
- The UI has no per-application opt-out; the backend supports `use_tailored=false`, and discarding the saved copy reverts to the master.
