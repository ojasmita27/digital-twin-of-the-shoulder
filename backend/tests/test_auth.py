"""
Tests for ShoulderTwin Authentication, Password Hashing, RBAC, and Sessions.
"""

import tempfile
import os
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.storage.sqlite import SqliteCaseStore
import backend.app.storage as storage_module
import backend.app.dependencies as deps_module
import backend.app.routers.auth as auth_router
import backend.app.routers.cases as cases_router
from backend.app.services.auth_service import hash_password, verify_password


@pytest.fixture
def client():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = tf.name

    test_store = SqliteCaseStore(db_path=temp_db_path)
    orig_storage = storage_module.case_store
    orig_deps = deps_module.case_store
    orig_auth = auth_router.case_store
    orig_cases = cases_router.case_store

    storage_module.case_store = test_store
    deps_module.case_store = test_store
    auth_router.case_store = test_store
    cases_router.case_store = test_store

    yield TestClient(app)

    storage_module.case_store = orig_storage
    deps_module.case_store = orig_deps
    auth_router.case_store = orig_auth
    cases_router.case_store = orig_cases
    if os.path.exists(temp_db_path):
        try:
            os.remove(temp_db_path)
        except OSError:
            pass



def test_password_hashing_and_salting():
    pw = "SuperSecureOrthopedicPassword2026!"
    hashed, salt = hash_password(pw)
    assert hashed != pw
    assert len(hashed) == 64  # SHA256 hex digest length
    assert len(salt) == 64    # 32 bytes hex length
    assert verify_password(pw, hashed, salt) is True
    assert verify_password("WrongPassword!", hashed, salt) is False


def test_login_success_doctor(client):
    res = client.post(
        "/api/auth/login",
        json={"email": "doctor@shouldertwin.org", "password": "DoctorPass123!"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "token" in data
    assert data["tokenType"] == "Bearer"
    assert data["user"]["email"] == "doctor@shouldertwin.org"
    assert data["user"]["role"] == "doctor"
    assert data["user"]["fullName"] == "Dr. Sharma"


def test_login_failure_wrong_password(client):
    res = client.post(
        "/api/auth/login",
        json={"email": "doctor@shouldertwin.org", "password": "IncorrectPassword!"},
    )
    assert res.status_code == 401
    assert "Invalid email or password" in res.json()["detail"]


def test_login_failure_unknown_user(client):
    res = client.post(
        "/api/auth/login",
        json={"email": "nobody@hospital.org", "password": "SomePassword123!"},
    )
    assert res.status_code == 401


def test_me_endpoint_with_bearer_token(client):
    # 1. Login to get token
    login_res = client.post(
        "/api/auth/login",
        json={"email": "researcher@shouldertwin.org", "password": "ResearcherPass123!"},
    )
    token = login_res.json()["token"]

    # 2. Call /api/auth/me with Bearer token
    res = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    user = res.json()
    assert user["email"] == "researcher@shouldertwin.org"
    assert user["role"] == "researcher"


def test_me_endpoint_unauthorized_without_token(client):
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_rbac_admin_only_endpoints(client):
    # Doctor tries to access admin users list -> 403 Forbidden
    doc_res = client.post(
        "/api/auth/login",
        json={"email": "doctor@shouldertwin.org", "password": "DoctorPass123!"},
    )
    doc_token = doc_res.json()["token"]
    forbidden_res = client.get(
        "/api/auth/users",
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert forbidden_res.status_code == 403

    # Admin accesses admin users list -> 200 OK
    admin_res = client.post(
        "/api/auth/login",
        json={"email": "admin@shouldertwin.org", "password": "AdminPass123!"},
    )
    admin_token = admin_res.json()["token"]
    ok_res = client.get(
        "/api/auth/users",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert ok_res.status_code == 200
    users = ok_res.json()
    assert len(users) >= 3


def test_forgot_and_reset_password_flow(client):
    # 1. Request forgot password - verify token is NOT leaked in API response
    forgot_res = client.post(
        "/api/auth/forgot-password",
        json={"email": "doctor@shouldertwin.org"},
    )
    assert forgot_res.status_code == 200
    # Must NOT expose resetToken in response
    assert "resetToken" not in forgot_res.json() or forgot_res.json().get("resetToken") is None
    assert "message" in forgot_res.json()

    # 2. In secure backend flow, raw token is generated and hashed in DB
    user_record = storage_module.case_store.get_user_by_email("doctor@shouldertwin.org")
    assert user_record is not None
    raw_token = storage_module.case_store.create_password_reset(user_record["id"])


    # 3. Reset password using valid raw token
    new_pw = "DoctorNewPass2026!"
    reset_res = client.post(
        "/api/auth/reset-password",
        json={"resetToken": raw_token, "newPassword": new_pw},
    )
    assert reset_res.status_code == 200

    # 4. Single-use token enforcement: reusing the token must fail with 400
    reuse_res = client.post(
        "/api/auth/reset-password",
        json={"resetToken": raw_token, "newPassword": "AnotherPassword2026!"},
    )
    assert reuse_res.status_code == 400


    # 3. Old password should fail
    fail_res = client.post(
        "/api/auth/login",
        json={"email": "doctor@shouldertwin.org", "password": "DoctorPass123!"},
    )
    assert fail_res.status_code == 401

    # 4. New password should succeed
    succ_res = client.post(
        "/api/auth/login",
        json={"email": "doctor@shouldertwin.org", "password": new_pw},
    )
    assert succ_res.status_code == 200

    # Reset back to baseline for subsequent test runs
    doc_token = succ_res.json()["token"]
    client.post(
        "/api/auth/change-password",
        json={"currentPassword": new_pw, "newPassword": "DoctorPass123!"},
        headers={"Authorization": f"Bearer {doc_token}"},
    )


def test_logout_invalidates_token(client):
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin@shouldertwin.org", "password": "AdminPass123!"},
    )
    token = login_res.json()["token"]

    # Valid before logout
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200

    # Logout
    logout_res = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_res.status_code == 200

    # Invalid after logout
    me_after = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_after.status_code == 401


def test_audit_logs_record_actions(client):
    admin_res = client.post(
        "/api/auth/login",
        json={"email": "admin@shouldertwin.org", "password": "AdminPass123!"},
    )
    token = admin_res.json()["token"]
    audit_res = client.get("/api/auth/audit-logs", headers={"Authorization": f"Bearer {token}"})
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert len(logs) > 0
    actions = [log["action"] for log in logs]
    assert "LOGIN_SUCCESS" in actions
