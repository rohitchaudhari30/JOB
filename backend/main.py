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
from app.api.v1.connections import router as connections_router
from app.api.v1.health import router as health_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.matching import router as matching_router, matching_weights_alias_router
from app.api.v1.profile import router as profile_router
from app.api.v1.resumes import router as resumes_router
from app.api.v1.ws import router as ws_router
from app.core.config import settings
from app.core.database import init_db
from app.core.exceptions import PlatformException
from app.core.logging import logger, setup_logging
from app.infrastructure.browser.browser_manager import browser_manager
from app.workers.scheduler_worker import scheduler_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info(f"Starting {settings.APP_NAME} in [{settings.APP_ENV}] mode...")
    await init_db()
    scheduler_worker.initialize()
    from app.workers.automation_worker import automation_worker
    automation_worker.start()
    yield
    logger.info(f"Shutting down {settings.APP_NAME}...")
    automation_worker.stop()
    scheduler_worker.shutdown()
    await browser_manager.shutdown()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Enterprise Job Automation Platform API",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
