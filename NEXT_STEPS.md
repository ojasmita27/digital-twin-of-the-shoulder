# Next Steps & Milestone Roadmap

**Target**: Bridge the gap between the UI prototype and a genuine medical imaging research workstation.

---

## Recommended Milestone Order

```
[Phase 1] Core Engineering & Persistence ──▶ COMPLETED (Verified)
      │
      ▼
[Phase 2] Genuine DICOM Upload & Tag Extraction (RECOMMENDED NEXT STEP)
      │
      ▼
[Phase 3] CT Volume Slicing & Real Pixel Rendering
      │
      ▼
[Phase 4] Surface Extraction (Marching Cubes / VTK Meshing)
      │
      ▼
[Phase 5] Anatomical Landmark Computation & Provenance Reporting
      │
      ▼
[Phase 6] Implant Planning Mechanics & Biomechanical Validation
```

---

## Detailed Milestone Breakdown

### Milestone 1 (Immediate Next Step): Genuine DICOM Upload & Header Parsing
- **Goal**: Allow researchers to upload authentic single-slice or multi-file DICOM series (`.dcm`) to a registered case.
- **Backend**:
  - Install `pydicom` in `backend/requirements.txt`.
  - Add router `backend/app/routers/imaging.py` with endpoint `POST /api/cases/{case_id}/imaging/upload`.
  - Parse crucial tags: `PatientID` (verify de-identification), `Modality` (must be `CT`), `SliceThickness`, `PixelSpacing`, `Rows`, `Columns`, `RescaleIntercept`, `RescaleSlope`, `WindowCenter`, `WindowWidth`.
  - Store parsed metadata in SQLite and persist `.dcm` files under `data/cases/{case_id}/dicom/`.
- **Frontend**:
  - Update `ImagingView.tsx` to send a multipart `FormData` request to `POST /api/cases/{case_id}/imaging/upload`.
  - Display parsed headers (spacing, slice count, kVp, kernel) directly from the server response instead of hardcoded numbers.

### Milestone 2: Multi-Planar Slice Serving & Real Pixel Display
- **Goal**: Replace the procedural canvas simulator with real CT pixel data.
- **Backend**:
  - Implement `GET /api/cases/{case_id}/imaging/slices/{slice_index}?orientation=axial` (or coronal/sagittal).
  - Apply Hounsfield Unit scaling: `HU = pixel_value * RescaleSlope + RescaleIntercept`.
  - Return 8-bit PNG or raw grayscale array.
- **Frontend**:
  - Render real CT slices on the `<canvas>` viewport with interactive window/level adjustments.

### Milestone 3: 3D Surface Reconstruction (Voxel to Mesh)
- **Goal**: Extract real patient scapular and humeral meshes from CT volumes.
- **Backend**:
  - Implement bone thresholding (e.g. HU > 200) and Marching Cubes algorithm (via `scikit-image` or `PyVista`/`vtk`).
  - Export resulting surfaces as `.stl` or `.obj` artifacts.
- **Frontend**:
  - Load the generated patient STL directly into the Three.js viewport.
