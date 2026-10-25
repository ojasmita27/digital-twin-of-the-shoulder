from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .routers import health, cases
from .storage import case_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    case_store._init_db()
    yield


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
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health.router)
app.include_router(cases.router)


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
    }
