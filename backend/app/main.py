from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings, validate_startup_configuration
from .routers import health, cases, imaging, auth, models, research, registration
from .storage import case_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_startup_configuration()
    case_store._init_db()
    try:
        yield
    finally:
        if hasattr(case_store, "close"):
            case_store.close()


app = FastAPI(
    title="Digital Twin of the Shoulder API",
    description="Research-oriented FastAPI backend for patient-specific shoulder anatomy reconstruction and preoperative planning.",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)*(run\.app|onrender\.com)$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
)

# Register routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(cases.router)
app.include_router(imaging.router)
app.include_router(models.router)
app.include_router(research.router)
app.include_router(registration.router)


@app.get("/health")
def root_health():
    return health.get_health()


@app.get("/")
def root():
    return {
        "service": settings.SERVICE_NAME,
        "version": settings.VERSION,
        "storage": "sqlite3",
        "database": settings.DATABASE_PATH,
        "docs": "/docs",
        "health": "/api/health",
        "cases": "/api/cases",
        "imagingUpload": "/api/cases/{case_id}/imaging/upload",
    }
