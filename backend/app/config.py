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
    
    # OWASP PBKDF2-HMAC-SHA256 iterations (default: 600,000)
    PBKDF2_ITERATIONS: int = int(os.getenv("PBKDF2_ITERATIONS", "600000"))
    
    # Dev account seeding flag: disabled by default in production
    ALLOW_DEV_SEEDING: bool = os.getenv(
        "ALLOW_DEV_SEEDING",
        "false" if os.getenv("ENVIRONMENT") == "production" else "true"
    ).lower() == "true"

    # Explicit allowed CORS origins (Wildcard '*' is forbidden with allow_credentials=True)
    @property
    def cors_origins(self) -> List[str]:
        raw_env_origins = os.getenv("CORS_ORIGINS", "")
        origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
        if raw_env_origins:
            for o in raw_env_origins.split(","):
                cleaned = o.strip()
                if cleaned and cleaned != "*" and cleaned not in origins:
                    origins.append(cleaned)
        return origins


settings = Settings()

