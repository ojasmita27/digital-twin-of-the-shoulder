# Implementation Status & Feature Audit

**Audit Date**: October 2026  
**Audit Method**: Direct code inspection and runtime execution testing  

---

## 1. Verified Completed Features (Tested & Working)

| Feature | Component | Verification Evidence |
| :--- | :--- | :--- |
| **Truthful Health Probing** | `GET /api/health` | Verified via pytest and curl. Returns accurate GPU availability (`false`), torch (`null`), and active jobs count (`0`). |
| **Case Metadata CRUD** | `POST /api/cases`<br>`GET /api/cases`<br>`GET /api/cases/{id}`<br>`PATCH /api/cases/{id}`<br>`DELETE /api/cases/{id}` | Verified via automated integration tests and live HTTP calls. Non-identifying IDs generated (`SHL-2026-XXXXXX`). Proper 404 and 422 error codes returned. |
| **SQLite Persistence Across Restarts** | `backend/app/storage/sqlite.py` | Verified via live two-process restart test. Case created in Process 1 was retained and fetched from Process 2 at `data/shoulder_twin.db`. |
| **Frontend/Backend Proxy Routing** | `vite.config.ts` (`server.proxy`)<br>`src/services/apiClient.ts` | Tested via `curl http://127.0.0.1:3000/api/health` returning `200 OK` from uvicorn. Eliminates browser Mixed Content blocks in HTTPS hosted preview. |
| **3D Mesh Rendering & Orbiting** | `src/components/three/ShoulderScene.tsx` | Procedural parametric scapula, humerus, and glenoid face rendered in WebGL using Three.js with camera presets (Anterior, Glenoid En Face, etc.) and lighting controls. |
| **Client-Side STL Import** | `src/components/three/STLLoaderUtil.ts` | Allows users to drag-and-drop or select local binary/ASCII `.stl` surface mesh files for instant client-side WebGL inspection. |
| **2D Attenuation Field Simulation** | `src/components/imaging/CTViewer.tsx` | Interactive 2D slice viewing with Axial/Coronal/Sagittal reorientation, crosshairs, and Hounsfield Unit (HU) Window/Level presets (Bone, Soft Tissue, Lung). |
| **Automated Backend Test Suite** | `backend/tests/test_api.py` | 9 passing tests running on temporary isolated SQLite instances. |

---

## 2. Incomplete / Simulated Features (Audited Code Discrepancies)

| Feature | Current State | Missing Implementation |
| :--- | :--- | :--- |
| **DICOM File Ingestion** | **Mocked in UI**: `ImagingView.tsx` creates hardcoded dummy metadata in JavaScript when a file is selected (`handleLocalDicomUpload`). | No backend endpoint exists for uploading `.dcm` files. `pydicom` is not yet installed in `requirements.txt`. Real tags (Slice Thickness, Spacing, Rescale Slope/Intercept) are not parsed from binary files. |
| **Real CT Pixel Rendering** | **Simulated**: `dicomSimulator.ts` mathematically generates synthetic anatomical shapes on a `<canvas>` element. | Real slice pixel arrays (`pixel_array`) are not extracted from uploaded DICOM volumes or displayed. |
| **3D Reconstruction from CT** | **Parametric Procedural**: `ProceduralAnatomy.ts` generates geometric approximations using Three.js math curves. | Marching Cubes surface extraction from voxel volumes is not implemented. |
| **AI Anatomical Segmentation** | **Client Simulation**: `SegmentationView.tsx` simulates progress logs with `setTimeout` timers. | No inference worker, MONAI pipeline, or nnU-Net model exists in the backend. |
| **Clinical Morphometrics** | **Preset Constants**: Glenoid version, inclination, and subluxation are hardcoded sample numbers on the demo case. | No algorithmic landmark detection or automated anatomical plane computation from patient meshes. |
| **Implant Preoperative Planning** | **Static 3D Gizmo Placement**: Three.js renders virtual baseplate and glenosphere components against the procedural model. | No collision detection, bone impingement analysis, or screw purchase depth calculation. |
