# DEPLOYMENT.md — Environment Topologies & Production Migration

## 1. Environment Topologies

```
+---------------------------------------------------------------------------------------------------+
| DEVELOPMENT (Phase 1 Local)                                                                       |
|                                                                                                   |
|  [React Web UI] ──► [FastAPI Monolith] ──► [In-Process LocalTaskQueue] ──► [Playwright Chromium]  |
|                            │                                                                      |
|                     [SQLite (WAL)]                                                                |
+---------------------------------------------------------------------------------------------------+

+---------------------------------------------------------------------------------------------------+
| PRODUCTION TARGET (Phase 7+ Enterprise SaaS)                                                      |
|                                                                                                   |
|  [React CDN] ──► [FastAPI API Cluster] ──► [Redis Queue] ──► [Distributed Worker Pool]            |
|                            │                                        │                             |
|              [PostgreSQL 16 + pgvector]                      [Playwright Pods]                    |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Infrastructure Comparison Matrix

| Component | Development Environment | Production Target Environment |
|---|---|---|
| **Database Engine** | SQLite 3 (WAL Mode + busy_timeout=5000) | Managed PostgreSQL 16+ (e.g. AWS RDS / Supabase) |
| **Vector Engine** | Local Cosine / Scikit-Learn in-memory | PostgreSQL `pgvector` extension (HNSW indexes) |
| **Worker Queue** | `LocalTaskQueue` (Python `asyncio.Queue`) | Redis 7+ with Celery / ARQ workers |
| **Browser Execution**| Local Headed/Headless Chromium | Containerized Playwright Workers with Xvfb / Browserless |
| **Artifact Storage** | Local Disk (`./storage/`) | AWS S3 / Cloudflare R2 / MinIO |
| **Secrets & Keys** | `.env` file | AWS Secrets Manager / Vault / Kubernetes Secrets |
| **WebSockets** | Single FastAPI in-process broadcaster | Redis Pub/Sub backed WebSocket cluster |

---

## 3. Step-by-Step Migration Guide: SQLite $\to$ PostgreSQL

1. **Update Connection String**:
   - Change `DATABASE_URL` in `.env` from `sqlite+aiosqlite:///./app.db` to `postgresql+asyncpg://user:password@host:5432/job_platform_db`.
2. **Apply Alembic Migrations**:
   - Run `alembic upgrade head` to construct all tables and composite uniqueness indexes on PostgreSQL.
3. **Enable `pgvector` Extension**:
   - Execute `CREATE EXTENSION IF NOT EXISTS vector;` on the PostgreSQL instance.
   - Run the vector migration revision to convert JSON embedding columns into `vector(1536)`.
4. **Zero Domain Code Changes**:
   - Because all domain entities and repositories use abstract interfaces and generic SQLAlchemy models, **zero lines of business logic require modification**.

---

## 4. Step-by-Step Migration Guide: Local Queue $\to$ Redis / Celery

1. Set `TASK_QUEUE_BACKEND=redis` in `.env`.
2. Provide `REDIS_URL=redis://localhost:6379/0`.
3. Launch worker container processes:
   ```bash
   celery -A app.workers.celery_app worker -Q discovery,matching,applications -c 4 -l info
   ```
4. The application layer continues to call `task_queue.enqueue(...)` through the domain interface without code changes.
