# TESTING.md — Testing Strategy, Test Suites & Mocking Framework

## 1. Testing Pyramid & Quality Standards

To ensure stability across external browser changes and AI dependencies, the test suite emphasizes fast unit/domain tests with comprehensive contract mocking:

```
                  / \
                 /   \       E2E / Browser Smoke Tests (5%)
                /     \      (Playwright Mock Server Tests)
               /-------\
              /         \    Integration & Repository Tests (25%)
             /           \   (FastAPI routes, SQLite in-memory, FSM)
            /-------------\
           /               \ Unit & Domain Tests (70%)
          /                 \ (Matching cascade, Form engine, AI Gateway mocks)
         ---------------------
```

---

## 2. Test Suites Organization

```
backend/tests/
├── unit/
│   ├── domain/
│   │   ├── test_state_machine.py       # FSM transitions and invalid jumps
│   │   ├── test_matching_rules.py      # Hard filters & weighted score calculators
│   │   └── test_field_intents.py       # Canonical intent mapping logic
│   └── infrastructure/
│       ├── test_ai_gateway.py          # AI Gateway fallback & timeout handling (mocked)
│       ├── test_dom_analyzer.py        # Heuristic DOM parsing on static HTML fixtures
│       └── test_crypto.py              # AES-256-GCM session state encryption/decryption
├── integration/
│   ├── api/
│   │   ├── test_auth_api.py            # User registration, JWT login, token expiry
│   │   ├── test_profile_api.py         # Candidate profile CRUD and skill updates
│   │   ├── test_jobs_api.py            # Discovered jobs search and filtering
│   │   └── test_applications_api.py    # Application approval & state query endpoints
│   └── repositories/
│       └── test_sqlite_repositories.py # SQLAlchemy CRUD against in-memory SQLite WAL
├── adapters/
│   └── test_adapter_contracts.py       # BaseJobSource & BaseApplication contract conformance
└── fixtures/                           # Static HTML pages & mock JSON responses
```

---

## 3. Mocking Strategy for External Dependencies

### 3.1 AI Provider Mocking (`MockAIProvider`)
Real API calls to Groq or Gemini are **strictly prohibited** during automated CI test runs:
```python
class MockAIProvider(AIProvider):
    async def match_job(self, candidate_text: str, job_text: str) -> MatchEvaluationDTO:
        return MatchEvaluationDTO(
            score=88.5,
            matched_skills=["Python", "SQL"],
            missing_skills=["Kubernetes"],
            reasoning="Strong profile alignment with core data requirements.",
            confidence=0.92
        )
```

### 3.2 Browser Engine & DOM Fixture Testing
- Complex ATS forms and portal modals are tested against static HTML fixtures in `tests/fixtures/html/` (e.g. `naukri_apply_modal.html`, `greenhouse_job_form.html`).
- This allows deterministic verification of the heuristic DOM parser and field classifier without launching live browser processes or triggering live network requests.

---

## 4. Running Tests

```powershell
# Run all unit and integration tests
pytest backend/tests/ -v

# Run with test coverage report
pytest backend/tests/ --cov=backend/app --cov-report=term-missing

# Run only domain state machine tests
pytest backend/tests/unit/domain/test_state_machine.py -v
```
