"""
Imaging Router for Digital Twin of the Shoulder.

Handles real DICOM (.dcm) file uploads, validation, metadata extraction,
and 3D reconstruction feasibility assessment.
"""

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
)

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


async def process_uploaded_dicom_files(files: List[UploadFile]) -> DicomUploadResponse:
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided. Select at least one DICOM (.dcm) file.",
        )

    parsed_slices: List[Tuple[Dict[str, Any], Optional[str]]] = []
    total_size = 0

    for file in files:
        filename = file.filename or "unknown.dcm"

        # Read content
        content = await file.read()
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

    response = await process_uploaded_dicom_files(files)
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

