from datetime import datetime, timezone
from typing import Dict, List, Optional
import uuid

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from ..services.registration import RegistrationError, calculate_rigid_registration
from ..storage import case_store
from .models import _case_for_user, _model_for_case, _validate_point

router = APIRouter(prefix="/api", tags=["registration"])


class RegistrationCorrespondence(BaseModel):
    sourceLandmarkId: str
    targetLandmarkId: str


class RegistrationPayload(BaseModel):
    modelId: str
    modelVersion: int
    coordinateSystemSource: str = "DICOM patient LPS"
    coordinateSystemTarget: str = "model"
    correspondences: List[RegistrationCorrespondence]


@router.post("/cases/{case_id}/registrations", status_code=201)
async def create_registration(
    case_id: str,
    payload: RegistrationPayload,
    authorization: Optional[str] = Header(None),
):
    case = _case_for_user(case_id, authorization, modify=True)
    model = _model_for_case(case, payload.modelId)
    if int(model.get("version", 1)) != payload.modelVersion:
        raise HTTPException(status_code=409, detail="The registration model version is outdated.")
    if payload.coordinateSystemSource == payload.coordinateSystemTarget:
        raise HTTPException(status_code=422, detail="Registration source and target coordinate systems must differ.")
    if len(payload.correspondences) < 3:
        raise HTTPException(status_code=422, detail="Rigid registration requires at least three correspondences.")
    if len({(item.sourceLandmarkId, item.targetLandmarkId) for item in payload.correspondences}) != len(payload.correspondences):
        raise HTTPException(status_code=422, detail="Registration correspondences must be distinct.")

    landmarks = {item.get("id"): item for item in case.landmarks}
    source_points: List[List[float]] = []
    target_points: List[List[float]] = []
    for pair in payload.correspondences:
        source = landmarks.get(pair.sourceLandmarkId)
        target = landmarks.get(pair.targetLandmarkId)
        if not source or not target:
            raise HTTPException(status_code=422, detail="Every registration landmark must belong to this case.")
        if source.get("coordinateSystem") != payload.coordinateSystemSource:
            raise HTTPException(status_code=422, detail="A source landmark has an incompatible coordinate system.")
        if target.get("coordinateSystem") != payload.coordinateSystemTarget:
            raise HTTPException(status_code=422, detail="A target landmark has an incompatible coordinate system.")
        source_points.append(_validate_point(source.get("coordinatesMm"), "source landmark coordinates"))
        target_points.append(_validate_point(target.get("coordinatesMm"), "target landmark coordinates"))

    try:
        result = calculate_rigid_registration(source_points, target_points)
    except RegistrationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    registration = {
        **result,
        "id": str(uuid.uuid4()),
        "caseId": case_id,
        "modelId": payload.modelId,
        "modelVersion": payload.modelVersion,
        "coordinateSystemSource": payload.coordinateSystemSource,
        "coordinateSystemTarget": payload.coordinateSystemTarget,
        "correspondences": [item.model_dump() for item in payload.correspondences],
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": "valid",
    }
    if not case_store.update_case(case_id, {"registration": registration}):
        raise HTTPException(status_code=500, detail="The registration could not be saved.")
    return registration


@router.get("/cases/{case_id}/registrations")
async def get_registration(case_id: str, authorization: Optional[str] = Header(None)):
    case = _case_for_user(case_id, authorization)
    return case.registration


@router.delete("/cases/{case_id}/registrations", status_code=204)
async def invalidate_registration(case_id: str, authorization: Optional[str] = Header(None)):
    case = _case_for_user(case_id, authorization, modify=True)
    if case.registration is None:
        return
    invalidated = {**case.registration, "status": "invalidated", "invalidatedAt": datetime.now(timezone.utc).isoformat()}
    if not case_store.update_case(case_id, {"registration": invalidated}):
        raise HTTPException(status_code=500, detail="The registration could not be invalidated.")
