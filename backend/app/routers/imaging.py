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
    separate_shoulder_bones,
    derive_glenoid_region,
)
from ..config import settings

router = APIRouter(prefix="/api", tags=["imaging"])


MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB per file limit
SUPPORTED_SEGMENTATION_MODELS = {"threshold-hu"}
SUPPORTED_STRUCTURES = {"scapula", "humerus", "glenoid", "clavicle"}


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
    structure: Optional[str] = None



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
    model: str = "threshold-hu",
    structures: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    """Create a versioned mask from actual persisted CT HU values."""
    user, case = _owned_case_for_modify(case_id, authorization)
    if model not in SUPPORTED_SEGMENTATION_MODELS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported segmentation model '{model}'. Available models: threshold-hu.",
        )
    selected_structures = [value.strip() for value in (structures or "scapula,humerus").split(",") if value.strip()]
    unsupported_structures = sorted(set(selected_structures) - SUPPORTED_STRUCTURES)
    if unsupported_structures:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported anatomical structures: {', '.join(unsupported_structures)}.",
        )
    if "glenoid" in selected_structures and not {"scapula", "humerus"}.issubset(selected_structures):
        raise HTTPException(
            status_code=422,
            detail="Glenoid region derivation requires both scapula and humerus targets.",
        )
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
        structure_masks, separation_method, separation_meta = separate_shoulder_bones(mask, analysis, selected_structures)
        glenoid_meta = {
            "status": "not_requested",
            "confidence": None,
            "notes": None,
        }
        if "glenoid" in selected_structures:
            glenoid_mask, glenoid_meta = derive_glenoid_region(
                structure_masks.get("scapula"),
                structure_masks.get("humerus"),
                analysis,
            )
            if glenoid_mask is not None:
                structure_masks["glenoid"] = glenoid_mask
        segmentation_id = str(uuid.uuid4())
        mask_path = os.path.join(series_dir, f"{segmentation_id}.npz")
        import numpy as np
        save_payload: Dict[str, Any] = {
            "mask": mask.astype(np.uint8),
            "auto_mask": mask.astype(np.uint8),
            "thresholdHu": thresholdHu,
        }
        if "scapula" in structure_masks:
            save_payload["scapula_mask"] = structure_masks["scapula"].astype(np.uint8)
            save_payload["auto_scapula_mask"] = structure_masks["scapula"].astype(np.uint8)
        if "humerus" in structure_masks:
            save_payload["humerus_mask"] = structure_masks["humerus"].astype(np.uint8)
            save_payload["auto_humerus_mask"] = structure_masks["humerus"].astype(np.uint8)
        if "glenoid" in structure_masks:
            save_payload["glenoid_mask"] = structure_masks["glenoid"].astype(np.uint8)
            save_payload["auto_glenoid_mask"] = structure_masks["glenoid"].astype(np.uint8)
        np.savez_compressed(mask_path, **save_payload)

        spacing = analysis["spacingMm"]
        voxel_vol = float(spacing[0]) * float(spacing[1]) * float(spacing[2])
        volume_mm3 = float(mask.sum()) * voxel_vol
        scap_voxels = int(structure_masks["scapula"].sum()) if "scapula" in structure_masks else 0
        hum_voxels = int(structure_masks["humerus"].sum()) if "humerus" in structure_masks else 0
        glenoid_voxels = int(structure_masks["glenoid"].sum()) if "glenoid" in structure_masks else 0
    except (DicomValidationError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Segmentation failed: {exc}") from exc
    now = datetime.now(timezone.utc).isoformat()
    job = {
        "jobId": segmentation_id,
        "status": "completed",
        "method": "threshold_separated" if len(structure_masks) >= 2 else "threshold",
        "separationMethod": separation_method,
        "separationStatus": separation_meta.get("separationStatus", "verified"),
        "separationConfidence": separation_meta.get("separationConfidence"),
        "separationNotes": separation_meta.get("separationNotes"),
        "overlapVoxelCount": separation_meta.get("overlapVoxelCount", 0),
        "isManuallyCorrected": False,
        "model": model,
        "structures": selected_structures,
        "thresholdHu": thresholdHu,
        "maxThresholdHu": maxThresholdHu,
        "maskStorageName": os.path.basename(mask_path),
        "version": 1,
        "voxelCount": int(mask.sum()),
        "scapulaVoxelCount": scap_voxels,
        "humerusVoxelCount": hum_voxels,
        "glenoidVoxelCount": glenoid_voxels,
        "segmentationVolumeMm3": round(volume_mm3, 3),
        "scapulaVolumeMm3": round(scap_voxels * voxel_vol, 3),
        "humerusVolumeMm3": round(hum_voxels * voxel_vol, 3),
        "glenoidVolumeMm3": round(glenoid_voxels * voxel_vol, 3),
        "glenoidStatus": glenoid_meta["status"],
        "glenoidConfidence": glenoid_meta["confidence"],
        "glenoidNotes": glenoid_meta["notes"],
        "inputDimensions": [int(value) for value in volume.shape],
        "voxelSpacingMm": [float(value) for value in spacing],
        "createdAt": now,
        "updatedAt": now,
        "completedAt": now,
        "reconstructionStatus": "outdated",
        "manualCorrections": [],
        "processingError": None,
        "limitations": "Prototype threshold and watershed/connected-component segmentation; requires user inspection and correction before clinical use.",
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
    structure: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    user = get_current_user(authorization)
    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Research case '{case_id}' was not found in storage.")
    if not case_store.user_can_access_case(user, case):
        raise HTTPException(status_code=403, detail=f"Access denied for research case '{case_id}'.")
    try:
        import numpy as np
        volume, analysis = load_volume_from_files(_series_paths(case_id, case))
        mask = None
        if case.segmentationJob:
            combined_mask, mask_path = _load_saved_mask(case_id, case)
            if structure in ("scapula", "humerus", "glenoid"):
                with np.load(mask_path) as archive:
                    key = f"{structure}_mask"
                    mask = archive[key].astype(bool) if key in archive else combined_mask
            else:
                mask = combined_mask
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
        mask = mask.astype(bool)
        scapula_mask = None
        humerus_mask = None
        preserved_auto: Dict[str, Any] = {}
        with np.load(mask_path) as archive:
            if "scapula_mask" in archive:
                scapula_mask = archive["scapula_mask"].astype(bool)
            if "humerus_mask" in archive:
                humerus_mask = archive["humerus_mask"].astype(bool)
            glenoid_mask = archive["glenoid_mask"].astype(bool) if "glenoid_mask" in archive else None
            for auto_key in ("auto_mask", "auto_scapula_mask", "auto_humerus_mask", "auto_glenoid_mask"):
                if auto_key in archive:
                    preserved_auto[auto_key] = archive[auto_key]

        target_mask = mask
        if correction.structure == "scapula" and scapula_mask is not None:
            target_mask = scapula_mask
        elif correction.structure == "humerus" and humerus_mask is not None:
            target_mask = humerus_mask
        elif correction.structure == "glenoid" and glenoid_mask is not None:
            target_mask = glenoid_mask

        if correction.sliceIndex < 0 or correction.sliceIndex >= target_mask.shape[0]:
            raise DicomValidationError("Correction slice is outside the stored axial volume.")
        for operation in correction.operations:
            x = int(operation.get("x", -1))
            y = int(operation.get("y", -1))
            radius = int(operation.get("radius", 1))
            value = 1 if bool(operation.get("add", True)) else 0
            if radius < 1 or radius > 128:
                raise DicomValidationError("Brush radius must be between 1 and 128 voxels.")
            if x < 0 or y < 0 or x >= target_mask.shape[2] or y >= target_mask.shape[1]:
                raise DicomValidationError("Correction coordinate is outside the stored slice.")
            yy, xx = np.ogrid[:target_mask.shape[1], :target_mask.shape[2]]
            brush = (xx - x) ** 2 + (yy - y) ** 2 <= radius ** 2
            target_mask[correction.sliceIndex, brush] = bool(value)

        if correction.structure == "scapula" and scapula_mask is not None:
            scapula_mask = target_mask
            mask = scapula_mask | (humerus_mask if humerus_mask is not None else False)
        elif correction.structure == "humerus" and humerus_mask is not None:
            humerus_mask = target_mask
            mask = humerus_mask | (scapula_mask if scapula_mask is not None else False)
        elif correction.structure == "glenoid" and glenoid_mask is not None:
            glenoid_mask = target_mask
            mask = (scapula_mask if scapula_mask is not None else False) | (humerus_mask if humerus_mask is not None else False)
        else:
            mask = target_mask
            if scapula_mask is not None:
                scapula_mask &= mask
            if humerus_mask is not None:
                humerus_mask &= mask

        save_payload: Dict[str, Any] = {"mask": mask.astype(np.uint8), **preserved_auto}
        if scapula_mask is not None:
            save_payload["scapula_mask"] = scapula_mask.astype(np.uint8)
        if humerus_mask is not None:
            save_payload["humerus_mask"] = humerus_mask.astype(np.uint8)
        if glenoid_mask is not None:
            save_payload["glenoid_mask"] = glenoid_mask.astype(np.uint8)
        np.savez_compressed(mask_path, **save_payload)

        job = dict(case.segmentationJob or {})
        spacing = job.get("voxelSpacingMm", (case.imaging or {}).get("pixelSpacingMm", [1, 1]) + [(case.imaging or {}).get("sliceSpacingMm", 1)])
        voxel_vol = float(spacing[0]) * float(spacing[1]) * float(spacing[2])
        scap_voxels = int(scapula_mask.sum()) if scapula_mask is not None else int(job.get("scapulaVoxelCount", 0))
        hum_voxels = int(humerus_mask.sum()) if humerus_mask is not None else int(job.get("humerusVoxelCount", 0))
        glenoid_voxels = int(glenoid_mask.sum()) if glenoid_mask is not None else int(job.get("glenoidVoxelCount", 0))
        overlap_voxels = int((scapula_mask & humerus_mask).sum()) if (scapula_mask is not None and humerus_mask is not None) else 0
        job["overlapVoxelCount"] = overlap_voxels
        job.update({
            "version": int(job.get("version", 1)) + 1,
            "method": "manual_corrected",
            "isManuallyCorrected": True,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "voxelCount": int(mask.sum()),
            "scapulaVoxelCount": scap_voxels,
            "humerusVoxelCount": hum_voxels,
            "glenoidVoxelCount": glenoid_voxels,
            "segmentationVolumeMm3": round(float(mask.sum()) * voxel_vol, 3),
            "scapulaVolumeMm3": round(scap_voxels * voxel_vol, 3),
            "humerusVolumeMm3": round(hum_voxels * voxel_vol, 3),
            "glenoidVolumeMm3": round(glenoid_voxels * voxel_vol, 3),
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
    """Extract and persist patient-specific STL meshes from the saved segmentation mask."""
    user, case = _owned_case_for_modify(case_id, authorization)
    paths = _series_paths(case_id, case)
    if len(paths) < 2:
        raise HTTPException(status_code=400, detail="A single DICOM slice cannot be reconstructed as a 3D volume.")
    if not case.segmentationJob:
        raise HTTPException(status_code=400, detail="Run and save segmentation before reconstruction.")
    try:
        import numpy as np
        mask, mask_path = _load_saved_mask(case_id, case)
        if not bool(mask.any()):
            raise DicomValidationError("Cannot reconstruct 3D mesh from an empty segmentation mask.")
        _, analysis = load_volume_from_files(paths)
        seg_job = case.segmentationJob or {}
        seg_version = int(seg_job.get("version", 1))
        seg_threshold = seg_job.get("thresholdHu", thresholdHu)

        structure_targets: List[Tuple[str, Any]] = []
        with np.load(mask_path) as archive:
            if "scapula_mask" in archive and bool(archive["scapula_mask"].any()):
                structure_targets.append(("scapula", archive["scapula_mask"].astype(bool)))
            if "humerus_mask" in archive and bool(archive["humerus_mask"].any()):
                structure_targets.append(("humerus", archive["humerus_mask"].astype(bool)))
            if "glenoid_mask" in archive and bool(archive["glenoid_mask"].any()):
                structure_targets.append(("glenoid", archive["glenoid_mask"].astype(bool)))

        if not structure_targets:
            structure_targets.append(("combined", mask))

        model_dir = os.path.join(settings.DATA_DIR, "models", case_id)
        os.makedirs(model_dir, exist_ok=True)
        generated_meshes: List[Dict[str, Any]] = []

        for struct_name, struct_mask in structure_targets:
            mesh_bytes, stats = extract_patient_space_mesh_from_mask(
                struct_mask,
                analysis,
                seg_threshold,
            )
            model_id = str(uuid.uuid4())
            stored_name = f"{model_id}.stl"
            with open(os.path.join(model_dir, stored_name), "wb") as model_file:
                model_file.write(mesh_bytes)
            model = {
                "id": model_id,
                "version": seg_version,
                "segmentationVersion": seg_version,
                "caseId": case_id,
                "filename": f"ct-{struct_name}-{model_id[:8]}.stl",
                "format": "stl",
                "structure": struct_name,
                "fileSizeBytes": len(mesh_bytes),
                "sha256": hashlib.sha256(mesh_bytes).hexdigest(),
                "uploadedAt": datetime.now(timezone.utc).isoformat(),
                "storageName": stored_name,
                "unit": "mm",
                "unitVerified": True,
                "provenance": f"Patient CT {struct_name} segmentation (v{seg_version}) and marching-cubes surface extraction",
                "isDemoMesh": False,
                "qualityChecks": {
                    "watertightCheck": "not_computed",
                    "physicalCoordinates": True,
                    "thresholdHu": seg_threshold,
                    "segmentationVersion": seg_version,
                    "limitations": "Research prototype; inspect segmentation and mesh before use.",
                },
                **stats,
            }
            generated_meshes.append(model)
    except (DicomValidationError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Reconstruction failed: {exc}") from exc

    primary_mesh = generated_meshes[0]
    case_store.update_case(case_id, {
        "meshes": [*case.meshes, *generated_meshes],
        "status": "models_generated",
        "segmentationJob": {
            **(case.segmentationJob or {}),
            "status": "completed",
            "thresholdHu": thresholdHu,
            "reconstructionStatus": "completed",
            "reconstructionAt": datetime.now(timezone.utc).isoformat(),
            "meshId": primary_mesh["id"],
            "meshIds": [m["id"] for m in generated_meshes],
            "qualityAssessment": primary_mesh["qualityChecks"],
        },
    })
    return {"status": "completed", "mesh": primary_mesh, "meshes": generated_meshes}


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


@router.get("/cases/{case_id}/imaging/bone-quality")
async def get_case_bone_quality(
    case_id: str,
    lowHu: float = 150.0,
    midHu: float = 300.0,
    highHu: float = 700.0,
    authorization: Optional[str] = Header(None),
):
    """Compute regional CT attenuation (HU) statistics for scapula and humerus masks."""
    user = get_current_user(authorization)
    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Research case '{case_id}' was not found in storage.")
    if not case_store.user_can_access_case(user, case):
        raise HTTPException(status_code=403, detail="Access denied.")
    if not case.segmentationJob:
        raise HTTPException(status_code=400, detail="Run and save segmentation before analyzing bone quality.")
    paths = _series_paths(case_id, case)
    try:
        import numpy as np
        from ..services.dicom_service import compute_bone_quality_metrics
        mask, mask_path = _load_saved_mask(case_id, case)
        volume, analysis = load_volume_from_files(paths)
        scapula_mask = None
        humerus_mask = None
        with np.load(mask_path) as archive:
            if "scapula_mask" in archive:
                scapula_mask = archive["scapula_mask"].astype(bool)
            if "humerus_mask" in archive:
                humerus_mask = archive["humerus_mask"].astype(bool)
        if scapula_mask is None and humerus_mask is None:
            scapula_mask = mask
        metrics = compute_bone_quality_metrics(
            volume,
            analysis,
            scapula_mask=scapula_mask,
            humerus_mask=humerus_mask,
            low_hu=lowHu,
            mid_hu=midHu,
            high_hu=highHu,
        )
        case_store.update_case(case_id, {"boneQualityMetrics": metrics})
        return metrics
    except (DicomValidationError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Bone quality analysis failed: {exc}") from exc


@router.post("/cases/{case_id}/landmarks/detect")
async def detect_case_landmarks(
    case_id: str,
    authorization: Optional[str] = Header(None),
):
    """Detect anatomical shoulder landmarks from patient-specific 3D segmentation masks."""
    user, case = _owned_case_for_modify(case_id, authorization)
    if not case.segmentationJob:
        raise HTTPException(status_code=400, detail="Run and save segmentation before detecting landmarks.")
    paths = _series_paths(case_id, case)
    try:
        import numpy as np
        from ..services.dicom_service import detect_shoulder_landmarks
        mask, mask_path = _load_saved_mask(case_id, case)
        _, analysis = load_volume_from_files(paths)
        scapula_mask = None
        humerus_mask = None
        with np.load(mask_path) as archive:
            if "scapula_mask" in archive:
                scapula_mask = archive["scapula_mask"].astype(bool)
            if "humerus_mask" in archive:
                humerus_mask = archive["humerus_mask"].astype(bool)
        if scapula_mask is None and humerus_mask is None:
            scapula_mask = mask

        detection = detect_shoulder_landmarks(scapula_mask, humerus_mask, analysis)
        patient_meshes = [m for m in (case.meshes or []) if not m.get("isDemoMesh")]
        latest_mesh = patient_meshes[-1] if patient_meshes else None
        model_id = latest_mesh["id"] if latest_mesh else "ct-segmentation"
        model_version = int(latest_mesh.get("version", 1)) if latest_mesh else int(case.segmentationJob.get("version", 1))

        existing_manual = [
            lm for lm in (case.landmarks or [])
            if lm.get("source") != "ai_assisted"
        ]
        now = datetime.now(timezone.utc).isoformat()
        new_landmarks = []
        for item in detection["landmarks"]:
            new_landmarks.append({
                "id": str(uuid.uuid4()),
                "name": item["name"],
                "coordinatesMm": item["coordinatesMm"],
                "structure": item["structure"],
                "source": "ai_assisted",
                "status": item["status"],
                "confidence": item["confidence"],
                "modelId": model_id,
                "modelVersion": model_version,
                "createdAt": now,
            })

        combined_landmarks = existing_manual + new_landmarks
        case_store.update_case(case_id, {"landmarks": combined_landmarks})
        return {
            **detection,
            "landmarks": combined_landmarks,
            "detectedCount": len(new_landmarks),
        }
    except (DicomValidationError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Landmark detection failed: {exc}") from exc


class VersionSnapshotRequest(BaseModel):
    changeDescription: str = ""


@router.get("/cases/{case_id}/versions")
def list_case_versions(
    case_id: str,
    authorization: Optional[str] = Header(None),
):
    """List immutable digital twin version snapshots for a case."""
    user = get_current_user(authorization)
    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Research case '{case_id}' was not found in storage.")
    if not case_store.user_can_access_case(user, case):
        raise HTTPException(status_code=403, detail="Access denied.")
    return {"versions": case_store.list_digital_twin_versions(case_id)}


@router.post("/cases/{case_id}/versions", status_code=201)
def create_case_version(
    case_id: str,
    payload: VersionSnapshotRequest,
    authorization: Optional[str] = Header(None),
):
    """Create an immutable digital twin version snapshot of the current case state."""
    user, case = _owned_case_for_modify(case_id, authorization)
    seg_ver = int((case.segmentationJob or {}).get("version", 0)) if case.segmentationJob else None
    model_refs = [
        {"id": m.get("id"), "structure": m.get("structure"), "version": m.get("version"), "filename": m.get("filename")}
        for m in (case.meshes or [])
        if not m.get("isDemoMesh")
    ]
    version = case_store.create_digital_twin_version(
        case_id=case_id,
        user_id=user.get("id"),
        user_email=user.get("email"),
        segmentation_version=seg_ver,
        landmarks=case.landmarks or [],
        implant_plan=case.implantPlan or {},
        measurements=case.measurements or [],
        model_refs=model_refs,
        change_description=payload.changeDescription,
    )
    return version


@router.get("/cases/{case_id}/versions/compare")
def compare_case_versions(
    case_id: str,
    v1: int,
    v2: int,
    authorization: Optional[str] = Header(None),
):
    """Compare two immutable digital twin versions for a case."""
    user = get_current_user(authorization)
    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Research case '{case_id}' was not found in storage.")
    if not case_store.user_can_access_case(user, case):
        raise HTTPException(status_code=403, detail="Access denied.")
    ver1 = case_store.get_digital_twin_version(case_id, v1)
    ver2 = case_store.get_digital_twin_version(case_id, v2)
    if not ver1 or not ver2:
        raise HTTPException(status_code=404, detail="One or both requested versions were not found.")

    pos1 = (ver1.get("implantPlan") or {}).get("positionMm") or [0.0, 0.0, 0.0]
    pos2 = (ver2.get("implantPlan") or {}).get("positionMm") or [0.0, 0.0, 0.0]
    implant_delta = [round(float(pos2[i]) - float(pos1[i]), 3) for i in range(min(len(pos1), len(pos2)))]

    return {
        "v1": ver1["versionNumber"],
        "v2": ver2["versionNumber"],
        "segmentationVersionChanged": ver1.get("segmentationVersion") != ver2.get("segmentationVersion"),
        "landmarkCountDelta": len(ver2.get("landmarks") or []) - len(ver1.get("landmarks") or []),
        "measurementCountDelta": len(ver2.get("measurements") or []) - len(ver1.get("measurements") or []),
        "implantPositionDeltaMm": implant_delta,
        "implantNameV1": (ver1.get("implantPlan") or {}).get("implantName"),
        "implantNameV2": (ver2.get("implantPlan") or {}).get("implantName"),
    }


@router.post("/cases/{case_id}/versions/{version_number}/restore")
def restore_case_version(
    case_id: str,
    version_number: int,
    authorization: Optional[str] = Header(None),
):
    """Restore case landmarks, implant plan, and measurements from an immutable version snapshot."""
    user, case = _owned_case_for_modify(case_id, authorization)
    target = case_store.get_digital_twin_version(case_id, version_number)
    if not target:
        raise HTTPException(status_code=404, detail=f"Version {version_number} not found for case '{case_id}'.")

    updated = case_store.update_case(
        case_id,
        {
            "landmarks": target.get("landmarks") or [],
            "implantPlan": target.get("implantPlan") or {},
            "measurements": target.get("measurements") or [],
        },
    )
    return {
        "status": "restored",
        "restoredVersion": version_number,
        "case": updated.model_dump() if hasattr(updated, "model_dump") else updated,
    }


@router.get("/cases/{case_id}/report/pdf")
def download_case_pdf_report(
    case_id: str,
    authorization: Optional[str] = Header(None),
):
    """Generate and download a patient-specific digital twin PDF engineering report."""
    from fastapi.responses import Response
    from ..services.pdf_service import generate_case_pdf_bytes

    user = get_current_user(authorization)
    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Research case '{case_id}' was not found in storage.")
    if not case_store.user_can_access_case(user, case):
        raise HTTPException(status_code=403, detail="Access denied.")

    case_dict = case.model_dump() if hasattr(case, "model_dump") else dict(case)
    pdf_bytes = generate_case_pdf_bytes(case_dict, user_role=user.get("role", "researcher"))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="ShoulderTwin-{case_id}.pdf"'},
    )
