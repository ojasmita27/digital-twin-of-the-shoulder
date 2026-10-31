"""
Imaging Router for Digital Twin of the Shoulder.

Handles real DICOM (.dcm) file uploads, validation, metadata extraction,
and 3D reconstruction feasibility assessment.
"""

import hashlib
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Header, Request
from pydantic import BaseModel

from ..storage import case_store
from ..models.user import UserProfile, UserRole
from ..dependencies import get_current_user, require_role
from ..services.dicom_service import (
    parse_dicom_dataset,
    extract_safe_metadata,
    render_slice_preview_base64,
    analyze_dicom_series,
    DicomValidationError,
    load_volume_from_files,
    extract_patient_space_mesh_from_mask,
    render_plane_preview_base64,
)
from ..config import settings

router = APIRouter(prefix="/api", tags=["imaging"])


MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB per file limit


class SliceInfo(BaseModel):
    filename: str
    instanceNumber: int
    sliceLocation: Optional[float] = None
    physicalPositionMm: Optional[float] = None
    sliceThicknessMm: float
    pixelSpacingMm: List[float]
    rows: int
    columns: int
    hasPixelData: bool
    previewDataUrl: Optional[str] = None


class DicomUploadResponse(BaseModel):
    success: bool
    caseId: Optional[str] = None
    fileCount: int
    totalSizeBytes: int
    modality: str
    seriesInstanceUid: str
    studyInstanceUid: str
    sliceCount: int
    sliceThicknessMm: float
    sliceSpacingMm: Optional[float] = None
    zCoverageMm: Optional[float] = None
    volumeDimensionsMm: Optional[List[float]] = None
    duplicateCount: int = 0
    hasGaps: bool = False
    gapWarnings: List[str] = []
    pixelSpacingMm: List[float]
    rows: int
    columns: int
    windowCenter: float
    windowWidth: float
    reconstructionKernel: str
    acquisitionDate: str
    isVolumetricSeries: bool
    reconstructionReadiness: str
    reconstructionMessage: str
    slices: List[SliceInfo]
    primaryPreviewUrl: Optional[str] = None
    sourceFiles: List[str] = []
    processingStatus: str = "validated"


class SegmentationCorrection(BaseModel):
    sliceIndex: int
    operations: List[Dict[str, Any]]


def _owned_case_for_modify(case_id: str, authorization: Optional[str]):
    user = require_role([UserRole.DOCTOR, UserRole.ADMIN])(authorization)
    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Research case '{case_id}' was not found in storage.")
    if not case_store.user_can_modify_case(user, case):
        raise HTTPException(status_code=403, detail=f"Access denied for research case '{case_id}'.")
    return user, case


def _series_paths(case_id: str, case: Any) -> List[str]:
    series_dir = os.path.join(settings.DATA_DIR, "imaging", case_id)
    return [
        os.path.join(series_dir, os.path.basename(str(name)))
        for name in (case.imaging or {}).get("sourceFiles", [])
    ]


def _load_saved_mask(case_id: str, case: Any):
    import numpy as np

    job = case.segmentationJob or {}
    storage_name = os.path.basename(str(job.get("maskStorageName", "")))
    if not storage_name:
        raise DicomValidationError("No saved segmentation mask exists for this case.")
    path = os.path.join(settings.DATA_DIR, "imaging", case_id, storage_name)
    if not os.path.isfile(path):
        raise DicomValidationError("The saved segmentation mask is unavailable.")
    with np.load(path, allow_pickle=False) as data:
        return data["mask"].astype(np.uint8), path


async def process_uploaded_dicom_files(
    files: List[UploadFile],
    storage_dir: Optional[str] = None,
) -> DicomUploadResponse:
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided. Select at least one DICOM (.dcm) file.",
        )

    parsed_slices: List[Tuple[Dict[str, Any], Optional[str]]] = []
    total_size = 0
    source_contents: List[Tuple[str, bytes]] = []

    for file in files:
        filename = file.filename or "unknown.dcm"

        # Read content
        content = await file.read()
        source_contents.append((filename, content))
        file_size = len(content)
        total_size += file_size

        if file_size > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File '{filename}' exceeds maximum allowed size of 50 MB ({file_size / (1024*1024):.1f} MB).",
            )

        if file_size < 132:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{filename}' is too small to be a valid DICOM file ({file_size} bytes).",
            )

        try:
            ds = parse_dicom_dataset(content, filename=filename)
            meta = extract_safe_metadata(ds, filename=filename, file_size_bytes=file_size)
            preview_url = render_slice_preview_base64(ds)
            parsed_slices.append((meta, preview_url))
        except DicomValidationError as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(err),
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Unexpected error while parsing DICOM '{filename}': {str(exc)}",
            )

    try:
        analysis = analyze_dicom_series(parsed_slices)
    except DicomValidationError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )

    deduped_slices = analysis["sorted_slices"]
    primary_meta = deduped_slices[0][0]
    primary_preview = deduped_slices[0][1]

    slices_summary = [
        SliceInfo(
            filename=meta["filename"],
            instanceNumber=meta["instanceNumber"],
            sliceLocation=meta["sliceLocation"],
            physicalPositionMm=meta.get("physicalPositionMm"),
            sliceThicknessMm=meta["sliceThicknessMm"],
            pixelSpacingMm=meta["pixelSpacingMm"],
            rows=meta["rows"],
            columns=meta["columns"],
            hasPixelData=meta["hasPixelData"],
            previewDataUrl=preview,
        )
        for meta, preview in deduped_slices
    ]

    stored_files: List[str] = []
    if storage_dir:
        os.makedirs(storage_dir, exist_ok=True)
        for filename, content in source_contents:
            stored_name = f"{uuid.uuid4().hex}.dcm"
            with open(os.path.join(storage_dir, stored_name), "wb") as stored:
                stored.write(content)
            stored_files.append(stored_name)

    return DicomUploadResponse(
        success=True,
        fileCount=len(files),
        totalSizeBytes=total_size,
        modality=primary_meta["modality"],
        seriesInstanceUid=primary_meta["seriesInstanceUid"],
        studyInstanceUid=primary_meta["studyInstanceUid"],
        sliceCount=analysis["sliceCount"],
        sliceThicknessMm=primary_meta["sliceThicknessMm"],
        sliceSpacingMm=analysis["sliceSpacingMm"],
        zCoverageMm=analysis["zCoverageMm"],
        volumeDimensionsMm=analysis["volumeDimensionsMm"],
        duplicateCount=analysis["duplicateCount"],
        hasGaps=analysis["hasGaps"],
        gapWarnings=analysis["gapWarnings"],
        pixelSpacingMm=primary_meta["pixelSpacingMm"],
        rows=primary_meta["rows"],
        columns=primary_meta["columns"],
        windowCenter=primary_meta["windowCenter"],
        windowWidth=primary_meta["windowWidth"],
        reconstructionKernel=primary_meta["reconstructionKernel"],
        acquisitionDate=primary_meta["acquisitionDate"],
        isVolumetricSeries=analysis["isVolumetricSeries"],
        reconstructionReadiness=analysis["reconstructionReadiness"],
        reconstructionMessage=analysis["reconstructionMessage"],
        slices=slices_summary,
        primaryPreviewUrl=primary_preview,
        sourceFiles=stored_files,
    )


@router.post("/cases/{case_id}/imaging/upload", response_model=DicomUploadResponse)
@router.post("/cases/{case_id}/imaging/upload/", response_model=DicomUploadResponse, include_in_schema=False)
async def upload_case_dicom(
    case_id: str,
    files: List[UploadFile] = File(...),
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    """
    Upload real DICOM (.dcm) files for a specific research case.
    Requires Doctor (owner) or Admin privileges.
    Enforces case ownership isolation.
    """
    user = require_role([UserRole.DOCTOR, UserRole.ADMIN])(authorization)

    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Research case '{case_id}' was not found in storage.",
        )

    if not case_store.user_can_modify_case(user, case):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. You do not have permission to upload imaging to case '{case_id}'.",
        )

    series_dir = os.path.join(settings.DATA_DIR, "imaging", case_id)
    response = await process_uploaded_dicom_files(files, storage_dir=series_dir)
    response.caseId = case_id

    # Persist metadata to SQLite case record
    imaging_record = {
        "modality": response.modality,
        "seriesInstanceUid": response.seriesInstanceUid,
        "studyInstanceUid": response.studyInstanceUid,
        "sliceThicknessMm": response.sliceThicknessMm,
        "sliceSpacingMm": response.sliceSpacingMm,
        "zCoverageMm": response.zCoverageMm,
        "volumeDimensionsMm": response.volumeDimensionsMm,
        "pixelSpacingMm": response.pixelSpacingMm,
        "rows": response.rows,
        "columns": response.columns,
        "sliceCount": response.sliceCount,
        "duplicateCount": response.duplicateCount,
        "hasGaps": response.hasGaps,
        "gapWarnings": response.gapWarnings,
        "windowCenter": response.windowCenter,
        "windowWidth": response.windowWidth,
        "reconstructionKernel": response.reconstructionKernel,
        "acquisitionDate": response.acquisitionDate,
        "isVolumetricSeries": response.isVolumetricSeries,
        "reconstructionReadiness": response.reconstructionReadiness,
        "reconstructionMessage": response.reconstructionMessage,
        "primaryPreviewUrl": response.primaryPreviewUrl,
        "fileCount": response.fileCount,
        "uploadedFiles": [s.filename for s in response.slices[:50]],
        "sourceFiles": response.sourceFiles,
        "sourceStorage": os.path.relpath(series_dir, settings.DATA_DIR),
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
        "processingStatus": response.processingStatus,
    }

    case_store.update_case(
        case_id,
        {
            "imaging": imaging_record,
            "status": "imaging_imported",
        },
    )

    case_store.log_audit(
        action="DICOM_SERIES_UPLOADED",
        resource_type="imaging",
        resource_id=case_id,
        user_id=user.id,
        user_email=user.email,
        details={
            "seriesInstanceUid": response.seriesInstanceUid,
            "sliceCount": response.sliceCount,
            "modality": response.modality,
        },
        ip_address=request.client.host if request and request.client else None,
    )

    return response


@router.post("/cases/{case_id}/imaging/segmentation")
@router.post("/cases/{case_id}/segmentation/segment")
async def segment_case_ct(
    case_id: str,
    thresholdHu: float = 300.0,
    maxThresholdHu: Optional[float] = None,
    authorization: Optional[str] = Header(None),
):
    """Create a versioned mask from actual persisted CT HU values."""
    user, case = _owned_case_for_modify(case_id, authorization)
    if maxThresholdHu is not None and thresholdHu >= maxThresholdHu:
        raise HTTPException(status_code=422, detail="Minimum threshold must be lower than maximum threshold.")
    paths = _series_paths(case_id, case)
    series_dir = os.path.join(settings.DATA_DIR, "imaging", case_id)
    if len(paths) < 2:
        raise HTTPException(status_code=400, detail="At least two persisted DICOM slices are required for segmentation.")
    try:
        volume, analysis = load_volume_from_files(paths)
        mask = volume >= thresholdHu
        if maxThresholdHu is not None:
            mask &= volume <= maxThresholdHu
        if not bool(mask.any()):
            raise DicomValidationError(
                f"Segmentation is empty for threshold range {thresholdHu:.1f} to "
                f"{maxThresholdHu:.1f} HU." if maxThresholdHu is not None
                else f"Segmentation is empty at threshold {thresholdHu:.1f} HU."
            )
        segmentation_id = str(uuid.uuid4())
        mask_path = os.path.join(series_dir, f"{segmentation_id}.npz")
        import numpy as np
        np.savez_compressed(mask_path, mask=mask.astype(np.uint8), thresholdHu=thresholdHu)
        spacing = analysis["spacingMm"]
        volume_mm3 = float(mask.sum()) * float(spacing[0]) * float(spacing[1]) * float(spacing[2])
    except (DicomValidationError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Segmentation failed: {exc}") from exc
    now = datetime.now(timezone.utc).isoformat()
    job = {
        "jobId": segmentation_id,
        "status": "completed",
        "method": "threshold",
        "thresholdHu": thresholdHu,
        "maxThresholdHu": maxThresholdHu,
        "maskStorageName": os.path.basename(mask_path),
        "version": 1,
        "voxelCount": int(mask.sum()),
        "segmentationVolumeMm3": round(volume_mm3, 3),
        "inputDimensions": [int(value) for value in volume.shape],
        "voxelSpacingMm": [float(value) for value in spacing],
        "createdAt": now,
        "updatedAt": now,
        "completedAt": now,
        "reconstructionStatus": "outdated",
        "manualCorrections": [],
        "processingError": None,
        "limitations": "Prototype threshold segmentation; requires user inspection and correction before clinical use.",
    }
    case_store.update_case(case_id, {"segmentationJob": job, "status": "segmentation_completed"})
    return job


@router.get("/cases/{case_id}/imaging/segmentation")
async def get_case_segmentation(
    case_id: str,
    authorization: Optional[str] = Header(None),
):
    user = get_current_user(authorization)
    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Research case '{case_id}' was not found in storage.")
    if not case_store.user_can_access_case(user, case):
        raise HTTPException(status_code=403, detail=f"Access denied for research case '{case_id}'.")
    return case.segmentationJob or {}


@router.get("/cases/{case_id}/imaging/segmentation/preview")
async def get_segmentation_preview(
    case_id: str,
    orientation: str = "axial",
    sliceIndex: int = 0,
    windowCenter: Optional[float] = None,
    windowWidth: Optional[float] = None,
    authorization: Optional[str] = Header(None),
):
    user = get_current_user(authorization)
    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Research case '{case_id}' was not found in storage.")
    if not case_store.user_can_access_case(user, case):
        raise HTTPException(status_code=403, detail=f"Access denied for research case '{case_id}'.")
    try:
        volume, analysis = load_volume_from_files(_series_paths(case_id, case))
        mask = None
        if case.segmentationJob:
            mask, _ = _load_saved_mask(case_id, case)
        dimensions = {
            "axial": volume.shape[0],
            "coronal": volume.shape[1],
            "sagittal": volume.shape[2],
        }
        if orientation not in dimensions or sliceIndex < 0 or sliceIndex >= dimensions[orientation]:
            raise DicomValidationError("Requested preview slice is outside the stored volume.")
        preview = render_plane_preview_base64(
            volume,
            mask,
            orientation,
            sliceIndex,
            float(windowCenter if windowCenter is not None else (case.imaging or {}).get("windowCenter", 450)),
            float(windowWidth if windowWidth is not None else (case.imaging or {}).get("windowWidth", 1500)),
        )
        return {
            **preview,
            "orientation": orientation,
            "sliceIndex": sliceIndex,
            "dimensions": list(volume.shape),
            "spacingMm": analysis["spacingMm"],
            "segmentationVersion": (case.segmentationJob or {}).get("version"),
        }
    except (DicomValidationError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Preview failed: {exc}") from exc


@router.post("/cases/{case_id}/imaging/segmentation/corrections")
async def correct_case_segmentation(
    case_id: str,
    correction: SegmentationCorrection,
    authorization: Optional[str] = Header(None),
):
    """Persist slice-local voxel edits without changing source DICOM files."""
    user, case = _owned_case_for_modify(case_id, authorization)
    try:
        import numpy as np
        mask, mask_path = _load_saved_mask(case_id, case)
        if correction.sliceIndex < 0 or correction.sliceIndex >= mask.shape[0]:
            raise DicomValidationError("Correction slice is outside the stored axial volume.")
        for operation in correction.operations:
            x = int(operation.get("x", -1))
            y = int(operation.get("y", -1))
            radius = int(operation.get("radius", 1))
            value = 1 if bool(operation.get("add", True)) else 0
            if radius < 1 or radius > 128:
                raise DicomValidationError("Brush radius must be between 1 and 128 voxels.")
            if x < 0 or y < 0 or x >= mask.shape[2] or y >= mask.shape[1]:
                raise DicomValidationError("Correction coordinate is outside the stored slice.")
            yy, xx = np.ogrid[:mask.shape[1], :mask.shape[2]]
            brush = (xx - x) ** 2 + (yy - y) ** 2 <= radius ** 2
            mask[correction.sliceIndex, brush] = value
        np.savez_compressed(mask_path, mask=mask.astype(np.uint8))
        job = dict(case.segmentationJob or {})
        spacing = job.get("voxelSpacingMm", (case.imaging or {}).get("pixelSpacingMm", [1, 1]) + [(case.imaging or {}).get("sliceSpacingMm", 1)])
        job.update({
            "version": int(job.get("version", 1)) + 1,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "voxelCount": int(mask.sum()),
            "segmentationVolumeMm3": round(float(mask.sum()) * float(spacing[0]) * float(spacing[1]) * float(spacing[2]), 3),
            "manualCorrections": [*(job.get("manualCorrections") or []), correction.model_dump()],
            "reconstructionStatus": "outdated",
        })
        case_store.update_case(case_id, {"segmentationJob": job, "status": "segmentation_completed"})
        return job
    except (DicomValidationError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Segmentation correction failed: {exc}") from exc


@router.post("/cases/{case_id}/imaging/reconstruct")
@router.post("/cases/{case_id}/reconstruction")
async def reconstruct_case_ct(
    case_id: str,
    thresholdHu: float = 300.0,
    authorization: Optional[str] = Header(None),
):
    """Extract and persist a patient-specific STL from the saved segmentation mask."""
    user, case = _owned_case_for_modify(case_id, authorization)
    paths = _series_paths(case_id, case)
    if len(paths) < 2:
        raise HTTPException(status_code=400, detail="A single DICOM slice cannot be reconstructed as a 3D volume.")
    if not case.segmentationJob:
        raise HTTPException(status_code=400, detail="Run and save segmentation before reconstruction.")
    try:
        mask, _ = _load_saved_mask(case_id, case)
        _, analysis = load_volume_from_files(paths)
        mesh_bytes, stats = extract_patient_space_mesh_from_mask(
            mask,
            analysis,
            (case.segmentationJob or {}).get("thresholdHu"),
        )
    except (DicomValidationError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Reconstruction failed: {exc}") from exc

    model_id = str(uuid.uuid4())
    stored_name = f"{model_id}.stl"
    model_dir = os.path.join(settings.DATA_DIR, "models", case_id)
    os.makedirs(model_dir, exist_ok=True)
    with open(os.path.join(model_dir, stored_name), "wb") as model_file:
        model_file.write(mesh_bytes)
    model = {
        "id": model_id,
        "version": 1,
        "caseId": case_id,
        "filename": f"ct-reconstruction-{model_id[:8]}.stl",
        "format": "stl",
        "structure": "combined",
        "fileSizeBytes": len(mesh_bytes),
        "sha256": hashlib.sha256(mesh_bytes).hexdigest(),
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
        "storageName": stored_name,
        "unit": "mm",
        "unitVerified": True,
        "provenance": "Patient CT threshold segmentation and marching-cubes surface extraction",
        "isDemoMesh": False,
        "qualityChecks": {
            "watertightCheck": "not_computed",
            "physicalCoordinates": True,
            "thresholdHu": thresholdHu,
            "limitations": "Research prototype; inspect segmentation and mesh before use.",
        },
        **stats,
    }
    case_store.update_case(case_id, {
        "meshes": [*case.meshes, model],
        "status": "models_generated",
        "segmentationJob": {
            **(case.segmentationJob or {}),
            "status": "completed",
            "thresholdHu": thresholdHu,
            "reconstructionStatus": "completed",
            "reconstructionAt": datetime.now(timezone.utc).isoformat(),
            "meshId": model_id,
            "qualityAssessment": model["qualityChecks"],
        },
    })
    return {"status": "completed", "mesh": model}


@router.post("/imaging/upload", response_model=DicomUploadResponse)
@router.post("/imaging/upload/", response_model=DicomUploadResponse, include_in_schema=False)
async def upload_standalone_dicom(
    files: List[UploadFile] = File(...),
    authorization: Optional[str] = Header(None),
):
    """
    Upload and parse DICOM (.dcm) files without binding to a case.
    Requires authentication (Doctor, Researcher, or Admin).
    """
    get_current_user(authorization)
    return await process_uploaded_dicom_files(files)


@router.get("/cases/{case_id}/imaging")
@router.get("/cases/{case_id}/imaging/", include_in_schema=False)
def get_case_imaging(
    case_id: str,
    authorization: Optional[str] = Header(None),
):
    """Retrieve ingested imaging metadata for a specific research case."""
    user = get_current_user(authorization)
    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Research case '{case_id}' was not found in storage.",
        )

    if not case_store.user_can_access_case(user, case):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. You do not have permission to view imaging for case '{case_id}'.",
        )

    return case.imaging or {}
