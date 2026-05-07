from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.config import get_settings
from app.cache.redis_client import init_redis, close_redis
from app.api.routes import analyze, sessions, history, feedback, admin, simulations, dataset, auth

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("🚀 PhishGuard backend starting...")
    await init_redis()
    logger.info("✅ Redis connected")
    yield
    logger.info("🔴 PhishGuard backend shutting down...")
    await close_redis()


app = FastAPI(
    title="PhishGuard API",
    description="Multi-channel phishing detection — Email, URL, Web, Voice",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.app_env == "development" else None,
    redoc_url="/redoc" if settings.app_env == "development" else None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router,        prefix="/auth",        tags=["Auth"])
app.include_router(analyze.router,     prefix="/analyze",     tags=["Analysis"])
app.include_router(sessions.router,    prefix="/sessions",    tags=["Sessions"])
app.include_router(history.router,     prefix="/history",     tags=["History"])
app.include_router(feedback.router,    prefix="/feedback",    tags=["Feedback"])
app.include_router(simulations.router, prefix="/simulations", tags=["Simulations"])
app.include_router(dataset.router,     prefix="/admin/dataset",     tags=["Dataset"])
app.include_router(admin.router,       prefix="/admin",       tags=["Admin"])


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "ok",
        "mock_models": settings.use_mock_models,
        "env": settings.app_env
    }
