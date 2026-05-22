from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .core.logging import configure_logging
from .db.base import Base, engine
from .models import *  # noqa: ensure models are registered
from .routers import groups, scale, webhooks, status, admin, api_keys, system

configure_logging(settings.debug)

# Create tables on startup (migrations handle schema changes)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    description="API-first autoscaling system for Linode Compute Instances",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router)
app.include_router(groups.router)
app.include_router(scale.router)
app.include_router(webhooks.router)
app.include_router(status.router)
app.include_router(admin.router)
app.include_router(api_keys.router)
