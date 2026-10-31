# Technology Stack & Dependency Reference
# Digital Twin of the Shoulder (DTS)

**Document Version**: 2.0  
**Audit Date**: October 2026  
**Ecosystem**: TypeScript / React 19 / Vite + Python 3.10+ / FastAPI / SQLite3  

---

## 1. Master Technology Stack Table

| Technology / Library | Purpose | Where Used in Project | Implementation Status |
| :--- | :--- | :--- | :--- |
| **React 19** (`^19.0.1`) | Core frontend declarative UI component framework | Entire `src/` directory | Fully Implemented & Active |
| **TypeScript** (`^7.0.2` / `~5.x`) | Static type checking and strict interface contracts | All `.ts` and `.tsx` source files | Fully Implemented (`tsc --noEmit` passing) |
| **Vite** (`^8.3.0` / `^5.x`) | Fast bundler, dev server, and reverse proxy | `vite.config.ts`, `package.json` | Fully Implemented & Active on port 3000 |
| **Tailwind CSS v4** (`^4.3.3`) | Utility-first CSS styling and responsive layout | `src/index.css`, all component styles | Fully Implemented & Active |
| **Three.js** (`^0.186.1`) | 3D WebGL rendering engine, lights, materials, camera | `src/components/three/ShoulderScene.tsx` | Fully Implemented & Active |
| **Three.js STLLoader** | Client-side parsing of binary and ASCII `.stl` files | `src/components/three/STLLoaderUtil.ts` | Fully Implemented & Active |
| **Three.js OrbitControls** | Interactive camera rotation, pan, and zoom controls | `src/components/three/ShoulderScene.tsx` | Fully Implemented & Active |
| **Lucide React** (`^0.546.0`) | Biomedical, clinical, and navigation icon set | All layout and view components | Fully Implemented & Active |
| **Motion** (`^12.23.24`) | UI animations, transition effects, and modal entry | Layout and drawer transitions | Implemented & Active |
| **FastAPI** (`>=0.100.0`) | High-performance asynchronous Python REST framework | `backend/app/main.py`, routers | Fully Implemented & Active |
| **Uvicorn** (`>=0.23.0`) | Lightning-fast ASGI web server for Python | `backend/Dockerfile`, local dev runner | Fully Implemented & Active |
| **Pydantic v2** (`>=2.0.0`) | Data validation, request parsing, and JSON serialization | `backend/app/models/case.py` | Fully Implemented & Active |
| **SQLite3** (Python stdlib) | Relational SQL database engine for research cases | `backend/app/storage/sqlite.py` | Fully Implemented & Active |
| **Pydicom** (`>=2.4.0`) | Medical imaging DICOM Part 10 dataset parser | `backend/app/services/dicom_service.py` | Fully Implemented in Workspace |
| **NumPy** (`>=1.24.0`) | Fast array manipulation for DICOM pixel buffers | `backend/app/services/dicom_service.py` | Fully Implemented in Workspace |
| **Pillow (PIL)** (`>=10.0.0`) | Grayscale contrast windowing and PNG preview encoding | `backend/app/services/dicom_service.py` | Fully Implemented in Workspace |
| **Python-Multipart** (`>=0.0.9`) | Multipart form data streaming for DICOM file uploads | `backend/app/routers/imaging.py` | Fully Implemented in Workspace |
| **HTTPX** (`>=0.24.0`) | Asynchronous HTTP client used for backend test client | `backend/tests/` | Fully Implemented & Active |
| **Pytest** (`>=7.0.0`) | Automated Python unit and integration testing suite | `backend/tests/test_api.py`, `test_dicom.py` | Fully Implemented (16 test cases) |
| **Docker** | Multi-stage containerization for cloud deployment | `backend/Dockerfile` | Configured for Render & Cloud Run |

---

## 2. Development Environment & Runtime Specifications

### 2.1 Frontend Runtime
- **Node.js**: v18.x or v20.x
- **Development Server**: Vite 8.3 / Vite 5 running on port 3000 (`0.0.0.0:3000`).
- **Proxy Configuration**: `/api` routes are proxied via `vite.config.ts` to `FASTAPI_BACKEND_TARGET` (defaulting to `http://127.0.0.1:8001`) during local development to eliminate CORS and Mixed Content issues.

### 2.2 Backend Runtime
- **Python**: Python 3.10.x / 3.11.x
- **ASGI Server**: Uvicorn listening on port `8001` (local) or `${PORT}` (cloud).
- **Environment Variables**:
  - `PORT`: Server listening port (default `8001`).
  - `DATA_DIR`: Directory where SQLite database resides (default `data` or `/app/data`).
  - `DATABASE_PATH`: Explicit path to SQLite file (default `data/shoulder_twin.db`).
  - `CORS_ORIGINS`: Allowed origins (default `*` in development).

### 2.3 Cloud Hosting & Continuous Deployment
- **Git Repository**: GitHub `ojasmita27/digital-twin-of-the-shoulder`
- **Frontend Hosting**: Google AI Studio Build Preview environment.
- **Backend Cloud Hosting**: Render (`https://digital-twin-of-the-shoulder.onrender.com`).
  - **Origin**: Cloudflare CDN + Uvicorn origin server.
  - **Build Command**: `pip install -r backend/requirements.txt`
  - **Start Command**: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
  - **Disk Note**: Free-tier Render instances use an ephemeral filesystem; database records reset when the instance spins down. A Render Persistent Disk mount is recommended for permanent research archives.
