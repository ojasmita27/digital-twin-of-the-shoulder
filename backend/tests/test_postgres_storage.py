"""Automated tests for SqliteCaseStore and PostgresCaseStore parity and remediation."""
from __future__ import annotations

import ast
import json
import os
import sqlite3
import sys
import tempfile
import types
import unittest

# Ensure repo root is on python path
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

# If pydantic is not installed in the local execution environment, install a lightweight shim
# so that model schemas can be parsed and exercised without external pip dependencies.
if "pydantic" not in sys.modules:
    try:
        import pydantic  # noqa: F401
    except ImportError:
        pyd = types.ModuleType("pydantic")

        class BaseModel:
            def __init__(self, **kwargs):
                for k, v in kwargs.items():
                    setattr(self, k, v)

            def model_dump(self):
                return {k: (v.value if hasattr(v, "value") else v) for k, v in self.__dict__.items()}

            def dict(self):
                return self.model_dump()

        def Field(default=None, *args, **kwargs):
            default_factory = kwargs.get("default_factory")
            if default_factory is not None:
                return default_factory()
            return default if default is not Ellipsis else None

        class EmailStr(str):
            pass

        pyd.BaseModel = BaseModel
        pyd.Field = Field
        pyd.EmailStr = EmailStr
        sys.modules["pydantic"] = pyd

try:
    import pytest
except ImportError:
    pytest = None


class TestStorageInterfaceParity(unittest.TestCase):
    """Verify that SqliteCaseStore and PostgresCaseStore have identical public signatures."""

    def test_method_signatures_parity(self):
        sqlite_file = os.path.join(_REPO_ROOT, "backend/app/storage/sqlite.py")
        postgres_file = os.path.join(_REPO_ROOT, "backend/app/storage/postgres.py")

        def extract_methods(path):
            with open(path, "r", encoding="utf-8") as f:
                tree = ast.parse(f.read())
            methods = {}
            for node in tree.body:
                if isinstance(node, ast.ClassDef) and "CaseStore" in node.name:
                    for item in node.body:
                        if isinstance(item, ast.FunctionDef):
                            args = [a.arg for a in item.args.args]
                            methods[item.name] = args
            return methods

        sq_methods = extract_methods(sqlite_file)
        pg_methods = extract_methods(postgres_file)

        # 1. Check all public SQLite methods exist in Postgres
        for m, args in sq_methods.items():
            if m.startswith("_"):
                continue
            self.assertIn(m, pg_methods, f"Public method {m} is in SqliteCaseStore but missing in PostgresCaseStore")
            self.assertEqual(
                args,
                pg_methods[m],
                f"Signature mismatch for {m}: sqlite={args} vs postgres={pg_methods[m]}",
            )

        # 2. Check create_user parameters
        expected_create_user = [
            "self",
            "email",
            "password",
            "full_name",
            "role",
            "title",
            "specialty",
            "organization",
        ]
        self.assertEqual(sq_methods["create_user"], expected_create_user)
        self.assertEqual(pg_methods["create_user"], expected_create_user)

        # 3. Check log_audit parameter ordering
        expected_log_audit = [
            "self",
            "action",
            "resource_type",
            "resource_id",
            "user_id",
            "user_email",
            "details",
            "ip_address",
        ]
        self.assertEqual(sq_methods["log_audit"], expected_log_audit)
        self.assertEqual(pg_methods["log_audit"], expected_log_audit)


class TestMigrationRobustness(unittest.TestCase):
    """Verify that migrate_sqlite_to_postgres handles legacy SQLite databases without digital_twin_versions."""

    def test_dry_run_on_legacy_sqlite(self):
        from backend.scripts.migrate_sqlite_to_postgres import migrate

        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
            db_path = tf.name

        try:
            # Create a legacy SQLite database that DOES NOT have digital_twin_versions
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute(
                """
                CREATE TABLE users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    hashed_password TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    full_name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    title TEXT,
                    specialty TEXT,
                    organization TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE cases (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    is_demo INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'created',
                    demographics_json TEXT NOT NULL
                )
                """
            )
            cur.execute(
                """
                INSERT INTO users (id, email, hashed_password, salt, full_name, role, is_active, created_at)
                VALUES ('usr-test1', 'test@shouldertwin.org', 'hash', 'salt', 'Dr Test', 'doctor', 1, '2026-01-01T00:00:00')
                """
            )
            conn.commit()
            conn.close()

            # Must execute dry-run without throwing sqlite3.OperationalError: no such table: digital_twin_versions
            migrate(sqlite_path=db_path, postgres_dsn="", apply=False)

        finally:
            if os.path.exists(db_path):
                os.remove(db_path)


class TestSqliteCaseStoreRemediation(unittest.TestCase):
    """Verify SqliteCaseStore create_user handles both keyword arguments and UserCreateRequest."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.tmp_dir, "test_store.db")

    def tearDown(self):
        if os.path.exists(self.db_path):
            os.remove(self.db_path)
        if os.path.exists(self.tmp_dir):
            os.rmdir(self.tmp_dir)

    def test_create_user_with_keyword_arguments(self):
        from backend.app.models.user import UserRole
        from backend.app.storage.sqlite import SqliteCaseStore

        store = SqliteCaseStore(db_path=self.db_path)
        user = store.create_user(
            email="kwtest@shouldertwin.org",
            password="StrongPassword123!",
            full_name="Dr. Keyword Test",
            role=UserRole.DOCTOR,
            title="MD",
            specialty="Orthopedics",
            organization="Hospital",
        )
        self.assertEqual(user.email, "kwtest@shouldertwin.org")
        self.assertEqual(user.fullName, "Dr. Keyword Test")
        self.assertEqual(user.role, UserRole.DOCTOR)
        self.assertEqual(user.title, "MD")

    def test_create_user_with_request_model(self):
        from backend.app.models.user import UserCreateRequest, UserRole
        from backend.app.storage.sqlite import SqliteCaseStore

        store = SqliteCaseStore(db_path=self.db_path)
        req = UserCreateRequest(
            email="modeltest@shouldertwin.org",
            password="ModelPassword123!",
            fullName="Dr. Model Test",
            role=UserRole.RESEARCHER,
            title="PhD",
            specialty="Biomechanics",
            organization="Institute",
        )
        user = store.create_user(req)
        self.assertEqual(user.email, "modeltest@shouldertwin.org")
        self.assertEqual(user.fullName, "Dr. Model Test")
        self.assertEqual(user.role, UserRole.RESEARCHER)

    def test_log_audit_signature_and_return(self):
        from backend.app.storage.sqlite import SqliteCaseStore

        store = SqliteCaseStore(db_path=self.db_path)
        record = store.log_audit(
            action="TEST_ACTION",
            resource_type="case",
            resource_id="SHL-2026-TEST",
            user_id="usr-123",
            user_email="test@shouldertwin.org",
            details={"key": "val"},
            ip_address="127.0.0.1",
        )
        self.assertIsNotNone(record)
        self.assertEqual(record.action, "TEST_ACTION")
        self.assertEqual(record.resourceType, "case")
        self.assertEqual(record.resourceId, "SHL-2026-TEST")
        self.assertEqual(record.userId, "usr-123")
        self.assertEqual(record.details, {"key": "val"})


def test_postgres_store_parity():
    """Live PostgreSQL integration test when TEST_DATABASE_URL is provided."""
    dsn = os.getenv("TEST_DATABASE_URL", "").strip()
    if not dsn:
        if pytest:
            pytest.skip("TEST_DATABASE_URL not set; skipping live PostgreSQL adapter test.")
        else:
            return
    from backend.app.storage.postgres import PostgresCaseStore

    store = PostgresCaseStore(dsn=dsn)
    try:
        store._init_db()
    finally:
        store.close()


if __name__ == "__main__":
    unittest.main()
