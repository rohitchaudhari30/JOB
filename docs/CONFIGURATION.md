# CONFIGURATION.md — Dynamic System Configuration & Settings

## 1. Configuration Hierarchy

The system distinguishes between two distinct types of configuration:
1. **System & Environment Settings**: Infrastructure parameters loaded from `.env` or system environment variables (Database URLs, API keys, encryption keys, concurrency caps).
2. **User & Automation Rules (Dynamic Database Settings)**: Configurable runtime rules stored in PostgreSQL/SQLite tables, modified via UI without restarting services.

---

## 2. Dynamic Database Configuration Schema

### 2.1 Automation Rules (`automation_rules`)
Users customize how the platform evaluates and applies to jobs:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `target_roles` | `List[str]` | `[]` | List of target job titles (e.g. `["Data Engineer", "Backend Developer"]`) |
| `target_locations` | `List[str]` | `[]` | Locations to filter (e.g. `["Bangalore", "Pune", "Remote"]`) |
| `min_experience_years` | `Float` | `0.0` | Minimum years of experience threshold |
| `max_experience_years` | `Float` | `10.0` | Maximum years of experience filter |
| `min_expected_ctc` | `Numeric` | `0` | Minimum salary threshold |
| `max_job_age_hours` | `Integer` | `72` | Hard filter threshold; jobs older than this are skipped at Stage 1 |
| `prefer_fresh_hours` | `Integer` | `24` | Preference threshold for prioritizing recent postings in discovery runs |
| `auto_apply_enabled` | `Boolean` | `False` | Automatically submit applications if score $\ge \text{auto\_apply\_threshold}$ |
| `auto_apply_threshold` | `Integer` | `90` | Minimum match percentage for automated submission |
| `approval_threshold` | `Integer` | `75` | Match percentage requiring user review before submission |
| `max_daily_applications` | `Integer` | `25` | Maximum applications permitted per 24-hour rolling window |
| `company_blacklist` | `List[str]` | `[]` | Companies to strictly skip or exclude |

### 2.2 Matching Engine Weights (`match_rules`)
Scoring weights are completely dynamic and adjustable per user or profile:

| Component | Default Weight (%) | Description |
|---|---|---|
| `skills_weight` | `30%` | Match between JD required/preferred skills and candidate profile |
| `experience_weight` | `20%` | Alignment of candidate years with JD requirements |
| `role_title_weight` | `15%` | Semantic similarity of job title to target roles |
| `freshness_weight` | `15%` | Score bonus based on job publication recency |
| `location_weight` | `10%` | Geographic / remote preference alignment |
| `salary_weight` | `5%` | Alignment with candidate minimum expected compensation |
| `education_weight` | `3%` | Degree and field of study compatibility |
| `notice_period_weight` | `2%` | Candidate availability vs employer urgency |

### 2.3 Dynamic Freshness Score Table
Freshness scores ($0\text{--}100$) are calculated non-linearly using configurable decay brackets:

| Freshness Bucket | Age Range | Default Freshness Score |
|---|---|---|
| `1h` | $< 1\text{ hour}$ | `100` |
| `3h` | $1\text{--}3\text{ hours}$ | `95` |
| `6h` | $3\text{--}6\text{ hours}$ | `90` |
| `12h` | $6\text{--}12\text{ hours}$ | `85` |
| `24h` | $12\text{--}24\text{ hours}$ | `80` |
| `3d` | $1\text{--}3\text{ days}$ | `70` |
| `7d` | $3\text{--}7\text{ days}$ | `50` |
| `14d` | $7\text{--}14\text{ days}$ | `30` |
| `30d` | $14\text{--}30\text{ days}$ | `15` |
| `older` | $> 30\text{ days}$ | `0` |
| `unknown` | Undetermined | `50` |

---

## 3. Platform Rate-Limiting & Cooldown Settings

To ensure balanced throughput and prevent IP throttling, each source adapter reads dynamic constraints:

```json
{
  "naukri": {
    "max_concurrent_sessions": 2,
    "requests_per_minute": 20,
    "cooldown_between_applications_sec": 15,
    "max_daily_quota": 50
  },
  "linkedin": {
    "max_concurrent_sessions": 1,
    "requests_per_minute": 10,
    "cooldown_between_applications_sec": 30,
    "max_daily_quota": 30
  },
  "greenhouse": {
    "max_concurrent_sessions": 5,
    "requests_per_minute": 40,
    "cooldown_between_applications_sec": 5,
    "max_daily_quota": 100
  }
}
```
