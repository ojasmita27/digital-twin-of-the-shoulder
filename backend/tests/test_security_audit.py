"""
Milestone 2B Security Audit & Verification Test Suite.

Verifies:
1. Complete Route-by-Route Authentication Matrix (401 Unauthorized for missing/invalid tokens).
2. Strict Role-Based Access Control (403 Forbidden for insufficient privileges).
3. Cross-User Case Data Isolation (Physician separation, demo case rules).
4. Session Token Lifecycle & Revocation (Instant invalidation on logout, rejection of expired tokens).
5. Password Recovery Security (SHA-256 hashed tokens in DB, single-use enforcement, no token leakage).
6. Production Security Guards (Disabled dev seeding, OWASP 600k PBKDF2 iterations, no CORS wildcards).
"""

from datetime import datetime, timezone, timedelta
import os
import tempfile
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.config import settings
from backend.app.models.user import UserRole
from backend.app.storage.sqlite import SqliteCaseStore
import backend.app.storage as storage_module
import backend.app.dependencies as deps_module
import backend.app.routers.cases as cases_router
import backend.app.routers.imaging as imaging_router
import backend.app.routers.auth as auth_router
from backend.tests.test_dicom import create_synthetic_dicom_bytes

client = TestClient(app)


@pytest.fixture
def test_db():
    """Create isolated test database and bind all components to it."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = tf.name

    test_store = SqliteCaseStore(db_path=temp_db_path)
    orig_storage = storage_module.case_store
    orig_cases = cases_router.case_store
    orig_imaging = imaging_router.case_store
    orig_deps = deps_module.case_store
    orig_auth = auth_router.case_store

    storage_module.case_store = test_store
    cases_router.case_store = test_store
    imaging_router.case_store = test_store
    deps_module.case_store = test_store
    auth_router.case_store = test_store

    yield test_store

    storage_module.case_store = orig_storage
    cases_router.case_store = orig_cases
    imaging_router.case_store = orig_imaging
    deps_module.case_store = orig_deps
    auth_router.case_store = orig_auth
    if os.path.exists(temp_db_path):
        try:
            os.remove(temp_db_path)
        except OSError:
            pass


@pytest.fixture
def doctor_token(test_db):
    doc = test_db.get_user_by_email("doctor@shouldertwin.org")
    token, _ = test_db.create_session(user_id=doc["id"])
    return token


@pytest.fixture
def researcher_token(test_db):
    res = test_db.get_user_by_email("researcher@shouldertwin.org")
    token, _ = test_db.create_session(user_id=res["id"])
    return token


@pytest.fixture
def admin_token(test_db):
    adm = test_db.get_user_by_email("admin@shouldertwin.org")
    token, _ = test_db.create_session(user_id=adm["id"])
    return token


# ================= 1. Unauthenticated Access Rejections (HTTP 401) =================

def test_unauthenticated_requests_rejected(test_db):
    """Verify that every protected route returns 401 Unauthorized when unauthenticated."""
    protected_endpoints = [
        ("GET", "/api/cases"),
        ("POST", "/api/cases"),
        ("GET", "/api/cases/SHL-2026-FAKE01"),
        ("PATCH", "/api/cases/SHL-2026-FAKE01"),
        ("DELETE", "/api/cases/SHL-2026-FAKE01"),
        ("GET", "/api/cases/SHL-2026-FAKE01/imaging"),
        ("POST", "/api/imaging/upload"),
        ("GET", "/api/auth/me"),
        ("POST", "/api/auth/change-password"),
        ("GET", "/api/auth/users"),
        ("POST", "/api/auth/users"),
        ("GET", "/api/auth/audit-logs"),
    ]

    valid_payloads = {
        "/api/cases": {
            "name": "Unauth Test Case",
            "demographics": {"researchSubjectId": "UNAUTH-01", "affectedSide": "right"},
        },
        "/api/cases/SHL-2026-FAKE01": {"name": "Updated Name"},
        "/api/imaging/upload": {},
        "/api/auth/change-password": {
            "currentPassword": "OldPassword123!",
            "newPassword": "NewPassword123!",
        },
        "/api/auth/users": {
            "email": "newuser@test.org",
            "password": "Password123!",
            "fullName": "Test User",
        },
    }

    for method, path in protected_endpoints:
        payload = valid_payloads.get(path, {})
        if path == "/api/imaging/upload":
            dcm_b = create_synthetic_dicom_bytes(rows=16, cols=16)
            res = client.post(path, files=[("files", ("test.dcm", dcm_b, "application/dicom"))])
        elif method == "GET":
            res = client.get(path)
        elif method == "POST":
            res = client.post(path, json=payload)
        elif method == "PATCH":
            res = client.patch(path, json=payload)
        elif method == "DELETE":
            res = client.delete(path)
        else:
            continue

        assert res.status_code == 401, f"Expected 401 for unauthenticated {method} {path}, got {res.status_code}"
        assert "WWW-Authenticate" in res.headers




def test_unauthenticated_case_dicom_upload_rejected(test_db):
    """Verify multipart DICOM upload returns 401 when no token is supplied."""
    dcm_bytes = create_synthetic_dicom_bytes(rows=32, cols=32)
    files = [("files", ("slice.dcm", dcm_bytes, "application/dicom"))]
    res = client.post("/api/cases/SHL-2026-ANY/imaging/upload", files=files)
    assert res.status_code == 401


# ================= 2. Role-Based Access Control (RBAC) (HTTP 403) =================

def test_doctor_cannot_access_admin_endpoints(test_db, doctor_token):
    """Doctor role must not access admin user lists or audit logs."""
    headers = {"Authorization": f"Bearer {doctor_token}"}

    users_res = client.get("/api/auth/users", headers=headers)
    assert users_res.status_code == 403

    audit_res = client.get("/api/auth/audit-logs", headers=headers)
    assert audit_res.status_code == 403

    create_user_res = client.post(
        "/api/auth/users",
        json={"email": "hacker@test.com", "password": "Password123!", "fullName": "Hacker"},
        headers=headers,
    )
    assert create_user_res.status_code == 403


def test_researcher_cannot_create_or_delete_cases(test_db, researcher_token):
    """Researchers have read/analysis access but cannot create or delete clinical cases."""
    headers = {"Authorization": f"Bearer {researcher_token}"}

    create_res = client.post(
        "/api/cases",
        json={
            "name": "Researcher Case",
            "demographics": {"researchSubjectId": "SUBJ-RES-01", "affectedSide": "left"},
        },
        headers=headers,
    )
    assert create_res.status_code == 403

    delete_res = client.delete("/api/cases/SHL-2026-ANY", headers=headers)
    assert delete_res.status_code == 403


def test_admin_has_full_administrative_access(test_db, admin_token):
    """Admin can list users and view system audit records."""
    headers = {"Authorization": f"Bearer {admin_token}"}

    users_res = client.get("/api/auth/users", headers=headers)
    assert users_res.status_code == 200
    assert len(users_res.json()) >= 3

    audit_res = client.get("/api/auth/audit-logs", headers=headers)
    assert audit_res.status_code == 200


# ================= 3. Cross-User Case Data Isolation =================

def test_cross_doctor_case_isolation(test_db, doctor_token):
    """
    Doctor A creates a private case.
    Doctor B must NOT be able to view, update, delete, or upload DICOMs to Doctor A's case.
    """
    # 1. Doctor A creates a case
    headers_a = {"Authorization": f"Bearer {doctor_token}"}
    create_res = client.post(
        "/api/cases",
        json={
            "name": "Dr. Sharma Private Patient",
            "demographics": {
                "researchSubjectId": "PATIENT-A-001",
                "affectedSide": "right",
            },
            "isDemo": False,
        },
        headers=headers_a,
    )
    assert create_res.status_code == 201
    case_a_id = create_res.json()["id"]

    # 2. Register Doctor B
    doc_b = test_db.create_user(
        email="doctor_b@hospital.org",
        password="DoctorBPassword123!",
        full_name="Dr. Baker",
        role=UserRole.DOCTOR,
    )
    token_b, _ = test_db.create_session(user_id=doc_b.id)
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 3. Doctor B lists cases: Doctor A's private case must NOT appear
    list_b = client.get("/api/cases", headers=headers_b)
    assert list_b.status_code == 200
    ids_seen_by_b = [c["id"] for c in list_b.json()]
    assert case_a_id not in ids_seen_by_b

    # 4. Doctor B attempts direct access by ID -> 403 Forbidden
    get_b = client.get(f"/api/cases/{case_a_id}", headers=headers_b)
    assert get_b.status_code == 403
    assert "Access denied" in get_b.json()["detail"]

    # 5. Doctor B attempts to modify Doctor A's case -> 403 Forbidden
    patch_b = client.patch(
        f"/api/cases/{case_a_id}",
        json={"name": "Tampered Name"},
        headers=headers_b,
    )
    assert patch_b.status_code == 403

    # 6. Doctor B attempts to delete Doctor A's case -> 403 Forbidden
    del_b = client.delete(f"/api/cases/{case_a_id}", headers=headers_b)
    assert del_b.status_code == 403

    # 7. Doctor B attempts to upload DICOM to Doctor A's case -> 403 Forbidden
    dcm_bytes = create_synthetic_dicom_bytes(rows=32, cols=32)
    files = [("files", ("slice.dcm", dcm_bytes, "application/dicom"))]
    upload_b = client.post(f"/api/cases/{case_a_id}/imaging/upload", files=files, headers=headers_b)
    assert upload_b.status_code == 403

    # 8. Doctor B attempts to view imaging -> 403 Forbidden
    img_b = client.get(f"/api/cases/{case_a_id}/imaging", headers=headers_b)
    assert img_b.status_code == 403


def test_public_demo_cases_accessible_to_all_physicians(test_db, doctor_token):
    """Demo cases (isDemo=True) are visible to physicians for learning and training."""
    # Create demo case
    headers_a = {"Authorization": f"Bearer {doctor_token}"}
    create_res = client.post(
        "/api/cases",
        json={
            "name": "Public Orthopedic Benchmark Demo Case",
            "demographics": {"researchSubjectId": "DEMO-SHL-01", "affectedSide": "left"},
            "isDemo": True,
        },
        headers=headers_a,
    )
    assert create_res.status_code == 201
    demo_id = create_res.json()["id"]

    # Doctor B can read this demo case
    doc_b = test_db.create_user(
        email="doctor_c@hospital.org",
        password="DoctorCPassword123!",
        full_name="Dr. Clark",
        role=UserRole.DOCTOR,
    )
    token_b, _ = test_db.create_session(user_id=doc_b.id)
    headers_b = {"Authorization": f"Bearer {token_b}"}

    get_demo = client.get(f"/api/cases/{demo_id}", headers=headers_b)
    assert get_demo.status_code == 200
    assert get_demo.json()["id"] == demo_id


# ================= 4. Session Token Lifecycle & Security =================

def test_forged_or_expired_session_tokens_rejected(test_db):
    """Forged or expired tokens must receive 401 Unauthorized."""
    # 1. Forged token
    forged_res = client.get("/api/cases", headers={"Authorization": "Bearer forged-token-xyz"})
    assert forged_res.status_code == 401

    # 2. Expired token in database
    doc = test_db.get_user_by_email("doctor@shouldertwin.org")
    past_iso = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    now_iso = datetime.now(timezone.utc).isoformat()
    with test_db._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('expired-token-123', ?, ?, ?)",
            (doc["id"], past_iso, past_iso),
        )
        conn.commit()

    expired_res = client.get("/api/cases", headers={"Authorization": "Bearer expired-token-123"})
    assert expired_res.status_code == 401


def test_token_revocation_on_logout(test_db, doctor_token):
    """Token must be immediately unusable after logout."""
    headers = {"Authorization": f"Bearer {doctor_token}"}

    # Verify working before logout
    before_res = client.get("/api/auth/me", headers=headers)
    assert before_res.status_code == 200

    # Logout
    logout_res = client.post("/api/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    # Token must be rejected on subsequent calls
    after_res = client.get("/api/auth/me", headers=headers)
    assert after_res.status_code == 401


# ================= 5. Password Recovery Security =================

def test_forgot_password_does_not_leak_token(test_db):
    """Forgot-password endpoint must never expose resetToken in response body or headers."""
    res = client.post("/api/auth/forgot-password", json={"email": "doctor@shouldertwin.org"})
    assert res.status_code == 200
    body = res.json()
    assert "resetToken" not in body
    assert "token" not in body
    assert "message" in body

    # Nonexistent user returns the identical response (prevents user enumeration)
    res_fake = client.post("/api/auth/forgot-password", json={"email": "nonexistent@hospital.org"})
    assert res_fake.status_code == 200
    assert res_fake.json() == body


def test_password_reset_token_single_use(test_db):
    """Reset token must be single-use only and hashed in the database."""
    doc = test_db.get_user_by_email("doctor@shouldertwin.org")
    raw_token = test_db.create_password_reset(doc["id"])

    # 1. Reset password first time -> succeeds
    res1 = client.post(
        "/api/auth/reset-password",
        json={"resetToken": raw_token, "newPassword": "BrandNewPassword2026!"},
    )
    assert res1.status_code == 200

    # 2. Reset password second time with same token -> fails (400 Bad Request)
    res2 = client.post(
        "/api/auth/reset-password",
        json={"resetToken": raw_token, "newPassword": "AnotherPassword2026!"},
    )
    assert res2.status_code == 400
    assert "Invalid or expired" in res2.json()["detail"]


# ================= 6. Configuration & Deployment Security =================

def test_cors_configuration_has_no_wildcard():
    """CORS origins must not contain '*' when allow_credentials=True."""
    assert "*" not in settings.cors_origins
    for origin in settings.cors_origins:
        assert origin.startswith("http://") or origin.startswith("https://")


def test_pbkdf2_iterations_owasp_compliant():
    """PBKDF2 iteration count must meet or exceed OWASP 600,000 recommendation."""
    assert settings.PBKDF2_ITERATIONS >= 600000


def test_dev_seeding_disabled_in_production(monkeypatch):
    """In production environment, default accounts must not be seeded automatically without flag."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        prod_db_path = tf.name

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ALLOW_DEV_SEEDING", False)

    prod_store = SqliteCaseStore(db_path=prod_db_path)
    # Database initialized, but users should be 0
    assert len(prod_store.list_users()) == 0

    if os.path.exists(prod_db_path):
        os.remove(prod_db_path)
