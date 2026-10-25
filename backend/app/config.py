import os
from typing import List


class Settings:
    SERVICE_NAME: str = "digital-twin-shoulder-backend"
    VERSION: str = "0.1.0-phase1"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8001"))
    DATA_DIR: str = os.getenv("DATA_DIR", os.path.join(os.getcwd(), "data"))
    DATABASE_PATH: str = os.getenv("DATABASE_PATH", os.path.join(os.getcwd(), "data", "shoulder_twin.db"))
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*",
    ]


settings = Settings()
