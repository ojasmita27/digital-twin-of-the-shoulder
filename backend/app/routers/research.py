import csv
import io
import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response

from ..dependencies import get_current_user
from ..services.pdf_service import generate_case_pdf_bytes
from ..storage import case_store

router = APIRouter(prefix="/api/research", tags=["research"])


def _case_for_user(case_id: str, authorization: Optional[str]):
    user = get_current_user(authorization)
    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Research case '{case_id}' was not found in storage.")
    if not case_store.user_can_access_case(user, case):
        raise HTTPException(status_code=403, detail="Access denied.")
    return user, case


@router.get("/analytics")
def research_analytics(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """Return aggregate research counts from the caller's authorized cases."""
    user = get_current_user(authorization)
    cases = case_store.list_cases_for_user(user)
    imaging_cases = [case for case in cases if case.imaging]
    segmented_cases = [case for case in cases if case.segmentationJob]
    model_count = sum(len([mesh for mesh in case.meshes if not mesh.get("isDemoMesh")]) for case in cases)
    measurement_count = sum(
        len((case.measurements or {}).get("manualMeasurements", [])) + len(case.planningMeasurements)
        for case in cases
    )
    planning_version_count = sum(len(case.planningVersions) for case in cases)
    return {
        "caseCount": len(cases),
        "processedCaseCount": sum(case.status.value not in {"created"} for case in cases),
        "availableImagingStudies": len(imaging_cases),
        "segmentationStatus": {
            "completed": len(segmented_cases),
            "pending": len(cases) - len(segmented_cases),
        },
        "modelStatus": {
            "casesWithModels": sum(bool(case.meshes) for case in cases),
            "modelCount": model_count,
        },
        "measurementRecordCount": measurement_count,
        "implantPlanningVersionCount": planning_version_count,
        "processingStatistics": {
            "volumetricSeries": sum(bool((case.imaging or {}).get("isVolumetricSeries")) for case in cases),
            "reconstructionReady": sum(
                (case.imaging or {}).get("reconstructionReadiness") == "volumetric_reconstruction_ready"
                for case in cases
            ),
        },
    }


@router.get("/cases/{case_id}/measurements.csv")
def export_measurements_csv(
    case_id: str,
    authorization: Optional[str] = Header(None),
) -> Response:
    _, case = _case_for_user(case_id, authorization)
    rows = list((case.measurements or {}).get("manualMeasurements", [])) + list(case.planningMeasurements)
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["id", "type", "label", "modelId", "modelVersion", "displayDistance", "displayUnit", "geometryStatus", "createdAt"],
        extrasaction="ignore",
    )
    writer.writeheader()
    writer.writerows(rows)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{case_id}-measurements.csv"'},
    )


@router.get("/cases/{case_id}/planning.json")
def export_planning_json(
    case_id: str,
    authorization: Optional[str] = Header(None),
) -> Response:
    _, case = _case_for_user(case_id, authorization)
    payload = {
        "caseId": case.id,
        "source": "ShoulderTwin research database",
        "coordinateSystem": (case.implantPlan or {}).get("coordinateSystem", "patient"),
        "unit": (case.implantPlan or {}).get("coordinateUnit", "unknown"),
        "implantPlan": case.implantPlan,
        "planningVersions": case.planningVersions,
        "planningMeasurements": case.planningMeasurements,
    }
    return Response(
        content=json.dumps(payload, indent=2, sort_keys=True),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{case_id}-planning.json"'},
    )


@router.get("/cases/{case_id}/report.pdf")
def export_case_report(
    case_id: str,
    authorization: Optional[str] = Header(None),
) -> Response:
    user, case = _case_for_user(case_id, authorization)
    data = case.model_dump() if hasattr(case, "model_dump") else case.dict()
    return Response(
        content=generate_case_pdf_bytes(data, user.role.value),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{case_id}-research-report.pdf"'},
    )
