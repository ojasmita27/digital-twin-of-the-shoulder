import hashlib
import os
import uuid
import struct
from datetime import datetime, timezone
import math
from typing import Any, Dict, Optional, List

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status
import json
from pydantic import BaseModel

from ..config import settings
from ..dependencies import get_current_user, require_role
from ..models.case import ResearchCase
from ..models.user import UserRole
from ..storage import case_store

router = APIRouter(prefix="/api", tags=["models"])
MAX_MODEL_SIZE_BYTES = 100 * 1024 * 1024
SUPPORTED_FORMATS = {"stl", "ply", "obj", "glb"}


class ModelUploadResponse(BaseModel):
    model: Dict[str, Any]


class ImplantUploadResponse(BaseModel):
    implant: Dict[str, Any]


class LandmarkPayload(BaseModel):
    name: str
    structure: str = "unknown"
    coordinatesMm: List[float]
    provenance: str = "manual_annotated"
    modelId: str
    modelVersion: int = 1
    coordinateUnit: str = "mm"
    unitVerified: bool = False
    validationNotes: Optional[str] = None


class LandmarkUpdatePayload(BaseModel):
    name: Optional[str] = None
    coordinatesMm: Optional[List[float]] = None
    validationNotes: Optional[str] = None


class MeasurementPayload(BaseModel):
    type: str = "point_to_point"
    modelId: str
    modelVersion: int
    pointA: List[float] = []
    pointB: List[float] = []
    pointC: Optional[List[float]] = None
    landmarkIds: Optional[List[str]] = None
    implantReferenceIds: Optional[List[str]] = None
    implantAssetId: Optional[str] = None
    pointRefs: Optional[List[Dict[str, str]]] = None
    displayUnit: str = "mm"
    label: Optional[str] = None


class ImplantPlanningPayload(BaseModel):
    patientModelId: str
    patientModelVersion: int
    implantAssetId: str
    implantAssetVersion: int
    implantTransform: Dict[str, Any]
    procedureType: Optional[str] = None
    glenoidComponent: Optional[Dict[str, Any]] = None
    humeralComponent: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    implantMeasurement: Optional[Dict[str, Any]] = None
    planningStatus: Optional[str] = None
    planName: Optional[str] = None
    analysis: Optional[Dict[str, Any]] = None


class ImplantReferencePointPayload(BaseModel):
    implantAssetId: str
    implantAssetVersion: int
    name: str
    coordinatesLocal: List[float]
    coordinateUnit: str = "unknown"
    unitVerified: bool = False


class ImplantReferencePointUpdatePayload(BaseModel):
    name: Optional[str] = None
    coordinatesLocal: Optional[List[float]] = None


def _validate_point(point: List[float], name: str) -> List[float]:
    try:
        values = [float(value) for value in point]
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail=f"{name} must contain three finite coordinates.")
    if len(values) != 3 or not all(math.isfinite(value) for value in values):
        raise HTTPException(status_code=422, detail=f"{name} must contain three finite coordinates.")
    return values


def _model_for_case(case: ResearchCase, model_id: str) -> Dict[str, Any]:
    model = next((item for item in case.meshes if item.get("id") == model_id and not item.get("isDemoMesh")), None)
    if not model:
        raise HTTPException(status_code=422, detail="The referenced patient-specific model was not found.")
    return model


def _implant_for_case(case: ResearchCase, implant_id: str) -> Dict[str, Any]:
    implant = next((item for item in case.implantAssets if item.get("id") == implant_id and not item.get("isDemoAsset")), None)
    if not implant:
        raise HTTPException(status_code=404, detail="The requested implant asset was not found.")
    return implant


def _finite_transform(transform: Dict[str, Any]) -> Dict[str, Any]:
    translation = transform.get("translation")
    rotation = transform.get("rotationDeg")
    try:
        translation_values = [float(value) for value in translation] if isinstance(translation, list) else []
        rotation_values = [float(value) for value in rotation] if isinstance(rotation, list) else []
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Implant transform values must be numeric.")
    if len(translation_values) != 3 or not all(math.isfinite(value) for value in translation_values):
        raise HTTPException(status_code=422, detail="Implant translation must contain three finite values.")
    if len(rotation_values) != 3 or not all(math.isfinite(value) for value in rotation_values):
        raise HTTPException(status_code=422, detail="Implant rotation must contain three finite values.")
    unit = transform.get("coordinateUnit", "unknown")
    if unit not in {"unknown", "mm", "cm", "in"}:
        raise HTTPException(status_code=422, detail="Implant coordinateUnit is invalid.")
    return {
        "translation": translation_values,
        "rotationDeg": rotation_values,
        "coordinateUnit": unit,
        "unitVerified": bool(transform.get("unitVerified", False)),
    }


def _mesh_bounds(content: bytes, extension: str) -> Optional[Dict[str, List[float]]]:
    """Extract bounds from supported text/binary meshes without trusting metadata."""
    points: List[List[float]] = []
    if extension == "stl":
        if len(content) >= 84:
            count = struct.unpack_from("<I", content, 80)[0]
            if 84 + count * 50 == len(content):
                for offset in range(84, len(content), 50):
                    for point_offset in (12, 24, 36):
                        points.append(list(struct.unpack_from("<3f", content, offset + point_offset)))
            else:
                try:
                    for line in content.decode("utf-8", errors="strict").splitlines():
                        values = line.strip().split()
                        if len(values) == 4 and values[0].lower() == "vertex":
                            points.append([float(value) for value in values[1:]])
                except (UnicodeDecodeError, ValueError):
                    return None
    elif extension == "obj":
        try:
            for line in content.decode("utf-8", errors="strict").splitlines():
                values = line.strip().split()
                if len(values) >= 4 and values[0] == "v":
                    points.append([float(value) for value in values[1:4]])
        except (UnicodeDecodeError, ValueError):
            return None
    if not points or any(len(point) != 3 or not all(math.isfinite(value) for value in point) for point in points):
        return None
    return {
        "min": [min(point[index] for point in points) for index in range(3)],
        "max": [max(point[index] for point in points) for index in range(3)],
    }


def _transform_bounds(bounds: Dict[str, List[float]], transform: Dict[str, Any]) -> Dict[str, List[float]]:
    corners = [
        [
            bounds["min"][0] if mask & 1 == 0 else bounds["max"][0],
            bounds["min"][1] if mask & 2 == 0 else bounds["max"][1],
            bounds["min"][2] if mask & 4 == 0 else bounds["max"][2],
        ]
        for mask in range(8)
    ]
    transformed = [_transform_local_point(corner, transform) for corner in corners]
    return {
        "min": [min(point[index] for point in transformed) for index in range(3)],
        "max": [max(point[index] for point in transformed) for index in range(3)],
    }


def _analysis_from_files(
    bone_content: bytes,
    bone_format: str,
    implant_content: bytes,
    implant_format: str,
    transform: Dict[str, Any],
    identifiers: Dict[str, Any],
) -> Dict[str, Any]:
    bone_bounds = _mesh_bounds(bone_content, bone_format)
    implant_bounds = _mesh_bounds(implant_content, implant_format)
    warnings: List[str] = []
    if not bone_bounds or not implant_bounds:
        if implant_format == "glb":
            warnings.append("GLB geometry analysis requires client-side GLTF traversal; server bounds are unavailable.")
        else:
            warnings.append("The uploaded mesh has no readable vertex geometry.")
        return {
            **identifiers,
            "status": "invalid_geometry",
            "method": "axis_aligned_bounding_box",
            "implantBounds": None,
            "boneBounds": None,
            "intersects": False,
            "implantOutsideBone": True,
            "warnings": warnings,
            "computedAt": datetime.now(timezone.utc).isoformat(),
        }
    world_implant = _transform_bounds(implant_bounds, transform)
    dimensions = lambda bounds: [bounds["max"][i] - bounds["min"][i] for i in range(3)]
    intersects = all(
        world_implant["min"][i] <= bone_bounds["max"][i] and world_implant["max"][i] >= bone_bounds["min"][i]
        for i in range(3)
    )
    outside = any(
        world_implant["max"][i] < bone_bounds["min"][i] or world_implant["min"][i] > bone_bounds["max"][i]
        for i in range(3)
    )
    if intersects:
        warnings.append("Bounding boxes overlap. This is a geometric screening result, not clinical fit validation.")
    if outside:
        warnings.append("The implant bounding box is outside the selected patient model region.")
    return {
        **identifiers,
        "status": "current",
        "method": "axis_aligned_bounding_box",
        "implantBounds": {**world_implant, "dimensions": dimensions(world_implant)},
        "boneBounds": {**bone_bounds, "dimensions": dimensions(bone_bounds)},
        "intersects": intersects,
        "implantOutsideBone": outside,
        "warnings": warnings,
        "computedAt": datetime.now(timezone.utc).isoformat(),
    }


def _transform_local_point(point: List[float], transform: Dict[str, Any]) -> List[float]:
    x, y, z = point
    rx, ry, rz = [math.radians(value) for value in transform["rotationDeg"]]
    y, z = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
    x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
    x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
    translation = transform["translation"]
    return [x + translation[0], y + translation[1], z + translation[2]]


def _resolve_measurement_refs(case: ResearchCase, payload: MeasurementPayload, model: Dict[str, Any]) -> List[List[float]]:
    refs = payload.pointRefs or []
    expected_count = 3 if payload.type == "angle" else 2
    if len(refs) != expected_count:
        raise HTTPException(status_code=422, detail=f"{payload.type} measurement requires {expected_count} ordered point references.")
    plan = case.implantPlan or {}
    transform = _finite_transform(plan.get("implantTransform", {})) if any(ref.get("kind") == "implant_reference" for ref in refs) else None
    resolved: List[List[float]] = []
    for ref in refs:
        kind = ref.get("kind")
        point_id = ref.get("id")
        if kind == "landmark":
            landmark = next((item for item in case.landmarks if item.get("id") == point_id), None)
            if not landmark:
                raise HTTPException(status_code=422, detail=f"Landmark '{point_id}' is not part of this case.")
            if landmark.get("modelId") != payload.modelId or int(landmark.get("modelVersion", 1)) != payload.modelVersion:
                raise HTTPException(status_code=409, detail="A referenced landmark belongs to a different model version.")
            if landmark.get("unitVerified") and landmark.get("coordinateUnit", "unknown") != model.get("unit", "unknown"):
                raise HTTPException(status_code=422, detail="A referenced landmark uses incompatible coordinate units.")
            resolved.append(_validate_point(landmark.get("coordinatesMm"), "landmark coordinates"))
        elif kind == "implant_reference":
            point = _implant_reference_point_for_case(case, str(point_id))
            if not payload.implantAssetId or point.get("implantAssetId") != payload.implantAssetId:
                raise HTTPException(status_code=422, detail="Each implant reference must belong to implantAssetId.")
            implant = _implant_for_case(case, payload.implantAssetId)
            if int(point.get("implantAssetVersion", 1)) != int(implant.get("version", 1)):
                raise HTTPException(status_code=409, detail="An implant reference point is stale.")
            if point.get("unitVerified") and point.get("coordinateUnit", "unknown") != model.get("unit", "unknown"):
                raise HTTPException(status_code=422, detail="An implant reference point uses incompatible coordinate units.")
            if plan.get("patientModelId") != payload.modelId or int(plan.get("patientModelVersion", -1)) != payload.modelVersion:
                raise HTTPException(status_code=409, detail="The implant planning state is stale for this patient model.")
            resolved.append(_transform_local_point(_validate_point(point.get("coordinatesLocal"), "reference coordinates"), transform or {}))
        else:
            raise HTTPException(status_code=422, detail="Point references must use landmark or implant_reference kinds.")
    return resolved


def _recalculate_reference_measurement(
    case: ResearchCase,
    measurement: Dict[str, Any],
    model: Dict[str, Any],
) -> Dict[str, Any]:
    """Recalculate a saved measurement against the current implant transform."""
    refs = measurement.get("pointRefs")
    if not isinstance(refs, list):
        return measurement
    payload = MeasurementPayload(
        type=str(measurement.get("type", "point_to_point")),
        modelId=str(model["id"]),
        modelVersion=int(model.get("version", 1)),
        pointRefs=refs,
        implantAssetId=measurement.get("implantAssetId"),
        displayUnit=str(measurement.get("displayUnit", "unknown")),
        label=measurement.get("label"),
    )
    points = _resolve_measurement_refs(case, payload, model)
    point_a, point_b = points[0], points[1]
    distance = math.sqrt(sum((point_b[index] - point_a[index]) ** 2 for index in range(3)))
    unit_factors = {"mm": 1.0, "cm": 0.1, "in": 1 / 25.4, "unknown": 1.0}
    updated = {
        **measurement,
        "pointA": point_a,
        "pointB": point_b,
        "rawDistance": distance,
        "displayDistance": round(distance * unit_factors[payload.displayUnit], 6),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "geometryStatus": "current",
    }
    if payload.type == "angle" and len(points) == 3:
        point_c = points[2]
        vector_ba = [point_a[index] - point_b[index] for index in range(3)]
        vector_bc = [point_c[index] - point_b[index] for index in range(3)]
        norm_ba = math.sqrt(sum(value * value for value in vector_ba))
        norm_bc = math.sqrt(sum(value * value for value in vector_bc))
        if norm_ba <= 0 or norm_bc <= 0:
            raise HTTPException(status_code=422, detail="Saved angle measurement has coincident points.")
        cosine = max(-1.0, min(1.0, sum(vector_ba[index] * vector_bc[index] for index in range(3)) / (norm_ba * norm_bc)))
        updated["pointC"] = point_c
        updated["angleDegrees"] = math.degrees(math.acos(cosine))
    return updated


def _case_for_user(case_id: str, authorization: Optional[str], modify: bool = False) -> ResearchCase:
    user = require_role([UserRole.DOCTOR, UserRole.ADMIN])(authorization) if modify else get_current_user(authorization)
    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Research case '{case_id}' was not found in storage.")
    allowed = case_store.user_can_modify_case(user, case) if modify else case_store.user_can_access_case(user, case)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access denied for research case '{case_id}'.")
    return case


@router.post("/cases/{case_id}/landmarks", status_code=status.HTTP_201_CREATED)
async def create_case_landmark(
    case_id: str,
    payload: LandmarkPayload,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization, modify=True)
    model = _model_for_case(case, payload.modelId)
    if payload.modelVersion != int(model.get("version", 1)):
        raise HTTPException(status_code=409, detail="The landmark model version is outdated.")
    if payload.coordinateUnit != model.get("unit", "unknown") and payload.unitVerified:
        raise HTTPException(status_code=422, detail="Verified landmark units must match the model units.")
    landmark = {
        **payload.model_dump(),
        "id": str(uuid.uuid4()),
        "caseId": case_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "verificationStatus": "unverified",
        "coordinatesMm": _validate_point(payload.coordinatesMm, "coordinatesMm"),
    }
    updated = case_store.update_case(case_id, {"landmarks": [*case.landmarks, landmark]})
    if not updated:
        raise HTTPException(status_code=500, detail="The landmark could not be saved.")
    return landmark


@router.patch("/cases/{case_id}/landmarks/{landmark_id}")
async def update_case_landmark(
    case_id: str,
    landmark_id: str,
    payload: LandmarkUpdatePayload,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization, modify=True)
    existing = next((item for item in case.landmarks if item.get("id") == landmark_id), None)
    if not existing:
        raise HTTPException(status_code=404, detail="The landmark was not found.")
    model = _model_for_case(case, str(existing.get("modelId", "")))
    if payload.coordinatesMm is not None:
        payload.coordinatesMm = _validate_point(payload.coordinatesMm, "coordinatesMm")
    if int(existing.get("modelVersion", 1)) != int(model.get("version", 1)):
        raise HTTPException(status_code=409, detail="The landmark is associated with an outdated model version.")
    updated_landmark = {**existing, **payload.model_dump(exclude_unset=True), "updatedAt": datetime.now(timezone.utc).isoformat()}
    updated = case_store.update_case(case_id, {
        "landmarks": [updated_landmark if item.get("id") == landmark_id else item for item in case.landmarks],
    })
    if not updated:
        raise HTTPException(status_code=500, detail="The landmark could not be updated.")
    return updated_landmark


@router.delete("/cases/{case_id}/landmarks/{landmark_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case_landmark(
    case_id: str,
    landmark_id: str,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization, modify=True)
    if not any(item.get("id") == landmark_id for item in case.landmarks):
        raise HTTPException(status_code=404, detail="The landmark was not found.")
    if not case_store.update_case(case_id, {"landmarks": [item for item in case.landmarks if item.get("id") != landmark_id]}):
        raise HTTPException(status_code=500, detail="The landmark could not be deleted.")


@router.post("/cases/{case_id}/measurements", status_code=status.HTTP_201_CREATED)
async def create_case_measurement(
    case_id: str,
    payload: MeasurementPayload,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization, modify=True)
    model = _model_for_case(case, payload.modelId)
    if payload.modelVersion != int(model.get("version", 1)):
        raise HTTPException(status_code=409, detail="The measurement model version is outdated.")
    if payload.pointRefs is not None:
        if len(set((ref.get("kind"), ref.get("id")) for ref in payload.pointRefs)) != len(payload.pointRefs):
            raise HTTPException(status_code=422, detail="Measurement point references must be distinct.")
        resolved_points = _resolve_measurement_refs(case, payload, model)
        point_a, point_b = resolved_points[0], resolved_points[1]
        point_c = resolved_points[2] if len(resolved_points) == 3 else None
    elif payload.landmarkIds is not None or payload.implantReferenceIds is not None:
        expected_count = 3 if payload.type == "angle" else 2
        landmark_ids = payload.landmarkIds or []
        implant_reference_ids = payload.implantReferenceIds or []
        if len(landmark_ids) + len(implant_reference_ids) != expected_count:
            raise HTTPException(status_code=422, detail=f"{payload.type} measurement requires {expected_count} point references.")
        if len(set(landmark_ids)) != len(landmark_ids) or len(set(implant_reference_ids)) != len(implant_reference_ids):
            raise HTTPException(status_code=422, detail="Measurement point references must be distinct.")
        referenced = []
        for landmark_id in landmark_ids:
            landmark = next((item for item in case.landmarks if item.get("id") == landmark_id), None)
            if not landmark:
                raise HTTPException(status_code=422, detail=f"Landmark '{landmark_id}' is not part of this case.")
            if landmark.get("modelId") != payload.modelId or int(landmark.get("modelVersion", 1)) != payload.modelVersion:
                raise HTTPException(status_code=409, detail="A referenced landmark belongs to a different model version.")
            referenced.append(_validate_point(landmark["coordinatesMm"], "landmark coordinates"))
        if implant_reference_ids:
            plan = case.implantPlan or {}
            if plan.get("patientModelId") != payload.modelId or int(plan.get("patientModelVersion", -1)) != payload.modelVersion:
                raise HTTPException(status_code=409, detail="The implant planning state is stale for this patient model.")
            if not payload.implantAssetId or plan.get("implantAssetId") != payload.implantAssetId:
                raise HTTPException(status_code=422, detail="A matching implantAssetId is required for implant reference measurements.")
            implant = _implant_for_case(case, payload.implantAssetId)
            transform = plan.get("implantTransform")
            if not isinstance(transform, dict):
                raise HTTPException(status_code=409, detail="The implant transform is not saved.")
            transform = _finite_transform(transform)
            for reference_id in implant_reference_ids:
                point = _implant_reference_point_for_case(case, reference_id)
                if point.get("implantAssetId") != implant["id"] or int(point.get("implantAssetVersion", 1)) != int(implant.get("version", 1)):
                    raise HTTPException(status_code=409, detail="An implant reference point is stale.")
                referenced.append(_transform_local_point(_validate_point(point["coordinatesLocal"], "reference coordinates"), transform))
        point_a = referenced[0]
        point_b = referenced[1]
        point_c = referenced[2] if len(referenced) == 3 else None
    else:
        point_a = _validate_point(payload.pointA, "pointA")
        point_b = _validate_point(payload.pointB, "pointB")
        point_c = _validate_point(payload.pointC, "pointC") if payload.pointC is not None else None
    vector_ab = [point_b[i] - point_a[i] for i in range(3)]
    distance = math.sqrt(sum(value * value for value in vector_ab))
    if distance <= 0:
        raise HTTPException(status_code=422, detail="Point-to-point distance requires distinct points.")
    unit_factors = {"mm": 1.0, "cm": 0.1, "in": 1 / 25.4, "unknown": 1.0}
    if payload.displayUnit not in unit_factors:
        raise HTTPException(status_code=422, detail="displayUnit must be one of unknown, mm, cm, or in.")
    result: Dict[str, Any] = {
        **payload.model_dump(exclude={"pointA", "pointB", "pointC"}),
        "id": str(uuid.uuid4()),
        "caseId": case_id,
        "pointA": point_a,
        "pointB": point_b,
        "rawDistance": distance,
        "displayDistance": round(distance * unit_factors[payload.displayUnit], 6),
        "scaleVerified": payload.displayUnit == model.get("unit", "unknown") and bool(model.get("unitVerified")),
        "provenance": "manual",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "geometryStatus": "current",
    }
    if payload.pointRefs is not None:
        result["pointRefs"] = payload.pointRefs
        result["implantAssetId"] = payload.implantAssetId
        result["implantPlanUpdatedAt"] = (case.implantPlan or {}).get("updatedAt")
    if payload.type == "angle":
        if point_c is None:
            raise HTTPException(status_code=422, detail="Angle measurement requires pointC.")
        vector_ba = [point_a[i] - point_b[i] for i in range(3)]
        vector_bc = [point_c[i] - point_b[i] for i in range(3)]
        norm_ba = math.sqrt(sum(value * value for value in vector_ba))
        norm_bc = math.sqrt(sum(value * value for value in vector_bc))
        if norm_ba <= 0 or norm_bc <= 0:
            raise HTTPException(status_code=422, detail="Angle measurement requires three distinct points.")
        cosine = max(-1.0, min(1.0, sum(vector_ba[i] * vector_bc[i] for i in range(3)) / (norm_ba * norm_bc)))
        result["pointC"] = point_c
        result["angleDegrees"] = math.degrees(math.acos(cosine))
    existing = (case.measurements or {}).get("manualMeasurements", [])
    updates: Dict[str, Any] = {
        "measurements": {**(case.measurements or {}), "manualMeasurements": [*existing, result]},
        "status": "measurements_computed",
    }
    if payload.pointRefs is not None:
        updates["planningMeasurements"] = [*case.planningMeasurements, result]
    updated = case_store.update_case(case_id, updates)
    if not updated:
        raise HTTPException(status_code=500, detail="The measurement could not be saved.")
    return result


@router.get("/cases/{case_id}/measurements")
async def list_case_measurements(
    case_id: str,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization)
    return (case.measurements or {}).get("manualMeasurements", [])


@router.get("/cases/{case_id}/planning-measurements")
async def list_planning_measurements(
    case_id: str,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization)
    return case.planningMeasurements


@router.post("/cases/{case_id}/implants", response_model=ImplantUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_case_implant(
    case_id: str,
    file: UploadFile = File(...),
    metadata: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None),
) -> ImplantUploadResponse:
    case = _case_for_user(case_id, authorization, modify=True)
    filename = os.path.basename(file.filename or "")
    extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if extension not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail="Unsupported implant format. Select an STL, PLY, or OBJ file.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The implant file is empty.")
    if len(content) > MAX_MODEL_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="The implant file exceeds the 100 MB limit.")
    supplied_metadata: Dict[str, Any] = {}
    if metadata:
        try:
            supplied_metadata = json.loads(metadata)
        except json.JSONDecodeError as error:
            raise HTTPException(status_code=422, detail="Implant metadata must be valid JSON.") from error
    if supplied_metadata.get("unit", "unknown") not in {"unknown", "mm", "cm", "in"}:
        raise HTTPException(status_code=422, detail="Implant unit is invalid.")
    if supplied_metadata.get("category", "other") not in {"glenoid", "baseplate", "glenosphere", "humeral_stem", "humeral_cup", "other"}:
        raise HTTPException(status_code=422, detail="Implant category is invalid.")
    implant_id = str(uuid.uuid4())
    stored_name = f"{implant_id}.{extension}"
    storage_dir = os.path.join(settings.DATA_DIR, "implants", case_id)
    os.makedirs(storage_dir, exist_ok=True)
    with open(os.path.join(storage_dir, stored_name), "wb") as implant_file:
        implant_file.write(content)
    implant = {
        "id": implant_id,
        "caseId": case_id,
        "filename": filename,
        "format": extension,
        "storageName": stored_name,
        "version": 1,
        "fileSizeBytes": len(content),
        "unit": supplied_metadata.get("unit", "unknown"),
        "unitVerified": bool(supplied_metadata.get("unitVerified", False)),
        "displayName": supplied_metadata.get("displayName") or os.path.splitext(filename)[0],
        "category": supplied_metadata.get("category", "other"),
        "manufacturer": supplied_metadata.get("manufacturer"),
        "metadata": supplied_metadata.get("metadata", {}),
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
        "isDemoAsset": False,
    }
    if not case_store.update_case(case_id, {"implantAssets": [*case.implantAssets, implant]}):
        raise HTTPException(status_code=500, detail="The implant asset could not be saved.")
    return ImplantUploadResponse(implant=implant)


@router.get("/cases/{case_id}/implants")
async def list_case_implants(case_id: str, authorization: Optional[str] = Header(None)):
    case = _case_for_user(case_id, authorization)
    return case.implantAssets


@router.get("/cases/{case_id}/implants/{implant_id}/file")
async def download_case_implant(
    case_id: str,
    implant_id: str,
    authorization: Optional[str] = Header(None),
):
    from fastapi.responses import FileResponse
    case = _case_for_user(case_id, authorization)
    implant = _implant_for_case(case, implant_id)
    path = os.path.join(settings.DATA_DIR, "implants", case_id, os.path.basename(implant["storageName"]))
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="The implant asset file is unavailable.")
    return FileResponse(path, filename=implant["filename"])


@router.put("/cases/{case_id}/implant-planning")
async def save_case_implant_planning(
    case_id: str,
    payload: ImplantPlanningPayload,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization, modify=True)
    payload_data = payload.model_dump(exclude_none=True)
    model = _model_for_case(case, payload.patientModelId)
    if payload.patientModelVersion != int(model.get("version", 1)):
        raise HTTPException(status_code=409, detail="The planning patient model version is outdated.")
    implant = _implant_for_case(case, payload.implantAssetId)
    if payload.implantAssetVersion != int(implant.get("version", 1)):
        raise HTTPException(status_code=409, detail="The planning implant asset version is outdated.")
    transform = _finite_transform(payload.implantTransform)
    if transform["unitVerified"] and transform["coordinateUnit"] != model.get("unit", "unknown"):
        raise HTTPException(status_code=422, detail="Verified implant transform units must match the patient model units.")
    implant_measurement = payload.implantMeasurement
    if implant_measurement is not None:
        landmark_id = str(implant_measurement.get("landmarkId", ""))
        landmark = next((item for item in case.landmarks if item.get("id") == landmark_id), None)
        if not landmark:
            raise HTTPException(status_code=422, detail="The implant measurement landmark is not part of this case.")
        if landmark.get("modelId") != model.get("id") or int(landmark.get("modelVersion", 1)) != int(model.get("version", 1)):
            raise HTTPException(status_code=409, detail="The implant measurement landmark is stale.")
        if implant_measurement.get("reference") != "implant_origin":
            raise HTTPException(status_code=422, detail="Only the imported implant origin is available as a reference point.")
        try:
            measured_distance = float(implant_measurement.get("distance"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="The implant measurement distance must be numeric.")
        if not math.isfinite(measured_distance) or measured_distance < 0:
            raise HTTPException(status_code=422, detail="The implant measurement distance must be finite and non-negative.")
        implant_measurement = {
            "landmarkId": landmark_id,
            "reference": "implant_origin",
            "distance": measured_distance,
            "displayUnit": implant_measurement.get("displayUnit", "unknown"),
        }
    plan = {
        **payload_data,
        "implantTransform": transform,
        **({"implantMeasurement": implant_measurement} if implant_measurement is not None else {}),
        "planningStatus": "saved",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    if hasattr(case, "model_copy"):
        recalculation_case = case.model_copy(update={"implantPlan": plan})
    else:
        recalculation_case = case.copy(update={"implantPlan": plan})
    planning_measurements = [
        _recalculate_reference_measurement(recalculation_case, item, model)
        if item.get("pointRefs") else item
        for item in case.planningMeasurements
    ]
    manual_measurements = [
        _recalculate_reference_measurement(recalculation_case, item, model)
        if item.get("pointRefs") else item
        for item in (case.measurements or {}).get("manualMeasurements", [])
    ]
    measurement_updates = {
        **(case.measurements or {}),
        "manualMeasurements": manual_measurements,
    }
    if not case_store.update_case(
        case_id,
        {
            "implantPlan": plan,
            "planningMeasurements": planning_measurements,
            "measurements": measurement_updates,
            "status": "planning_in_progress",
        },
    ):
        raise HTTPException(status_code=500, detail="The implant planning state could not be saved.")
    if payload.planName:
        version = {
            **plan,
            "id": str(uuid.uuid4()),
            "caseId": case_id,
            "name": payload.planName.strip(),
            "createdAt": plan["updatedAt"],
        }
        if not case_store.update_case(case_id, {"planningVersions": [*case.planningVersions, version]}):
            raise HTTPException(status_code=500, detail="The planning version could not be saved.")
    return plan


@router.get("/cases/{case_id}/planning-versions")
async def list_planning_versions(case_id: str, authorization: Optional[str] = Header(None)):
    case = _case_for_user(case_id, authorization)
    return case.planningVersions


@router.post("/cases/{case_id}/planning-versions/{version_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate_planning_version(case_id: str, version_id: str, authorization: Optional[str] = Header(None)):
    case = _case_for_user(case_id, authorization, modify=True)
    original = next((item for item in case.planningVersions if item.get("id") == version_id), None)
    if not original:
        raise HTTPException(status_code=404, detail="The planning version was not found.")
    now = datetime.now(timezone.utc).isoformat()
    duplicate = {**original, "id": str(uuid.uuid4()), "name": f"{original.get('name', 'Plan')} copy", "createdAt": now, "updatedAt": now}
    if not case_store.update_case(case_id, {"planningVersions": [*case.planningVersions, duplicate]}):
        raise HTTPException(status_code=500, detail="The planning version could not be duplicated.")
    return duplicate


@router.delete("/cases/{case_id}/planning-versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_planning_version(case_id: str, version_id: str, authorization: Optional[str] = Header(None)):
    case = _case_for_user(case_id, authorization, modify=True)
    if not any(item.get("id") == version_id for item in case.planningVersions):
        raise HTTPException(status_code=404, detail="The planning version was not found.")
    if not case_store.update_case(case_id, {"planningVersions": [item for item in case.planningVersions if item.get("id") != version_id]}):
        raise HTTPException(status_code=500, detail="The planning version could not be deleted.")


@router.post("/cases/{case_id}/implant-analysis")
async def analyze_implant_geometry(
    case_id: str,
    payload: ImplantPlanningPayload,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization)
    model = _model_for_case(case, payload.patientModelId)
    implant = _implant_for_case(case, payload.implantAssetId)
    if payload.patientModelVersion != int(model.get("version", 1)) or payload.implantAssetVersion != int(implant.get("version", 1)):
        raise HTTPException(status_code=409, detail="The analysis references an outdated model or implant version.")
    model_path = os.path.join(settings.DATA_DIR, "models", case_id, os.path.basename(str(model.get("storageName", ""))))
    implant_path = os.path.join(settings.DATA_DIR, "implants", case_id, os.path.basename(str(implant.get("storageName", ""))))
    if not os.path.isfile(model_path) or not os.path.isfile(implant_path):
        raise HTTPException(status_code=404, detail="The referenced geometry file is unavailable.")
    transform = _finite_transform(payload.implantTransform)
    return _analysis_from_files(
        open(model_path, "rb").read(),
        str(model.get("format", "")).lower(),
        open(implant_path, "rb").read(),
        str(implant.get("format", "")).lower(),
        transform,
        {
            "patientModelId": payload.patientModelId,
            "patientModelVersion": payload.patientModelVersion,
            "implantAssetId": payload.implantAssetId,
            "implantAssetVersion": payload.implantAssetVersion,
        },
    )


def _implant_reference_point_for_case(case: ResearchCase, point_id: str) -> Dict[str, Any]:
    point = next((item for item in case.implantReferencePoints if item.get("id") == point_id), None)
    if not point:
        raise HTTPException(status_code=422, detail=f"Implant reference point '{point_id}' is not part of this case.")
    return point


def _validated_version(value: Any, detail: str) -> int:
    try:
        version = int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail=detail)
    if version < 1:
        raise HTTPException(status_code=422, detail=detail)
    return version


@router.get("/cases/{case_id}/implant-reference-points")
async def list_implant_reference_points(case_id: str, authorization: Optional[str] = Header(None)):
    case = _case_for_user(case_id, authorization)
    return case.implantReferencePoints


@router.post("/cases/{case_id}/implant-reference-points", status_code=status.HTTP_201_CREATED)
async def create_implant_reference_point(
    case_id: str,
    payload: ImplantReferencePointPayload,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization, modify=True)
    implant = _implant_for_case(case, payload.implantAssetId)
    try:
        coordinates = _validate_point(payload.coordinatesLocal, "coordinatesLocal")
    except TypeError:
        raise HTTPException(status_code=422, detail="coordinatesLocal must contain three numeric values.")
    name = payload.name.strip()
    if not name or len(name) > 120:
        raise HTTPException(status_code=422, detail="Reference point name must be between 1 and 120 characters.")
    if payload.implantAssetVersion != int(implant.get("version", 1)):
        raise HTTPException(status_code=409, detail="The implant reference point asset version is outdated.")
    unit = payload.coordinateUnit
    if unit not in {"unknown", "mm", "cm", "in"}:
        raise HTTPException(status_code=422, detail="Reference point coordinateUnit is invalid.")
    now = datetime.now(timezone.utc).isoformat()
    point = {
        "id": str(uuid.uuid4()),
        "caseId": case_id,
        "implantAssetId": implant["id"],
        "implantAssetVersion": int(implant.get("version", 1)),
        "name": name,
        "coordinatesLocal": coordinates,
        "coordinateUnit": unit,
        "unitVerified": payload.unitVerified,
        "createdAt": now,
        "updatedAt": now,
    }
    if not case_store.update_case(case_id, {"implantReferencePoints": [*case.implantReferencePoints, point]}):
        raise HTTPException(status_code=500, detail="The implant reference point could not be saved.")
    return point


@router.patch("/cases/{case_id}/implant-reference-points/{point_id}")
async def update_implant_reference_point(
    case_id: str,
    point_id: str,
    payload: ImplantReferencePointUpdatePayload,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization, modify=True)
    existing = _implant_reference_point_for_case(case, point_id)
    implant = _implant_for_case(case, str(existing.get("implantAssetId", "")))
    if _validated_version(existing.get("implantAssetVersion", 1), "The stored implant reference point version is invalid.") != int(implant.get("version", 1)):
        raise HTTPException(status_code=409, detail="The implant reference point is stale.")
    updated = {**existing}
    payload_data = payload.model_dump(exclude_unset=True)
    if "name" in payload_data:
        name = str(payload_data["name"]).strip()
        if not name or len(name) > 120:
            raise HTTPException(status_code=422, detail="Reference point name must be between 1 and 120 characters.")
        updated["name"] = name
    if "coordinatesLocal" in payload_data:
        updated["coordinatesLocal"] = _validate_point(payload_data["coordinatesLocal"], "coordinatesLocal")
    updated["updatedAt"] = datetime.now(timezone.utc).isoformat()
    points = [updated if item.get("id") == point_id else item for item in case.implantReferencePoints]
    if not case_store.update_case(case_id, {"implantReferencePoints": points}):
        raise HTTPException(status_code=500, detail="The implant reference point could not be updated.")
    return updated


@router.delete("/cases/{case_id}/implant-reference-points/{point_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_implant_reference_point(
    case_id: str,
    point_id: str,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization, modify=True)
    _implant_reference_point_for_case(case, point_id)
    if not case_store.update_case(case_id, {
        "implantReferencePoints": [item for item in case.implantReferencePoints if item.get("id") != point_id],
    }):
        raise HTTPException(status_code=500, detail="The implant reference point could not be deleted.")


@router.post("/cases/{case_id}/models", response_model=ModelUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_case_model(
    case_id: str,
    file: UploadFile = File(...),
    metadata: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None),
) -> ModelUploadResponse:
    case = _case_for_user(case_id, authorization, modify=True)
    filename = os.path.basename(file.filename or "model")
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only STL, PLY, and OBJ model files are supported.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The uploaded model file is empty.")
    if len(content) > MAX_MODEL_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="The model file exceeds the 100 MB limit.")

    model_id = str(uuid.uuid4())
    uploaded_at = datetime.now(timezone.utc).isoformat()
    storage_dir = os.path.join(settings.DATA_DIR, "models", case_id)
    os.makedirs(storage_dir, exist_ok=True)
    stored_name = f"{model_id}.{extension}"
    stored_path = os.path.join(storage_dir, stored_name)
    with open(stored_path, "wb") as model_file:
        model_file.write(content)

    try:
        supplied_metadata = json.loads(metadata) if metadata else {}
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model metadata is not valid JSON.") from error
    if not isinstance(supplied_metadata, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model metadata must be an object.")

    model = {
        "id": model_id,
        "version": 1,
        "caseId": case_id,
        "filename": filename,
        "format": extension,
        "structure": "combined",
        "fileSizeBytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "uploadedAt": uploaded_at,
        "storageName": stored_name,
        "unit": "unknown",
        "unitVerified": False,
        "provenance": "imported",
        "isDemoMesh": False,
        "vertexCount": supplied_metadata.get("vertexCount"),
        "triangleCount": supplied_metadata.get("triangleCount"),
        "faceCount": supplied_metadata.get("triangleCount", 0),
        "boundingBox": supplied_metadata.get("boundingBox"),
        "surfaceArea": supplied_metadata.get("surfaceArea"),
        "qualityChecks": supplied_metadata.get("qualityChecks"),
        "validationStatus": supplied_metadata.get("validationStatus", "valid"),
    }
    meshes = [mesh for mesh in case.meshes if mesh.get("id") != model_id]
    meshes.append(model)
    updates: Dict[str, Any] = {"meshes": meshes}
    if case.implantPlan and case.implantPlan.get("patientModelId") != model_id:
        updates["implantPlan"] = {**case.implantPlan, "planningStatus": "stale"}
    if not case_store.update_case(case_id, updates):
        try:
            os.remove(stored_path)
        except OSError:
            pass
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="The model metadata could not be saved.")
    return ModelUploadResponse(model=model)


@router.get("/cases/{case_id}/models/{model_id}/file")
async def download_case_model(
    case_id: str,
    model_id: str,
    authorization: Optional[str] = Header(None),
):
    from fastapi.responses import FileResponse

    case = _case_for_user(case_id, authorization)
    model = next((item for item in case.meshes if item.get("id") == model_id), None)
    if not model or model.get("isDemoMesh"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The requested model file was not found.")
    storage_name = os.path.basename(str(model.get("storageName", "")))
    path = os.path.join(settings.DATA_DIR, "models", case_id, storage_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The requested model file is unavailable.")
    return FileResponse(path, filename=model.get("filename", "model"))


@router.delete("/cases/{case_id}/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case_model(
    case_id: str,
    model_id: str,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization, modify=True)
    model = next((item for item in case.meshes if item.get("id") == model_id), None)
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The requested model was not found.")
    storage_name = os.path.basename(str(model.get("storageName", "")))
    path = os.path.join(settings.DATA_DIR, "models", case_id, storage_name)
    updated = case_store.update_case(case_id, {
        "meshes": [item for item in case.meshes if item.get("id") != model_id],
        "landmarks": [item for item in case.landmarks if item.get("modelId") != model_id],
        "measurements": {
            **(case.measurements or {}),
            "manualMeasurements": [
                item for item in ((case.measurements or {}).get("manualMeasurements", []))
                if item.get("modelId") != model_id
            ],
        },
    })
    if not updated:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="The model could not be removed from the case.")
    if os.path.isfile(path):
        os.remove(path)
