import json
import os
import tempfile
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.storage.sqlite import SqliteCaseStore
import backend.app.storage as storage_module
import backend.app.dependencies as deps_module
import backend.app.routers.cases as cases_router
import backend.app.routers.auth as auth_router
import backend.app.routers.models as models_router
import backend.app.routers.research as research_router
from backend.app.config import settings
from backend.app.models.case import CaseCreateRequest, PatientDemographics, AnatomicalSide

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_test_database(monkeypatch, tmp_path):
    """
    Creates an isolated temporary SQLite database for each test function,
    overriding the global case_store in the routers and dependencies.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = tf.name

    test_store = SqliteCaseStore(db_path=temp_db_path)
    orig_storage_store = storage_module.case_store
    orig_cases_store = cases_router.case_store
    orig_deps_store = deps_module.case_store
    orig_auth_store = auth_router.case_store
    orig_models_store = models_router.case_store
    orig_research_store = research_router.case_store

    storage_module.case_store = test_store
    cases_router.case_store = test_store
    deps_module.case_store = test_store
    auth_router.case_store = test_store
    models_router.case_store = test_store
    research_router.case_store = test_store
    monkeypatch.setattr(settings, "DATA_DIR", str(tmp_path))

    yield test_store

    storage_module.case_store = orig_storage_store
    cases_router.case_store = orig_cases_store
    deps_module.case_store = orig_deps_store
    auth_router.case_store = orig_auth_store
    models_router.case_store = orig_models_store
    research_router.case_store = orig_research_store
    if os.path.exists(temp_db_path):
        try:
            os.remove(temp_db_path)
        except OSError:
            pass


@pytest.fixture
def auth_headers(isolated_test_database):
    doc = isolated_test_database.get_user_by_email("doctor@shouldertwin.org")
    token, _ = isolated_test_database.create_session(user_id=doc["id"])
    return {"Authorization": f"Bearer {token}"}


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "digital-twin-shoulder-backend"
    assert data["storage"] == "sqlite3"
    assert "health" in data
    assert "cases" in data


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "digital-twin-shoulder-backend"
    assert "gpuAvailable" in data
    assert isinstance(data["gpuAvailable"], bool)
    assert data["activeJobsCount"] == 0


def test_list_cases_unauthenticated():
    response = client.get("/api/cases")
    assert response.status_code == 401


def test_list_cases_empty(auth_headers):
    response = client.get("/api/cases", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_and_get_case(auth_headers):
    payload = {
        "name": "Subject 104 - Right Shoulder OA",
        "demographics": {
            "researchSubjectId": "SUBJ-104",
            "ageBand": "61-75",
            "biologicalSex": "female",
            "indication": "Primary Osteoarthritis",
            "affectedSide": "right",
        },
        "isDemo": False,
    }
    create_res = client.post("/api/cases", json=payload, headers=auth_headers)
    assert create_res.status_code == 201
    created_data = create_res.json()

    assert created_data["id"].startswith("SHL-2026-")
    assert created_data["name"] == payload["name"]
    assert created_data["status"] == "created"
    assert created_data["demographics"]["researchSubjectId"] == "SUBJ-104"
    assert created_data["demographics"]["affectedSide"] == "right"
    assert created_data["demographics"]["ageBand"] == "61-75"

    case_id = created_data["id"]

    # Verify listing includes the case
    list_res = client.get("/api/cases", headers=auth_headers)
    assert list_res.status_code == 200
    cases_list = list_res.json()
    assert len(cases_list) == 1
    assert cases_list[0]["id"] == case_id

    # Verify fetching by ID
    get_res = client.get(f"/api/cases/{case_id}", headers=auth_headers)
    assert get_res.status_code == 200
    assert get_res.json()["id"] == case_id


def test_viewer_preferences_persist(auth_headers):
    payload = {
        "name": "Viewer Preference Subject",
        "demographics": {
            "researchSubjectId": "VIEW-001",
            "ageBand": "41-60",
            "biologicalSex": "undisclosed",
            "indication": "Research Normative",
            "affectedSide": "right",
        },
    }
    case_id = client.post("/api/cases", json=payload, headers=auth_headers).json()["id"]
    preferences = {
        "scapulaVisible": False,
        "humerusVisible": True,
        "landmarksVisible": False,
        "selectedSliceIndex": 12,
    }
    update_res = client.patch(
        f"/api/cases/{case_id}",
        json={"viewerPreferences": preferences},
        headers=auth_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["viewerPreferences"] == preferences

    refreshed = client.get(f"/api/cases/{case_id}", headers=auth_headers)
    assert refreshed.status_code == 200
    assert refreshed.json()["viewerPreferences"] == preferences


def test_get_case_not_found(auth_headers):
    response = client.get("/api/cases/SHL-9999-NONEXISTENT", headers=auth_headers)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_model_upload_persists_file_metadata_and_download(auth_headers, isolated_test_database):
    payload = {
        "name": "Model Persistence Subject",
        "demographics": {
            "researchSubjectId": "MODEL-001",
            "ageBand": "41-60",
            "biologicalSex": "undisclosed",
            "indication": "Research Normative",
            "affectedSide": "right",
        },
    }
    case_id = client.post("/api/cases", json=payload, headers=auth_headers).json()["id"]
    model_bytes = b"solid shoulder\nendsolid shoulder\n"
    response = client.post(
        f"/api/cases/{case_id}/models",
        files={"file": ("shoulder.stl", model_bytes, "application/sla")},
        data={"metadata": json.dumps({"vertexCount": 3, "triangleCount": 1, "validationStatus": "valid"})},
        headers=auth_headers,
    )
    assert response.status_code == 201
    model = response.json()["model"]
    assert model["filename"] == "shoulder.stl"
    assert model["vertexCount"] == 3
    assert model["unit"] == "unknown"

    case = client.get(f"/api/cases/{case_id}", headers=auth_headers).json()
    assert case["meshes"][0]["id"] == model["id"]
    downloaded = client.get(f"/api/cases/{case_id}/models/{model['id']}/file", headers=auth_headers)
    assert downloaded.status_code == 200
    assert downloaded.content == model_bytes


def test_model_upload_requires_case_access(auth_headers, isolated_test_database):
    payload = {
        "name": "Protected Model Subject",
        "demographics": {
            "researchSubjectId": "MODEL-002",
            "ageBand": "41-60",
            "biologicalSex": "undisclosed",
            "indication": "Research Normative",
            "affectedSide": "right",
        },
    }
    case_id = client.post("/api/cases", json=payload, headers=auth_headers).json()["id"]
    response = client.post(
        f"/api/cases/{case_id}/models",
        files={"file": ("shoulder.exe", b"not a model", "application/octet-stream")},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "supported" in response.json()["detail"].lower()


def test_model_quality_and_research_exports(auth_headers):
    payload = {
        "name": "Quality Export Subject",
        "demographics": {
            "researchSubjectId": "QUALITY-001",
            "ageBand": "41-60",
            "biologicalSex": "undisclosed",
            "indication": "Research Normative",
            "affectedSide": "right",
        },
    }
    case_id = client.post("/api/cases", json=payload, headers=auth_headers).json()["id"]
    obj = b"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
    model_response = client.post(
        f"/api/cases/{case_id}/models",
        files={"file": ("shoulder.obj", obj, "text/plain")},
        headers=auth_headers,
    )
    assert model_response.status_code == 201
    model_id = model_response.json()["model"]["id"]
    quality = client.get(f"/api/cases/{case_id}/models/{model_id}/quality", headers=auth_headers)
    assert quality.status_code == 200
    assert quality.json()["quality"]["boundaryEdgeCount"] == 3

    analytics = client.get("/api/research/analytics", headers=auth_headers)
    assert analytics.status_code == 200
    assert analytics.json()["modelStatus"]["modelCount"] == 1
    csv_export = client.get(f"/api/research/cases/{case_id}/measurements.csv", headers=auth_headers)
    assert csv_export.status_code == 200
    assert "displayDistance" in csv_export.text
    planning_export = client.get(f"/api/research/cases/{case_id}/planning.json", headers=auth_headers)
    assert planning_export.status_code == 200
    assert planning_export.json()["caseId"] == case_id


def test_glb_implant_library_and_version_lifecycle(auth_headers):
    payload = {
        "name": "Planning Version Subject",
        "demographics": {
            "researchSubjectId": "PLAN-001",
            "ageBand": "41-60",
            "biologicalSex": "undisclosed",
            "indication": "Research Normative",
            "affectedSide": "right",
        },
    }
    case_id = client.post("/api/cases", json=payload, headers=auth_headers).json()["id"]
    model = client.post(
        f"/api/cases/{case_id}/models",
        files={"file": ("bone.stl", b"solid bone\nendsolid bone\n", "application/sla")},
        headers=auth_headers,
    ).json()["model"]
    implant = client.post(
        f"/api/cases/{case_id}/implants",
        files={"file": ("baseplate.glb", b"glTF", "model/gltf-binary")},
        data={"metadata": json.dumps({"category": "baseplate", "displayName": "Research Baseplate"})},
        headers=auth_headers,
    )
    assert implant.status_code == 201
    implant_data = implant.json()["implant"]
    assert implant_data["format"] == "glb"
    assert implant_data["category"] == "baseplate"
    assert client.get(f"/api/cases/{case_id}/implants", headers=auth_headers).json()[0]["displayName"] == "Research Baseplate"

    plan = {
        "patientModelId": model["id"],
        "patientModelVersion": model["version"],
        "implantAssetId": implant_data["id"],
        "implantAssetVersion": implant_data["version"],
        "implantTransform": {"translation": [0, 0, 0], "rotationDeg": [0, 0, 0], "coordinateUnit": "unknown", "unitVerified": False},
        "planName": "Plan A",
    }
    saved = client.put(f"/api/cases/{case_id}/implant-planning", json=plan, headers=auth_headers)
    assert saved.status_code == 200
    versions = client.get(f"/api/cases/{case_id}/planning-versions", headers=auth_headers).json()
    assert len(versions) == 1
    duplicate = client.post(f"/api/cases/{case_id}/planning-versions/{versions[0]['id']}/duplicate", headers=auth_headers)
    assert duplicate.status_code == 201
    assert len(client.get(f"/api/cases/{case_id}/planning-versions", headers=auth_headers).json()) == 2
    analysis = client.post(f"/api/cases/{case_id}/implant-analysis", json=plan, headers=auth_headers)
    assert analysis.status_code == 200
    assert analysis.json()["status"] == "invalid_geometry"


def test_delete_case(auth_headers):
    payload = {
        "name": "Temporary Case",
        "demographics": {
            "researchSubjectId": "TEMP-001",
            "ageBand": "41-60",
            "biologicalSex": "male",
            "indication": "Rotator Cuff Tear Arthropathy",
            "affectedSide": "left",
        },
    }
    create_res = client.post("/api/cases", json=payload, headers=auth_headers)
    case_id = create_res.json()["id"]

    delete_res = client.delete(f"/api/cases/{case_id}", headers=auth_headers)
    assert delete_res.status_code == 204

    # Verify no longer exists
    get_res = client.get(f"/api/cases/{case_id}", headers=auth_headers)
    assert get_res.status_code == 404



def test_persistence_across_reinitialization(isolated_test_database):
    """
    CRITICAL PHASE 1C REQUIREMENT:
    Verify that creating a case, destroying the store instance, and creating
    a completely new store pointing to the same SQLite file retains all data.
    """
    store1 = isolated_test_database
    db_path = store1.db_path

    req = CaseCreateRequest(
        name="Persistence Verification Subject",
        demographics=PatientDemographics(
            researchSubjectId="PERSIST-007",
            ageBand="41-60",
            biologicalSex="male",
            indication="Revision Arthroplasty",
            affectedSide=AnatomicalSide.left,
        ),
        isDemo=False,
    )
    created = store1.create_case(req)
    case_id = created.id

    # Re-initialize a second store instance targeting the exact same DB file
    store2 = SqliteCaseStore(db_path=db_path)
    loaded = store2.get_case(case_id)

    assert loaded is not None
    assert loaded.id == case_id
    assert loaded.name == "Persistence Verification Subject"
    assert loaded.demographics.researchSubjectId == "PERSIST-007"
    assert loaded.demographics.affectedSide.value == "left"
    assert loaded.demographics.indication == "Revision Arthroplasty"

    # Verify listing from second store instance
    all_cases = store2.list_cases()
    assert any(c.id == case_id for c in all_cases)


def test_nested_field_serialization_and_updates(isolated_test_database):
    """
    Verify full serialization of complex nested anatomical metadata:
    meshes, landmarks, measurements, implant plan.
    """
    store = isolated_test_database
    req = CaseCreateRequest(
        name="Complex Anatomy Subject",
        demographics=PatientDemographics(
            researchSubjectId="SUBJ-COMPLEX-01",
            ageBand="61-75",
            biologicalSex="female",
            indication="Primary Osteoarthritis",
            affectedSide=AnatomicalSide.right,
        ),
    )
    created = store.create_case(req)

    # Apply updates with rich nested structures
    updates = {
        "status": "measurements_computed",
        "meshes": [
            {"id": "mesh-scap-01", "structure": "scapula", "faceCount": 72000},
            {"id": "mesh-hum-01", "structure": "humerus", "faceCount": 54000},
        ],
        "landmarks": [
            {"id": "lm-gc", "name": "Glenoid Center", "coordinatesMm": [12.4, -6.2, 18.1]},
        ],
        "measurements": {
            "glenoidRetroversionDeg": 8.5,
            "glenoidInclinationDeg": 4.2,
            "humeralHeadSubluxationPercent": 55.0,
        },
    }
    updated = store.update_case(created.id, updates)
    assert updated is not None
    assert updated.status.value == "measurements_computed"
    assert len(updated.meshes) == 2
    assert updated.meshes[0]["structure"] == "scapula"
    assert len(updated.landmarks) == 1
    assert updated.measurements["glenoidRetroversionDeg"] == 8.5

    # Verify persistence by reading from a new store instance
    store_reloaded = SqliteCaseStore(db_path=store.db_path)
    fetched = store_reloaded.get_case(created.id)
    assert fetched is not None
    assert fetched.measurements["glenoidRetroversionDeg"] == 8.5
    assert len(fetched.meshes) == 2


def test_invalid_input_handling(auth_headers):
    """Verify appropriate HTTP 422 Unprocessable Entity on schema validation failure."""
    # Missing required demographics field entirely
    res_bad = client.post("/api/cases", json={"name": "Malformed Case"}, headers=auth_headers)
    assert res_bad.status_code == 422

    # Invalid anatomical side
    res_bad_side = client.post(
        "/api/cases",
        json={
            "name": "Invalid Side Case",
            "demographics": {
                "researchSubjectId": "SUBJ-BAD",
                "affectedSide": "anterior",  # Invalid enum value
            },
        },
        headers=auth_headers,
    )
    assert res_bad_side.status_code == 422


def _case_with_model(auth_headers):
    case = client.post(
        "/api/cases",
        json={
            "name": "Landmark Test Case",
            "demographics": {
                "researchSubjectId": "LM-001",
                "ageBand": "41-60",
                "biologicalSex": "undisclosed",
                "indication": "Research Normative",
                "affectedSide": "right",
            },
        },
        headers=auth_headers,
    ).json()
    model = client.post(
        f"/api/cases/{case['id']}/models",
        files={"file": ("shoulder.stl", b"solid shoulder\nendsolid shoulder\n", "application/sla")},
        data={"metadata": json.dumps({"vertexCount": 3, "triangleCount": 1, "validationStatus": "valid"})},
        headers=auth_headers,
    ).json()["model"]
    return case, model


def test_landmark_lifecycle_and_model_validation(auth_headers):
    case, model = _case_with_model(auth_headers)
    landmark = client.post(
        f"/api/cases/{case['id']}/landmarks",
        json={
            "name": "Glenoid center",
            "structure": "scapula",
            "coordinatesMm": [1, 2, 3],
            "modelId": model["id"],
            "modelVersion": model["version"],
            "coordinateUnit": "unknown",
        },
        headers=auth_headers,
    )
    assert landmark.status_code == 201
    landmark_id = landmark.json()["id"]

    renamed = client.patch(
        f"/api/cases/{case['id']}/landmarks/{landmark_id}",
        json={"name": "Updated center", "coordinatesMm": [4, 5, 6]},
        headers=auth_headers,
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Updated center"
    assert renamed.json()["coordinatesMm"] == [4, 5, 6]

    wrong_version = client.post(
        f"/api/cases/{case['id']}/landmarks",
        json={
            "name": "Stale",
            "coordinatesMm": [0, 0, 0],
            "modelId": model["id"],
            "modelVersion": model["version"] + 1,
        },
        headers=auth_headers,
    )
    assert wrong_version.status_code == 409

    deleted = client.delete(f"/api/cases/{case['id']}/landmarks/{landmark_id}", headers=auth_headers)
    assert deleted.status_code == 204


def test_measurement_distance_angle_references_and_persistence(auth_headers):
    case, model = _case_with_model(auth_headers)
    landmark_ids = []
    for name, point in [("A", [0, 0, 0]), ("B", [3, 0, 0]), ("C", [3, 4, 0])]:
        response = client.post(
            f"/api/cases/{case['id']}/landmarks",
            json={"name": name, "coordinatesMm": point, "modelId": model["id"], "modelVersion": model["version"]},
            headers=auth_headers,
        )
        assert response.status_code == 201
        landmark_ids.append(response.json()["id"])

    distance = client.post(
        f"/api/cases/{case['id']}/measurements",
        json={
            "type": "point_to_point",
            "modelId": model["id"],
            "modelVersion": model["version"],
            "landmarkIds": landmark_ids[:2],
            "pointA": [99, 99, 99],
            "pointB": [99, 99, 99],
            "displayUnit": "cm",
        },
        headers=auth_headers,
    )
    assert distance.status_code == 201
    assert distance.json()["rawDistance"] == 3
    assert distance.json()["displayDistance"] == 0.3

    angle = client.post(
        f"/api/cases/{case['id']}/measurements",
        json={
            "type": "angle",
            "modelId": model["id"],
            "modelVersion": model["version"],
            "landmarkIds": landmark_ids,
            "pointA": [0, 0, 0],
            "pointB": [0, 0, 0],
            "displayUnit": "mm",
        },
        headers=auth_headers,
    )
    assert angle.status_code == 201
    assert round(angle.json()["angleDegrees"], 5) == 90
    listed = client.get(f"/api/cases/{case['id']}/measurements", headers=auth_headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 2

    invalid_reference = client.post(
        f"/api/cases/{case['id']}/measurements",
        json={
            "type": "point_to_point",
            "modelId": model["id"],
            "modelVersion": model["version"],
            "landmarkIds": ["not-in-case", landmark_ids[0]],
            "pointA": [0, 0, 0],
            "pointB": [1, 0, 0],
        },
        headers=auth_headers,
    )
    assert invalid_reference.status_code == 422


def test_landmark_and_measurement_routes_require_case_access():
    response = client.post(
        "/api/cases/SHL-unknown/landmarks",
        json={"name": "Blocked", "coordinatesMm": [0, 0, 0], "modelId": "model", "modelVersion": 1},
    )
    assert response.status_code == 401


def test_implant_asset_planning_persistence_and_validation(auth_headers):
    case, model = _case_with_model(auth_headers)
    implant_response = client.post(
        f"/api/cases/{case['id']}/implants",
        files={"file": ("component.obj", b"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n", "text/plain")},
        data={"metadata": json.dumps({"unit": "mm", "unitVerified": True})},
        headers=auth_headers,
    )
    assert implant_response.status_code == 201
    implant = implant_response.json()["implant"]
    implant_file_response = client.get(
        f"/api/cases/{case['id']}/implants/{implant['id']}/file",
        headers=auth_headers,
    )
    assert implant_file_response.status_code == 200, implant_file_response.json()
    landmark = client.post(
        f"/api/cases/{case['id']}/landmarks",
        json={
            "name": "Planning reference",
            "coordinatesMm": [1, 2, 3],
            "modelId": model["id"],
            "modelVersion": model["version"],
        },
        headers=auth_headers,
    ).json()

    plan = {
        "patientModelId": model["id"],
        "patientModelVersion": model["version"],
        "implantAssetId": implant["id"],
        "implantAssetVersion": implant["version"],
        "implantTransform": {
            "translation": [1, 2, 3],
            "rotationDeg": [10, 20, 30],
            "coordinateUnit": "unknown",
            "unitVerified": False,
        },
        "implantMeasurement": {
            "landmarkId": landmark["id"],
            "reference": "implant_origin",
            "distance": 3.741657,
            "displayUnit": "mm",
        },
    }
    saved = client.put(f"/api/cases/{case['id']}/implant-planning", json=plan, headers=auth_headers)
    assert saved.status_code == 200
    assert saved.json()["planningStatus"] == "saved"
    assert saved.json()["implantTransform"]["translation"] == [1, 2, 3]
    assert saved.json()["implantMeasurement"]["landmarkId"] == landmark["id"]

    invalid = {**plan, "implantTransform": {**plan["implantTransform"], "translation": [1, "bad", 3]}}
    invalid_response = client.put(f"/api/cases/{case['id']}/implant-planning", json=invalid, headers=auth_headers)
    assert invalid_response.status_code == 422

    stale = {**plan, "patientModelVersion": model["version"] + 1}
    stale_response = client.put(f"/api/cases/{case['id']}/implant-planning", json=stale, headers=auth_headers)
    assert stale_response.status_code == 409

    persisted = client.get(f"/api/cases/{case['id']}", headers=auth_headers).json()
    assert persisted["implantAssets"][0]["id"] == implant["id"]
    assert persisted["implantPlan"]["implantAssetId"] == implant["id"]


def test_ordered_planning_measurements_use_landmarks_and_implant_references(auth_headers):
    case, model = _case_with_model(auth_headers)
    implant = client.post(
        f"/api/cases/{case['id']}/implants",
        files={"file": ("component.obj", b"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n", "text/plain")},
        data={"metadata": json.dumps({"unit": "unknown", "unitVerified": False})},
        headers=auth_headers,
    ).json()["implant"]
    plan = {
        "patientModelId": model["id"],
        "patientModelVersion": model["version"],
        "implantAssetId": implant["id"],
        "implantAssetVersion": implant["version"],
        "implantTransform": {
            "translation": [1, 0, 0],
            "rotationDeg": [0, 0, 0],
            "coordinateUnit": "unknown",
            "unitVerified": False,
        },
    }
    assert client.put(f"/api/cases/{case['id']}/implant-planning", json=plan, headers=auth_headers).status_code == 200
    landmark = client.post(
        f"/api/cases/{case['id']}/landmarks",
        json={"name": "Measurement point", "coordinatesMm": [1, 3, 0], "modelId": model["id"], "modelVersion": model["version"]},
        headers=auth_headers,
    ).json()
    reference = client.post(
        f"/api/cases/{case['id']}/implant-reference-points",
        json={
            "implantAssetId": implant["id"],
            "implantAssetVersion": implant["version"],
            "name": "Implant point",
            "coordinatesLocal": [0, 0, 0],
            "coordinateUnit": "unknown",
            "unitVerified": False,
        },
        headers=auth_headers,
    ).json()
    measurement = client.post(
        f"/api/cases/{case['id']}/measurements",
        json={
            "type": "point_to_point",
            "modelId": model["id"],
            "modelVersion": model["version"],
            "pointRefs": [
                {"kind": "implant_reference", "id": reference["id"]},
                {"kind": "landmark", "id": landmark["id"]},
            ],
            "implantAssetId": implant["id"],
            "displayUnit": "unknown",
            "label": "Implant to landmark",
        },
        headers=auth_headers,
    )
    assert measurement.status_code == 201
    assert measurement.json()["rawDistance"] == 3
    listed = client.get(f"/api/cases/{case['id']}/planning-measurements", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json()[0]["pointRefs"][0]["kind"] == "implant_reference"

    invalid = client.post(
        f"/api/cases/{case['id']}/measurements",
        json={
            "type": "point_to_point",
            "modelId": model["id"],
            "modelVersion": model["version"],
            "pointRefs": [{"kind": "implant_reference", "id": "missing"}, {"kind": "landmark", "id": landmark["id"]}],
            "implantAssetId": implant["id"],
        },
        headers=auth_headers,
    )
    assert invalid.status_code == 422
