# Plan: per-job resume tailoring (format untouched) and a permanent application record

Status: proposal, nothing built yet. Assumptions are marked **[A]** and need your yes/no.

## 1. Goal

1. For each job, send a resume whose wording matches that job, while the file keeps the **exact same layout, fonts, order and page count** as the one you uploaded.
2. Keep a **permanent record** of every job and application: what you saw, what was sent, what happened after.

**[A1]** "Job recording" means this application record (history you can look back at), not screen or video recording.
**[A2]** "Without changing any format" means: same layout and styling, only the words inside existing lines change.

## 2. What exists today (read from the code)

- Resumes are uploaded as PDF or DOCX (`api/v1/resumes.py`), stored on disk, text extracted into `resumes.raw_text`.
- The match step already picks a resume (`match_res.resume_id`) and the application stores `resume_id` and `resume_label_snapshot`.
- Jobs store `raw_description` and `parsed_requirements`.
- Missing: the resume actually sent is always the original file; the exact file sent is not kept; the job description at apply time is not frozen; no follow-up tracking.

## 3. Feature A: Tailored resume per job

### 3.1 Technical truth about formats (decides the design)

- **DOCX:** text sits in "runs" that carry the formatting. Replacing text inside a run keeps fonts, sizes, bullets and spacing. This is reliable.
- **PDF:** has no editable text structure. Editing it in place is unreliable and often breaks layout.

Decision: **the master resume must be a DOCX.** A PDF upload can still be used as-is (select the best one, no edit). For tailored versions the app edits the DOCX and exports a PDF from it (LibreOffice headless) so the PDF looks identical to the master.

### 3.2 How it works

1. **Master resume + fact ledger.** On upload, extract a structured list of facts: roles, dates, employers, skills, tools, numbers. You confirm it once. The AI may only reword using these facts. It can never add a skill, title, employer, degree or number that is not in the ledger.
2. **Job analysis.** Pull required skills, keywords and seniority from the job description (already parsed in `parsed_requirements`).
3. **Suggestions, not silent edits.** For each job the AI proposes small changes: reorder skills line, swap synonyms to the job's wording, tune the summary line, emphasise the most relevant bullet wording. Each is a before/after pair tied to a fact in the ledger.
4. **Format guard.** Edits are applied to existing runs only. After editing, the app checks: page count equal to master, no line overflow (text length per line within the original's tolerance), same styles, same section order. If any check fails, that change is dropped and the master wording is kept.
5. **Review modes** (per campaign): *Always review* (default), *Review below a match score*, *Auto-use when all changes are keyword-level*. First release ships only "Always review".
6. **Version stored.** Each tailored file is saved and linked to the job and application. The master is never modified.
7. **ATS check.** Report which job keywords the resume now covers and which are honestly missing, so you see gaps instead of a made-up fix.

### 3.3 Data model (new)

- `resume_versions`: id, resume_id (master), job_id, file path (docx + pdf), changes (JSON before/after), keyword coverage, created_at.
- `applications.resume_version_id` (nullable; null = master sent).
- `resumes.fact_ledger` (JSON), `resumes.ledger_confirmed_at`.

### 3.4 Safety rules

- No invented content. Each change must cite a ledger fact; unsupported changes are rejected in code, not only in the prompt.
- Master file immutable. Tailored files are new files.
- No change is submitted without passing the format guard.
- Per-user storage and the existing delete/export paths cover the new files.

## 4. Feature B: Application record

One page per application, opened from Applications or Jobs, showing:

- **Job snapshot:** title, company, location, pay, link, and the **full description as it was when you applied** (jobs get removed or edited later).
- **What was sent:** the exact resume file (master or tailored version) with a download link, and the answers submitted to screening questions.
- **Timeline:** discovered, matched (score and reason), queued, submitted, replied, interview, offer or rejected, each with a time.
- **Your notes and contacts:** recruiter name, email, free notes.
- **Follow-up reminder:** default 7 days after submit if no reply; mark done or snooze.
- **Outcome you set:** reply, interview, rejected, offer. This is what feeds Insights.

Data model (new): `application_snapshots` (job description, answers, resume file ref, frozen at submit), `application_events` (timeline), `application_notes`, `application_reminders`.

## 5. Feature C: Learning from results (uses A and B)

Insights gains: reply and interview rate per resume version and per keyword coverage level, so the app can say which wording works. Only shown once there is enough data (for example 20 or more applications per bucket); below that it says "not enough data" instead of guessing.

## 6. Industry-standard requirements

- **Honesty:** facts ledger plus code-level rejection of unsupported edits.
- **Human in the loop** by default for anything sent under your name.
- **Idempotency:** re-running a tailor for the same job and master returns the existing version.
- **Tests:** unit tests for the format guard, the ledger check and run-level editing (fixtures: DOCX with bold, bullets, tables, two columns); integration tests for upload, tailor, review, apply; the migration tested up and down.
- **Layering:** domain rules in `domain/`, use cases in `application/`, LibreOffice and file work in `infrastructure/` (the layering test enforces this).
- **Privacy:** resumes and records are personal data; covered by the existing export and delete flows; no resume text in logs.
- **Observability:** log tailor outcome (applied, dropped, why) without the content.
- **Accessibility:** the review screen follows the same standards as the redesign (keyboard, labels, no colour-only meaning).

## 7. Phases

| Phase | Deliverable | Done when |
|---|---|---|
| R1 | Application record page, snapshots, timeline, notes (no AI) | Every new application keeps its frozen job description, sent file and timeline; tests pass |
| R2 | DOCX master, fact ledger and confirmation screen | Ledger extracted and editable; unconfirmed ledger blocks tailoring |
| R3 | Tailor engine and format guard, PDF export | On a fixture set, output has identical page count, styles and section order, or the change is dropped |
| R4 | Review screen and apply integration (always-review mode) | A tailored version is sent only after you approve; record shows exactly what was sent |
| R5 | Follow-up reminders and notifications | Reminder fires on day 7 without reply |
| R6 | Insights by resume version, with minimum-data rule | Matches only shown when sample is large enough |

R1 comes first because it is low risk, useful alone, and R3 onward depends on it.

## 8. Risks and honest limits

- Tailoring improves keyword match and relevance; it **cannot guarantee a shortlist**.
- Complex DOCX layouts (text boxes, images of text, heavy tables) may be only partly editable; the guard will keep the original wording there.
- PDF-only masters cannot be edited; you must keep a DOCX.
- Needs LibreOffice available where the backend runs (check deploy image).
- AI wording quality depends on the provider; every change is shown to you.
- I cannot verify results on real job platforms from the build environment.

## 9. Decisions needed from you

1. Confirm A1 and A2.
2. Is it acceptable that tailoring requires a DOCX master (PDF stays select-only)?
3. Start with R1 (recommended)?
4. Default review mode: always review (recommended) or auto for keyword-only changes?
