# BROWSER_AUTOMATION.md — Playwright Browser Engine Architecture

## 1. Browser Architecture Overview

The Playwright browser engine lives strictly inside `app/infrastructure/browser/` and is abstracted from the domain layer.

```
app/infrastructure/browser/
├── browser_manager.py       # Global Chromium process pool & launch configurations
├── context_manager.py       # Multi-tenant isolated browser contexts with encrypted sessions
├── page_manager.py          # Navigation safety, stealth plugins, and timeout guards
├── screenshot_streamer.py   # Real-time base64 visual frame capturer (5-10 FPS)
├── dom_analyzer.py          # Heuristic DOM scanner and accessibility tree parser
├── form_engine.py           # Multi-signal field classifier, intent mapper, and filler
├── recovery_engine.py       # Dynamic popup dismisser, navigation retrier, and error handler
└── trace_manager.py         # Screenshot and trace.zip capture on failure
```

---

## 2. Browser Context & Session Isolation

- **Tenant Isolation**: Every task acquires a dedicated, freshly spawned `BrowserContext` with independent cookies, local storage, and cache.
- **Session Injection**:
  1. Worker fetches encrypted `storage_state` from `browser_sessions` table.
  2. Decrypts state in-memory via AES-256-GCM.
  3. Initializes `browser.new_context(storage_state=decrypted_state, viewport={"width": 1280, "height": 800})`.
  4. Context is securely closed and wiped after task completion.

---

## 3. Real-Time Visual Streaming (`screenshot_streamer.py`)

- During active automation runs, the `screenshot_streamer` periodically samples the active Playwright page ($5\text{--}10\text{ FPS}$ with quality compression $60\%$).
- Converts raw frame buffers into lightweight base64 JPEG strings and emits them to the WebSocket dispatcher.
- **Throttling & Efficiency**: Automatically pauses frame capture when the page is completely static or idle, conserving CPU and bandwidth.

---

## 4. Anti-Bot Defense & Stealth Protocol

To ensure reliability without attempting illegal bypasses:
- **Stealth Initialization**: Injects scripts to mask `navigator.webdriver`, configure realistic WebGL renderer strings, and set appropriate user-agents and language headers.
- **Human-like Interactions**: Typing uses randomized keypress delays ($15\text{--}40\text{ ms}$), with natural cursor movements and scroll events.
- **Event Dispatching**: After filling input fields, explicitly dispatches `input`, `change`, and `blur` events to ensure React/Angular/Vue validation bindings trigger properly.

---

## 5. Multi-Step Form Automation Engine

```mermaid
graph TD
    Navigate[Navigate to Apply Page] --> FrameCheck{Nested Iframe or Shadow DOM?}
    FrameCheck -- Yes --> AcquireFrame[Acquire FrameLocator]
    FrameCheck -- No --> AcquirePage[Use Main Page]
    AcquirePage --> ScanDOM[Scan Visible Inputs / Selects / Textareas]
    AcquireFrame --> ScanDOM
    ScanDOM --> DetectFields[Extract Heuristic Metadata: Label, Name, Placeholder, ARIA]
    DetectFields --> ClassifyIntents[Classify Canonical Intent]
    ClassifyIntents --> ResolveValue[Resolve Candidate Value]
    ResolveValue --> FillElement[Execute Playwright Fill / Select]
    FillElement --> CheckUpload{Resume Upload Input?}
    CheckUpload -- Yes --> SetInputFiles[page.set_input_files(...)]
    CheckUpload -- No --> ValidateFields[Verify All Required Fields Valid]
    SetInputFiles --> ValidateFields
    ValidateFields --> ChallengeProbe{OTP / CAPTCHA Modal Visible?}
    ChallengeProbe -- Yes --> PauseState[Trigger PAUSED_OTP / PAUSED_CAPTCHA & Alert Live Console]
    ChallengeProbe -- No --> ClickNext[Click 'Next' / 'Submit']
    ClickNext --> NextStepCheck{Next Wizard Step Present?}
    NextStepCheck -- Yes --> ScanDOM
    NextStepCheck -- No --> VerifySuccess[Verify Submission Success Confirmation]
```

---

## 6. Failure Artifacts & Time-Travel Debugging

- When an application ends in `FAILED` or `ERROR`:
  1. Captures a full-page screenshot saved to `./storage/screenshots/{application_id}.png`.
  2. Stops tracing and saves the Playwright trace archive to `./storage/traces/{application_id}.zip`.
  3. Links artifact file paths to the `applications` record.
  4. Allows developers to run `playwright show-trace ./storage/traces/{id}.zip` to inspect DOM mutations, network calls, and console logs.
