# Project Handover: Digital Twin of the Shoulder

**Project Name**: Digital Twin of the Shoulder (DTS)  
**Target Domain**: Orthopedic Research, Patient-Specific Anatomy Reconstruction, Preoperative Shoulder Arthroplasty Planning  
**Audience**: Clinical researchers, biomechanical engineers, and medical imaging software students  
**Current Date**: October 2026  

---

## 1. System Architecture Overview

The system is designed as a decoupled two-tier architecture:

```
┌────────────────────────────────────────────────────────┐
│               Frontend (React 19 + TypeScript)         │
│  - Vite bundler & development server (Port 3000)        │
│  - Tailwind CSS + Lucide icons                         │
│  - Three.js (WebGL 3D surface mesh & landmark viewer)   │
│  - Canvas-based 2D Multi-Planar Reconstruction (MPR)   │
│  - Same-Origin Reverse Proxy: /api/* -> 127.0.0.1:8001  │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP JSON / REST
                            ▼
┌────────────────────────────────────────────────────────┐
│            Backend (Python 3.10+ / FastAPI)            │
│  - Uvicorn ASGI Server (Port 8001)                     │
│  - Pydantic v2 typed data contracts                    │
│  - RESTful Endpoints: Health (/api/health),            │
│    Cases CRUD (/api/cases)                             │
│  - Truthful hardware detection (CUDA, PyTorch, MONAI)   │
└───────────────────────────┬────────────────────────────┘
                            │ Parameterized SQL
                            ▼
┌────────────────────────────────────────────────────────┐
│             Persistent Database (SQLite3)              │
│  - File path: data/shoulder_twin.db                   │
│  - Preserves ResearchCase metadata across restarts    │
└────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure

```
├── backend/
│   ├── app/
│   │   ├── config.py              # Environment configuration (Port, Database path, CORS)
│   │   ├── main.py                # FastAPI app entry point & lifespan handler
│   │   ├── models/
│   │   │   └── case.py            # Pydantic schemas (ResearchCase, Demographics, Health)
│   │   ├── routers/
│   │   │   ├── cases.py           # Cases endpoints (GET, POST, PATCH, DELETE)
│   │   │   └── health.py          # Truthful system probe (CUDA/PyTorch/SimpleITK checks)
│   │   └── storage/
│   │       ├── __init__.py        # Exported case store interface
│   │       ├── memory.py          # Legacy in-memory implementation (kept for test isolation)
│   │       └── sqlite.py          # Production SQLite repository with full JSON field fidelity
│   ├── requirements.txt           # Minimal backend dependencies (fastapi, uvicorn, pydantic, pytest)
│   └── tests/
│       └── test_api.py            # 9 automated unit/integration tests with isolated temp DB
├── data/
│   └── shoulder_twin.db           # SQLite database persisting registered research cases
├── src/
│   ├── components/
│   │   ├── common/                # Reusable status badges and UI elements
│   │   ├── imaging/               # 2D CT viewer with Window/Level & crosshair controls
│   │   ├── layout/                # Sidebar, TopBar, CreateCaseModal, NotificationsDrawer
│   │   ├── three/                 # Three.js 3D viewport, OrbitControls, STL loader
│   │   └── views/                 # 10 application views (Overview, Cases, 3D, Imaging, etc.)
│   ├── services/
│   │   ├── apiClient.ts           # Centralized HTTP client communicating with backend
│   │   ├── caseStorage.ts         # Browser localStorage caching & Synthetic Demo Reference
│   │   └── dicomSimulator.ts      # 2D mathematical attenuation field simulation
│   └── types/
│       ├── api.ts                 # API contracts and health response types
│       └── case.ts                # TypeScript interfaces matching backend models
├── package.json                   # React, Vite, Three.js, Tailwind dependencies
└── vite.config.ts                 # Vite config with same-origin /api reverse proxy
```

---

## 3. Engineering Decisions & Rationale

1. **Vite Reverse Proxy (`/api` -> `8001`)**:
   In cloud-hosted web previews (like Google AI Studio or Cloud Run), pages are served over HTTPS. Direct browser calls to `http://localhost:8001` are blocked by modern browsers due to the **Mixed Content Security Policy**. Routing calls to `/api/*` on the same origin allows the dev server to proxy traffic locally over HTTP to port 8001, completely eliminating mixed-content errors.
2. **SQLite with JSON-Serialized Columns**:
   Rather than introducing heavyweight PostgreSQL or external cloud databases at this early stage, SQLite is standard library (`sqlite3`), file-backed, zero-maintenance, and guarantees metadata persistence across server reboots.
3. **Truthful Environment Reporting**:
   Medical imaging software must never fabricate system readiness or pretend AI models are running when they are not. If PyTorch or CUDA is unavailable, the health check explicitly reports `gpuAvailable: false, torchVersion: null`.
4. **Synthetic Demo Case Separation**:
   The built-in demo case (`DEMO-SHL-2026-0042`) allows researchers to explore the 3D anatomical viewer and simulated CT slices even when no patient DICOM series has been uploaded yet. It is clearly tagged as `[SYNTHETIC DEMO]` to prevent confusion with real research cases.
