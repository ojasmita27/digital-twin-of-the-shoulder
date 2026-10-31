# System Architecture Document
# Digital Twin of the Shoulder (DTS)

**Document Version**: 2.0  
**Target Systems**: Client SPA (React 19), REST Backend (FastAPI), Storage (SQLite3), Visualizer (Three.js WebGL)  
**Security & Privacy**: HIPAA/GDPR Preclinical De-Identification Standard  

---

## 1. High-Level Architectural Topology

The system adheres to a decoupled client-server architecture designed for biomedical imaging applications:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CLIENT LAYER (Browser Runtime)                       │
│                                                                        │
│  ┌───────────────────────┐          ┌───────────────────────────────┐  │
│  │  React 19 SPA (Vite)  │          │   Three.js WebGL Viewport     │  │
│  │  - Case Management    │          │   - Procedural Shoulder Scene │  │
│  │  - CT Slice Viewer    │◄────────►│   - STL Surface Mesh Loader   │  │
│  │  - Morphometrics      │          │   - Camera Presets & Orbit    │  │
│  │  - Implant Planner    │          │   - Joint Distraction Gizmo   │  │
│  └──────────┬────────────┘          └───────────────────────────────┘  │
│             │                                                          │
│             ▼                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │               ApiClient Service & Reactive Pub/Sub               │  │
│  │   - Base URL Resolver (Render / Localhost / Vite Proxy)          │  │
│  │   - Request Timeouts & AbortControllers                          │  │
│  │   - Typed REST Methods & Multipart FormData Serialization        │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │ HTTPS / REST (JSON + Multipart)
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                BACKEND LAYER (Python 3.10+ / FastAPI)                  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      FastAPI Application                         │  │
│  │  - Lifespan Manager (Database Auto-Init on Startup)              │  │
│  │  - CORS Middleware (Allow Origins: *, Methods: *, Headers: *)    │  │
│  └──────┬───────────────────────────┬───────────────────────┬───────┘  │
│         │                           │                       │          │
│         ▼                           ▼                       ▼          │
│  ┌───────────────┐          ┌───────────────┐       ┌───────────────┐  │
│  │ Health Router │          │ Cases Router  │       │Imaging Router │  │
│  │ /api/health   │          │ /api/cases    │       │/api/imaging   │  │
│  └───────────────┘          └───────┬───────┘       └───────┬───────┘  │
│                                     │                       │          │
│                                     ▼                       ▼          │
│                             ┌───────────────┐       ┌───────────────┐  │
│                             │ SqliteCase-   │       │ DicomService  │  │
│                             │ Store Layer   │       │ (Pydicom,     │  │
│                             └───────┬───────┘       │ NumPy, PIL)   │  │
│                                     │               └───────────────┘  │
│                                     ▼                                  │
│                             ┌───────────────┐                          │
│                             │ SQLite Engine │                          │
│                             │ data/shoulder_│                          │
│                             │ twin.db       │                          │
│                             └───────────────┘                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Component Hierarchy & Module Boundaries

The frontend application (`src/`) is organized as a single-page application with modular layout containers and domain-specific views:

```
src/
├── main.tsx                    # Entry point; mounts App into #root
├── App.tsx                     # Top-level coordinator; manages active case, route, & notifications
├── index.css                   # Global Tailwind CSS v4 styling rules
├── types/
│   ├── case.ts                 # TypeScript interfaces: ResearchCase, Demographics, Imaging, Meshes
│   └── api.ts                  # Typed API request/response definitions & health structures
├── services/
│   ├── apiClient.ts            # Reactive HTTP client with pub/sub event listener & health check
│   ├── caseStorage.ts          # LocalStorage cache & synthetic DEMO_CASE baseline
│   └── dicomSimulator.ts       # 2D Canvas Hounsfield attenuation renderer for simulated slices
├── components/
│   ├── common/
│   │   ├── MetricCard.tsx      # Standardized metric presentation with reference ranges
│   │   └── StatusBadge.tsx     # Color-coded case lifecycle state pills
│   ├── layout/
│   │   ├── TopBar.tsx          # Case switcher, backend health status badge, & header
│   │   ├── Sidebar.tsx         # Primary navigation drawer between 8 functional modules
│   │   ├── CreateCaseModal.tsx # Validated modal form for registering new research subjects
│   │   └── SystemNotificationsDrawer.tsx # Slide-out event log and audit provenance drawer
│   ├── imaging/
│   │   └── CTViewer.tsx        # Multi-planar 2D slice canvas with crosshairs and HU windowing
│   ├── three/
│   │   ├── ShoulderScene.tsx   # Three.js WebGL canvas, lighting, camera controls, & HUD
│   │   ├── STLLoaderUtil.ts    # Binary & ASCII STL mesh parser with bounding-box computation
│   │   ├── ProceduralAnatomy.ts# Parametric mathematical 3D meshes of scapula, humerus, & joint
│   │   └── LandmarkMarkers.ts  # 3D interactive fiducial pin markers placed in patient coordinates
│   └── views/
│       ├── OverviewView.tsx    # Dashboard metrics, architecture summary, & quick actions
│       ├── CasesView.tsx       # Searchable, filterable case registry with JSON export
│       ├── ImagingView.tsx     # DICOM upload dropzone, metadata table, & 3D feasibility card
│       ├── SegmentationView.tsx# AI segmentation simulation console with progressive log stream
│       ├── Anatomy3DView.tsx   # Interactive 3D surface inspector with anatomical hierarchy tabs
│       ├── MeasurementsView.tsx# Clinical morphometrics (glenoid version, inclination, subluxation)
│       ├── ImplantPlanningView.tsx # Virtual arthroplasty controls (glenosphere, tilt, lateralization)
│       ├── ReportsView.tsx     # Structured clinical report formatted for print / PDF generation
│       ├── ResearchDatasetsView.tsx # Open-access CT/mesh repository catalog (Zenodo, TCIA, NIH)
│       └── SettingsView.tsx    # FastAPI endpoint configuration, latency tester, & preset buttons
```

---

## 3. Backend Architecture & API Specifications

The FastAPI microservice (`backend/app/`) provides a clean separation of concerns:

### 3.1 Server Lifespan & Initialization (`backend/app/main.py`)
- Uses FastAPI's `lifespan` context manager.
- Triggers `case_store._init_db()` upon startup, verifying that the target database directory exists and creating the relational table structure if not present.
- Enables permissive CORS headers (`CORSMiddleware`) to accommodate cross-origin requests from web previews and desktop development clients.

### 3.2 Registered Routers & Endpoint Contracts

| HTTP Method | Route Endpoint | Router Module | Description | Response Model |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | `main.py` | Root service identification and API route index | JSON dict |
| `GET` | `/api/health` | `health.py` | Truthful server telemetry (CUDA, PyTorch, MONAI, SimpleITK) | `BackendHealthResponse` |
| `GET` | `/api/cases` | `cases.py` | List all de-identified research cases from SQLite | `List[ResearchCase]` |
| `POST` | `/api/cases` | `cases.py` | Create a new case; returns generated ID `SHL-2026-XXXXXX` | `ResearchCase` (201 Created) |
| `GET` | `/api/cases/{case_id}` | `cases.py` | Fetch full case details by identifier | `ResearchCase` (or 404) |
| `PATCH` | `/api/cases/{case_id}` | `cases.py` | Update specific fields of an existing case record | `ResearchCase` (or 404) |
| `DELETE` | `/api/cases/{case_id}` | `cases.py` | Permanently remove case from SQLite storage | `204 No Content` (or 404) |
| `POST` | `/api/cases/{case_id}/imaging/upload` | `imaging.py` | Upload multipart `.dcm` files bound to an existing case | `DicomUploadResponse` |
| `POST` | `/api/imaging/upload` | `imaging.py` | Standalone DICOM upload for ad-hoc inspection | `DicomUploadResponse` |
| `GET` | `/api/cases/{case_id}/imaging` | `imaging.py` | Retrieve parsed imaging metadata for a case | JSON dict (or 404) |

---

## 4. Database Schema & Storage Architecture

### 4.1 Storage Engine
- **Engine**: Python standard library `sqlite3`.
- **Database Location**: Configurable via `DATABASE_PATH` environment variable. Defaults to `/app/data/shoulder_twin.db` (Docker) or `data/shoulder_twin.db` (local workspace).
- **Driver**: Connection pooling handled per-request via context manager `self._get_connection()`.
- **Row Factory**: `sqlite3.Row` for fast dictionary-like column access.

### 4.2 Relational Schema (`cases` table)
```sql
CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    affected_side TEXT NOT NULL,
    demographics_json TEXT NOT NULL,
    imaging_json TEXT,
    segmentation_job_json TEXT,
    meshes_json TEXT,
    landmarks_json TEXT,
    measurements_json TEXT,
    implant_plan_json TEXT,
    reports_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_cases_subject_id ON cases(subject_id);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at);
```

### 4.3 Serialization Strategy
- Primitive query attributes (`id`, `name`, `status`, `subject_id`, `affected_side`, timestamps) are indexed for fast tabular queries and filtering.
- Complex hierarchical medical sub-objects (`demographics`, `imaging`, `segmentationJob`, `meshes`, `landmarks`, `measurements`, `implantPlan`, `reports`) are serialized to compact JSON strings using Pydantic models.
- Parameterized SQL queries (`?`) prevent SQL injection attacks.

---

## 5. Medical Imaging & Visualization Pipeline

### 5.1 DICOM Processing Pipeline (`backend/app/services/dicom_service.py`)
1. **Header Validation**: Verifies standard 128-byte preamble and the `b"DICM"` magic byte sequence. Handles headerless legacy PACS files via fallback to `force=True`.
2. **De-Identification**: Excludes Patient Name, Patient ID, Birth Date, Referring Physician, and Institution Name.
3. **Geometry Extraction**: Extracts Rows, Columns, Pixel Spacing (`[row_spacing, col_spacing]`), Slice Thickness, Image Position Patient, Image Orientation Patient, KVP, and Convolution Kernel.
4. **Hounsfield Unit Scaling**: Applies physical linear transformation:
   $$\text{HU} = \text{PixelValue} \times \text{RescaleSlope} + \text{RescaleIntercept}$$
5. **Windowing & Contrast Normalization**:
   $$\text{Normalized} = \text{clamp}\left(\frac{\text{HU} - (\text{WC} - \frac{\text{WW}}{2})}{\text{WW}}, 0.0, 1.0\right) \times 255$$
   - **Bone Window**: Window Width 1500 HU, Window Center 450 HU
   - **Soft Tissue Window**: Window Width 350 HU, Window Center 40 HU
6. **Base64 Slice Preview**: Encodes windowed slice as an 8-bit grayscale PNG data URL returned directly to the frontend.

### 5.2 3D WebGL Visualization Pipeline (`src/components/three/`)
1. **Canvas Setup**: High-performance WebGLRenderer with ACES Filmic Tone Mapping, PCF Soft Shadows, and 60 FPS animation loop.
2. **Procedural Anatomy**: Mathematical parametric meshes generated using Three.js curves:
   - Scapular body, spine, acromion, and glenoid fossa.
   - Proximal humeral head (sphere geometry), anatomical neck, and shaft diaphysis.
3. **STL Mesh Loader**: Ingests external `.stl` files via client-side `FileReader` into `ArrayBuffer`, converted via `STLLoader` into `THREE.BufferGeometry` with automated vertex normal re-computation and bounding box estimation.
4. **Camera Controls & Presets**: OrbitControls with preset orientations:
   - Anterior (AP view)
   - Posterior
   - Lateral (Y-view)
   - Axillary (Superior-Inferior)
   - Glenoid En-Face (perpendicular to glenoid articular face)
5. **Interactive Joint Distraction**: Allows real-time distraction of the humeral head from the glenoid fossa (0 to 60 mm) to inspect articular joint space.
