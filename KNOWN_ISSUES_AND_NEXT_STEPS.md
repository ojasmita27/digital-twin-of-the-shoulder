# Known Technical Blockers, Diagnostics & Actionable Next Steps
# Digital Twin of the Shoulder (DTS)

**Document Version**: 2.0  
**Audit Date**: October 2026  
**Status**: Active Diagnostic & Remediation Roadmap  

---

## 1. Critical Known Issues & Root-Cause Diagnosis

### Issue 1: DICOM Processing Error ("HTTP 404 Not Found") on Render Backend
- **Symptom**: In the CT Imaging view, selecting or uploading `VHFCT1mm-Shoulder (1) (1).dcm` outputs:
  `DICOM Processing Error: HTTP 404 Not Found on /api/cases/{case_id}/imaging/upload`.
- **Root Cause**:
  1. Inspecting the live Render backend via `curl -s "https://digital-twin-of-the-shoulder.onrender.com/openapi.json"` reveals that Render only exposes `/api/health` and `/api/cases`.
  2. The new imaging router (`backend/app/routers/imaging.py`) and medical dependencies (`pydicom`, `numpy`, `pillow`) exist and have been tested in the local workspace, but have **not yet been pushed to GitHub (`ojasmita27/digital-twin-of-the-shoulder`)**.
  3. Because Render auto-deploys from GitHub, it is currently running an older commit that lacks the new `/api/imaging/upload` and `/api/cases/{case_id}/imaging/upload` endpoints.
- **Remediation**:
  Commit all workspace changes and push to GitHub:
  ```bash
  git add backend/ requirements.txt src/
  git commit -m "feat: Add DICOM parsing service, imaging router, and preview endpoints"
  git push origin main
  ```
  Once Render completes the new build, the endpoints will return HTTP 200.

---

### Issue 2: Render Free-Tier Ephemeral Disk Reset
- **Symptom**: Research cases created on the Render backend disappear after a few hours of inactivity.
- **Root Cause**: Render's free tier spins instances down to zero after 15 minutes of idle time. The SQLite database at `/app/data/shoulder_twin.db` resides on an ephemeral container filesystem, which is wiped when the container spins down.
- **Remediation**:
  - For local development / presentations: Run the backend locally (`uvicorn backend.app.main:app --port 8001`) where `data/shoulder_twin.db` is permanent.
  - For production: Attach a Render Persistent Disk (under Render Dashboard -> Disks) mounted at `/app/data`, or migrate to Cloud SQL / PostgreSQL in Phase 2.

---

### Issue 3: Pydantic v1 vs v2 Compatibility in Mixed Python Environments [RESOLVED]
- **Symptom**: When running tests in Debian/Ubuntu Linux environments with system-installed `python3-pydantic` (v1.8.2), `create_case` previously threw:
  `AttributeError: 'PatientDemographics' object has no attribute 'model_dump'`.
- **Root Cause**: Pydantic v2 renamed `.dict()` to `.model_dump()`. In standard virtual environments with `pydantic>=2.0.0`, `.model_dump()` works properly, but system packages may supply Pydantic 1.x.
- **Resolution**: Implemented resilient `_dump_model` helper in `backend/app/storage/sqlite.py` that dynamically checks for `model_dump()`, falling back to `.dict()` or `dict()`. All 21 backend unit and integration tests now pass cleanly across both Pydantic v1 and v2 environments.

---

### Issue 4: Single 2D Slice vs. Volumetric 3D Surface Reconstruction
- **Symptom**: Selecting a single DICOM slice (such as `VHFCT1mm-Shoulder (1) (1).dcm`) displays the 2D CT slice, but cannot reconstruct a 3D bone volume.
- **Root Cause**: A single DICOM file represents only one 2D axial slice (512 × 512 pixels, 1.0 mm thickness). Marching Cubes and volumetric surface meshing physically require an entire contiguous 3D voxel array (typically 120–250 slices spanning from the acromion to the mid-humeral diaphysis).
- **Remediation**:
  - The UI now features a **3D Reconstruction Feasibility Card** that honestly explains this to users and evaluators.
  - If users wish to test 3D patient geometry immediately, they can use the **Import STL** button in the 3D Anatomy viewport to load pre-segmented polygonal models.

---

### Issue 5: Simulated AI Segmentation & Morphometrics
- **Symptom**: The AI segmentation console shows progress timers and static Dice scores rather than executing real neural network inference.
- **Root Cause**: Deep learning models (e.g., TotalSegmentator, nnU-Net) require hundreds of megabytes of model weights and dedicated GPU memory, which is outside the scope of Phase 1.
- **Remediation**: Clearly document this as a preclinical prototype with typed API contracts ready for Phase 2 model integration.

---

## 2. Actionable Next Steps & Development Roadmap

### Immediate Priority (Next 24 Hours)
1. **Push Workspace to GitHub**:
   Push the updated backend code, `requirements.txt`, and tests to `ojasmita27/digital-twin-of-the-shoulder`.
2. **Verify Render Deployment**:
   Run `curl -s "https://digital-twin-of-the-shoulder.onrender.com/openapi.json" | grep imaging` to verify that the imaging routes are live.
3. **Capture Presentation Screenshots**:
   Follow the screenshot checklist in Section 14 of the Progress Report for college mini-project documentation.

### Phase 2: Algorithmic Expansion (Next Milestone)
1. **Volumetric DICOM Zip Upload**:
   Allow users to upload an entire CT series packaged in a `.zip` file, sorting slices by `ImagePositionPatient[2]` (Slice Location).
2. **Backend Marching Cubes Engine**:
   Use `scikit-image` (`marching_cubes`) on the 3D voxel array to extract `.stl` meshes directly on the backend.
3. **Automated Landmark Detection**:
   Implement automated 3D landmark extraction (Glenoid Center, Superior/Inferior Glenoid Rim, Trillat line) to compute Friedman glenoid version and inclination dynamically.
4. **Implant Impingement Simulation**:
   Add Three.js bounding sphere collision detection between the humerus and scapular neck during virtual abduction and adduction.
