# FLOW.md — Complete End-to-End System Workflows

## 1. High-Level Lifecycle & Live Streaming Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant WebUI as React Frontend (Live Console)
    participant API as FastAPI Backend (REST & WS)
    participant Worker as Background Workers
    participant Playwright as Playwright Engine
    participant AI as AI Gateway (Groq/Gemini)
    participant DB as SQLite/PostgreSQL

    User->>WebUI: Create Profile & Upload Resumes
    WebUI->>API: POST /api/v1/profile
    API->>DB: Save Profile, Resumes, Preferences

    User->>WebUI: Connect Platform (e.g. Naukri/LinkedIn)
    WebUI->>API: Initiate Session Connection
    API->>Playwright: Launch Headed Auth Session
    User->>Playwright: Complete Login / Verification
    Playwright->>API: Extract StorageState
    API->>DB: Save Encrypted StorageState

    Note over Worker: Scheduled / Manual "Start Auto Apply"
    User->>WebUI: Click "Start Auto Apply"
    WebUI->>API: POST /automation/run & Connect WS /ws
    
    Worker->>Playwright: Run Job Discovery
    Playwright-->>API: Stream Visual Frames (5-10 FPS)
    Worker-->>API: Stream Event: SEARCH_STARTED, JOBS_DISCOVERED
    API-->>WebUI: Push Frames & Timeline Events to Live Console
    Playwright->>DB: Save Discovered Jobs (Deduplicated)

    Worker->>AI: Execute 5-Stage Matching Cascade
    AI->>DB: Save Match Results & Policy Decisions
    Worker-->>API: Stream Event: MATCH_COMPLETED (Score: 92%)
    API-->>WebUI: Push Score Breakdown to Live Console

    alt Decision == AUTO_APPLY (Score >= 90%)
        Worker->>Playwright: Launch Application Worker
    else Decision == APPROVAL_REQUIRED (Score 75-89%)
        Worker-->>API: Stream Event: APPROVAL_REQUIRED
        API-->>WebUI: Notify User for Approval in Live Console
        User->>WebUI: Click "Approve"
        WebUI->>API: POST /api/v1/applications/{id}/approve
        API->>Worker: Enqueue Application
    end

    Worker->>Playwright: Open Application Form
    Playwright-->>API: Stream Visual Frame: Form Modal
    Worker-->>API: Stream Event: FORM_DETECTED, FIELD_FILLED
    Playwright->>Playwright: Detect Fields & Fill Profile Data
    
    alt OTP / CAPTCHA Detected
        Playwright->>Worker: Challenge Triggered
        Worker->>DB: State -> PAUSED_OTP / PAUSED_CAPTCHA
        Worker-->>API: Stream Event: CAPTCHA_REQUIRED / OTP_REQUIRED
        API-->>WebUI: Live Console Displays Challenge Banner & "Take Control"
        User->>WebUI: Click "Take Control"
        WebUI->>Playwright: Focus Headed Window / Interactive Mode
        User->>Playwright: Solves Challenge / Enters OTP
        User->>WebUI: Click "Resume"
        WebUI->>API: POST /applications/{id}/resume
        API->>Worker: Resume Signal Sent
    end

    Playwright->>Playwright: Submit Application
    Playwright->>DB: State -> APPLIED
    Worker-->>API: Stream Event: APPLICATION_SUBMITTED
    API-->>WebUI: Live Console Updates Stats: Submitted +1
```

---

## 2. Detailed Sub-Workflows

### 2.1 Job Discovery, Freshness Normalization & Deduplication Workflow
```mermaid
graph TD
    Start[Trigger Discovery] --> LoadSession[Load & Decrypt Browser Session]
    LoadSession --> HealthCheck{Session Valid?}
    HealthCheck -- No --> AuthExpired[State -> PAUSED_AUTH_EXPIRED & Alert User]
    HealthCheck -- Yes --> SearchJobs[Search with Dynamic Rule Params]
    SearchJobs --> ExtractListings[Extract Job Cards, Raw Dates & External IDs]
    ExtractListings --> ParseFreshness[Date Parser: Raw Text -> UTC posted_at & Freshness Score]
    ParseFreshness --> DedupCheck{Exists in DB?}
    DedupCheck -- Yes --> TouchSeen[Update last_seen_at & recalculate Freshness Score]
    DedupCheck -- No --> FetchJD[Fetch Full JD & Snapshot]
    FetchJD --> Normalize[Normalize to Standard Schema with Temporal Attributes]
    Normalize --> SaveDB[(Insert into `jobs` Table with first_seen_at)]
    TouchSeen --> TriggerMatch[Enqueue Matching Task if Active]
    SaveDB --> TriggerMatch
```

### 2.2 5-Stage Matching & Decision Workflow
```mermaid
graph TD
    Job[Discovered Job] --> Stage1{Stage 1: Hard Filters}
    Note1[Check Exp, Salary, Location & max_job_age_hours] -.-> Stage1
    Stage1 -- Fail --> Reject[State: REJECTED / Score: 0]
    Stage1 -- Pass --> Stage2[Stage 2: Structured Skill Overlap]
    Stage2 --> Stage3[Stage 3: Embedding Semantic Similarity]
    Stage3 --> Stage4[Stage 4: Groq AI Reasoning & Nuance Scoring]
    Stage4 --> ConfidenceCheck{Confidence >= 0.85?}
    ConfidenceCheck -- No --> Stage5[Stage 5: Gemini Validation Fallback]
    ConfidenceCheck -- Yes --> FinalScore[Compute Weighted Score with Freshness Bonus]
    Stage5 --> FinalScore
    FinalScore --> PolicyEngine[Decision / Policy Engine]
    PolicyEngine -->|Score >= 90 & Auto-Apply ON| AutoApply[Decision: AUTO_APPLY]
    PolicyEngine -->|Score 75-89 or Unknown Qs| Review[Decision: REQUIRE_APPROVAL]
    PolicyEngine -->|Score 60-74| Save[Decision: SAVE]
    PolicyEngine -->|Score < 60| RejectPolicy[Decision: REJECT]
```

### 2.3 Application, Live Visual Streaming & Form Automation Workflow
```mermaid
graph TD
    StartApp[Start Application Worker] --> OpenPage[Navigate to Apply URL]
    OpenPage --> StreamFrame[Capture Base64 Frame & Stream to WS]
    StreamFrame --> DetectStep[Scan DOM: Form Fields & Step N of M]
    DetectStep --> MatchIntents[Classify Canonical Field Intents]
    MatchIntents --> FillData[Fill Contact, Experience, Education]
    FillData --> AttachResume[Attach Selected Resume File]
    AttachResume --> DetectQuestions{Custom Questions?}
    DetectQuestions -- Yes --> CheckSaved{Known in Saved Answers?}
    CheckSaved -- Yes --> FillSaved[Fill Saved Answer]
    CheckSaved -- No --> AskAI[Generate via AI Gateway]
    AskAI --> Confidence{AI Confidence >= 0.85?}
    Confidence -- No --> PauseUser[State -> PAUSED_USER_INPUT & Alert]
    Confidence -- Yes --> FillAI[Fill Generated Answer]
    DetectQuestions -- No --> VerifyForm[Validate Fields & Required States]
    FillSaved --> VerifyForm
    FillAI --> VerifyForm
    VerifyForm --> ChallengeCheck{OTP / CAPTCHA Present?}
    ChallengeCheck -- Yes --> PauseChallenge[State -> PAUSED_OTP/CAPTCHA & Alert Live Console]
    PauseChallenge --> TakeControlCheck{User Takes Control?}
    TakeControlCheck --> UserSolves[User Interactively Solves Challenge]
    UserSolves --> ResumeSignal[User Clicks 'Resume' in Console]
    ResumeSignal --> SubmitStep[Click Submit / Next Step]
    ChallengeCheck -- No --> SubmitStep
    SubmitStep --> MultiStep{More Wizard Steps?}
    MultiStep -- Yes --> DetectStep
    MultiStep -- No --> ConfirmApplied[Verify Success Confirmation]
    ConfirmApplied --> MarkApplied[State -> APPLIED & Save Audit Log]
```
