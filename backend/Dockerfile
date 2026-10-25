# Multi-stage production container for Digital Twin of the Shoulder FastAPI backend
FROM python:3.11-slim

WORKDIR /app

# Prevent Python from writing .pyc files & enable unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8001 \
    DATA_DIR=/app/data \
    DATABASE_PATH=/app/data/shoulder_twin.db

# Install backend dependencies
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend /app/backend

# Ensure SQLite storage directory exists
RUN mkdir -p /app/data

EXPOSE 8001

# Start uvicorn with Cloud Run / Render compatible port variable
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
