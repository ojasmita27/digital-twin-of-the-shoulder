"""Storage factory selecting PostgreSQL when DATABASE_URL is set, otherwise SQLite."""
from ..config import settings
from .postgres import PostgresCaseStore
from .sqlite import SqliteCaseStore, case_store as _sqlite_default

if settings.DATABASE_URL and settings.DATABASE_URL.strip():
    case_store = PostgresCaseStore(settings.DATABASE_URL.strip())
else:
    case_store = _sqlite_default

__all__ = ["SqliteCaseStore", "PostgresCaseStore", "case_store"]
