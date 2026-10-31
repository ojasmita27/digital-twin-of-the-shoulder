import hashlib
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

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
SUPPORTED_FORMATS = {"stl", "ply", "obj"}


class ModelUploadResponse(BaseModel):
    model: Dict[str, Any]


def _case_for_user(case_id: str, authorization: Optional[str], modify: bool = False) -> ResearchCase:
    user = require_role([UserRole.DOCTOR, UserRole.ADMIN])(authorization) if modify else get_current_user(authorization)
    case = case_store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Research case '{case_id}' was not found in storage.")
    allowed = case_store.user_can_modify_case(user, case) if modify else case_store.user_can_access_case(user, case)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access denied for research case '{case_id}'.")
    return case


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
    if not case_store.update_case(case_id, {"meshes": meshes}):
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
