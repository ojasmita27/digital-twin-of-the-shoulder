import json
import os
import tempfile
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.storage.sqlite import SqliteCaseStore
import backend.app.routers.cases as cases_router
from backend.app.models.case import CaseCreateRequest, PatientDemographics, AnatomicalSide

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_test_database():
    """
    Creates an isolated temporary SQLite database for each test function,
    overriding the global case_store in the router so user data is never touched.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = tf.name

    test_store = SqliteCaseStore(db_path=temp_db_path)
    # Monkeypatch the router's store to point to our isolated test store
    original_store = cases_router.case_store
    cases_router.case_store = test_store

    yield test_store

    cases_router.case_store = original_store
    if os.path.exists(temp_db_path):
        try:
            os.remove(temp_db_path)
        except OSError:
            pass


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


def test_list_cases_empty():
    response = client.get("/api/cases")
    assert response.status_code == 200
    assert response.json() == []


def test_create_and_get_case():
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
    create_res = client.post("/api/cases", json=payload)
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
    list_res = client.get("/api/cases")
    assert list_res.status_code == 200
    cases_list = list_res.json()
    assert len(cases_list) == 1
    assert cases_list[0]["id"] == case_id

    # Verify fetching by ID
    get_res = client.get(f"/api/cases/{case_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == case_id


def test_get_case_not_found():
    response = client.get("/api/cases/SHL-9999-NONEXISTENT")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_delete_case():
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
    create_res = client.post("/api/cases", json=payload)
    case_id = create_res.json()["id"]

    delete_res = client.delete(f"/api/cases/{case_id}")
    assert delete_res.status_code == 204

    # Verify no longer exists
    get_res = client.get(f"/api/cases/{case_id}")
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


def test_invalid_input_handling():
    """Verify appropriate HTTP 422 Unprocessable Entity on schema validation failure."""
    # Missing required demographics field entirely
    res_bad = client.post("/api/cases", json={"name": "Malformed Case"})
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
    )
    assert res_bad_side.status_code == 422
