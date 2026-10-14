import asyncio
import sys
from contextlib import asynccontextmanager

# Enforce Windows Proactor event loop policy for Playwright subprocess execution
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.v1.analytics import router as analytics_router
from app.api.v1.applications import router as applications_router
from app.api.v1.auth import router as auth_router
from app.api.v1.automation import router as automation_router
from app.api.v1.campaigns import router as campaigns_router
from app.api.v1.connections import router as connections_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.health import router as health_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.matching import router as matching_router, matching_weights_alias_router
from app.api.v1.profile import router as profile_router
from app.api.v1.resumes import router as resumes_router
from app.api.v1.ws import router as ws_router
from app.core.config import settings
from app.core.database import init_db, reconcile_orphaned_runs
from app.core.exceptions import PlatformException
from app.core.logging import logger, setup_logging
from app.infrastructure.browser.browser_manager import browser_manager
from app.workers.scheduler_worker import restore_saved_schedules, scheduler_worker



def ensure_single_worker_process() -> None:
    """Live runs, WebSocket clients and locks are kept in this process's memory (ARC-05).

    A second worker process would not see them, so refuse to start with more than one.
    See docs/ARCHITECTURE.md for how to scale later.
    """
    import os

    workers = int(os.environ.get("WEB_CONCURRENCY", "1") or "1")
    if workers > 1:
        raise RuntimeError(
            f"WEB_CONCURRENCY={workers}: this app keeps live run state in memory and must run as a single "
            "process. Set WEB_CONCURRENCY=1 (see docs/ARCHITECTURE.md)."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    ensure_single_worker_process()
    logger.info(f"Starting {settings.APP_NAME} in [{settings.APP_ENV}] mode...")
    await init_db()
    await reconcile_orphaned_runs()
    scheduler_worker.initialize()
    await restore_saved_schedules()
    from app.workers.matching_worker import matching_worker
    matching_worker.start()
    yield
    logger.info(f"Shutting down {settings.APP_NAME}...")
    matching_worker.stop()
    scheduler_worker.shutdown()
    await browser_manager.shutdown()


# Interactive API docs are for development only. (SEC-13)
_docs_enabled = settings.is_dev_environment

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Enterprise Job Automation Platform API",
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

# CORS Middleware: only the methods and headers the frontend really uses.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Baseline browser protections on every response. (SEC-13)"""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if not _docs_enabled:
        # Pure JSON API: nothing on it should ever load scripts or be framed.
        response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


# Global Exception Handler
@app.exception_handler(PlatformException)
async def platform_exception_handler(request: Request, exc: PlatformException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "details": exc.details},
    )


# Include API Routers
app.include_router(health_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(profile_router, prefix="/api/v1")
app.include_router(connections_router, prefix="/api/v1")
app.include_router(resumes_router, prefix="/api/v1")
app.include_router(matching_router, prefix="/api/v1")
app.include_router(matching_weights_alias_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(applications_router, prefix="/api/v1")
app.include_router(automation_router, prefix="/api/v1")
app.include_router(campaigns_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(ws_router, prefix="/api/v1")
# Also mount WebSocket at root for proxy compatibility
app.include_router(ws_router)


@app.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "docs": "/docs",
        "health": "/api/v1/health",
    }
