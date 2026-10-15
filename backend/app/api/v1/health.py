import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core import database
from app.core.config import settings

logger = logging.getLogger("app.health")
router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """Liveness: the process is up. It does not check anything else."""
    return {
        "status": "alive",
        "app_name": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
    }


@router.get("/health/ready")
async def readiness_check():
    """Readiness: the database answers a real query. Returns 503 when it does not."""
    try:
        async with database.AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Readiness check failed")
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "database": "unavailable"},
        )
    return {"status": "ready", "database": "connected"}
