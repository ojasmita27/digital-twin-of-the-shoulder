# Digital Twin of the Shoulder — Phase 1 Backend

## CT reconstruction prototype

Case-bound DICOM uploads retain the original slice files under the configured data directory. A validated multi-slice CT series can be processed with:

- `POST /api/cases/{case_id}/imaging/segmentation?thresholdHu=300`
- `GET /api/cases/{case_id}/imaging/segmentation/preview?orientation=axial&sliceIndex=0`
- `POST /api/cases/{case_id}/imaging/segmentation/corrections`
- `POST /api/cases/{case_id}/imaging/reconstruct?thresholdHu=300`

The current segmentation is an explicit Hounsfield-unit threshold prototype, followed by optional slice-local brush corrections and `scikit-image` marching-cubes surface extraction in DICOM patient LPS coordinates. It is not a pretrained anatomical model, does not produce separate labels, and must be inspected/corrected before research use. A single slice, inconsistent geometry, empty mask, invalid correction, or failed extraction returns an explicit error. Original DICOM files are never modified; masks are versioned losslessly as compressed NumPy arrays and corrected masks mark prior meshes outdated.

FastAPI backend service for patient-specific shoulder anatomy reconstruction and preoperative planning.

### Production deployment

The production container sets `ENVIRONMENT=production` and
`ALLOW_DEV_SEEDING=false`; do not override these values. Startup fails
closed if production is configured to seed development accounts. Mount a
persistent volume at `DATA_DIR` and set `DATABASE_PATH` inside that volume
so SQLite, uploaded DICOM files, segmentation masks, and reconstructed
models survive container restarts. These files must remain private and
must not be served as public static assets.

> **PERSISTENCE STATUS (Phase 1C Completed)**:
> This service uses a local SQLite-backed repository (`data/shoulder_twin.db`).
> All ResearchCase metadata (demographics, status, timestamps, imaging metadata, segmentation job state, meshes, landmarks, morphometrics, implant plans, and reports) **persist across server restarts**.

---

## 1. Setup & Installation

### Requirements
- Python 3.10+
- `pip` or standard virtual environment

### Installation
```bash
# Optional: create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Phase 1 dependencies
pip install -r backend/requirements.txt
```

---

## 2. Configuration & Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8001` | HTTP listening port for uvicorn |
| `HOST` | `0.0.0.0` | Bind host |
| `DATA_DIR` | `./data` | Local directory for database files |
| `DATABASE_PATH` | `./data/shoulder_twin.db` | Absolute or relative path to SQLite database |
| `ENVIRONMENT` | `development` | Deployment environment name |

---

## 3. Running the Server

Start the FastAPI application with `uvicorn`:

```bash
# Run server on port 8001
uvicorn backend.app.main:app --host 0.0.0.0 --port 8001 --reload
```

Interactive OpenAPI Swagger UI is available at:
`http://localhost:8001/docs`

Interactive ReDoc documentation is available at:
`http://localhost:8001/redoc`

---

## 4. Endpoints Implemented in Phase 1

### System & Health
- `GET /` — Service metadata, storage type (`sqlite3`), database path, and root directory.
- `GET /api/health` — Truthful health status. Reports actual CUDA/GPU availability, PyTorch, MONAI, and SimpleITK versions (returns `null`/`false` if not installed, never fabricated).

### Case Management
- `GET /api/cases` — List all de-identified research cases persisted in SQLite (ordered by creation date).
- `POST /api/cases` — Register a new de-identified case. Returns a generated identifier (`SHL-2026-XXXXXX`) and initial status `created`.
- `GET /api/cases/{case_id}` — Retrieve full case record by ID (or `404 Not Found`).
- `PATCH /api/cases/{case_id}` — Update case record fields (status, meshes, landmarks, measurements, etc.).
- `DELETE /api/cases/{case_id}` — Remove case record from SQLite database.

---

## 5. Running Backend Tests

Run the complete test suite with `pytest`:

```bash
PYTHONPATH=. pytest -v backend/tests
```

All 9 test cases test:
1. Root endpoint availability and metadata (`test_root`)
2. Truthful health status reporting (`test_health_endpoint`)
3. Empty case listing (`test_list_cases_empty`)
4. Case creation with de-identified demographics (`test_create_and_get_case`)
5. Proper 404 responses for missing cases (`test_get_case_not_found`)
6. Case deletion lifecycle (`test_delete_case`)
7. **Persistence across store/server reinitialization** (`test_persistence_across_reinitialization`)
8. **Nested field serialization and updates** for meshes/landmarks/measurements (`test_nested_field_serialization_and_updates`)
9. **Invalid input validation (422)** (`test_invalid_input_handling`)

---

## 6. Storage Behavior & Current Limitations

1. **SQLite Database**: Stored at `data/shoulder_twin.db`. Automatically created with table indices on startup. Data survives server reboots and application crashes.
2. **Medical Research Prototype**: Research tool only. Not approved for direct clinical or surgical diagnostic use without institutional IRB review.
3. **Hardware Acceleration**: GPU detection dynamically queries PyTorch CUDA if present; defaults to CPU/unaccelerated report if unavailable.
