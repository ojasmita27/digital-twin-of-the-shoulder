"""
PostgreSQL storage adapter for ShoulderTwin using psycopg 3 + ConnectionPool.
Implements the same interface as SqliteCaseStore with explicit versioned migrations.
"""
from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from ..config import settings
from ..models.case import (
    AnatomicalSide,
    CaseCreateRequest,
    CaseStatus,
    PatientDemographics,
    ResearchCase,
)
from ..models.user import (
    AuditLogRecord,
    UserCreateRequest,
    UserProfile,
    UserRole,
)
from ..services.auth_service import (
    generate_reset_token,
    generate_session_token,
    hash_password,
    hash_token,
    verify_password,
)


class PostgresCaseStore:
    """PostgreSQL-backed store with connection pooling and versioned schema migrations."""

    def __init__(self, dsn: str):
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except ImportError as exc:
            raise RuntimeError(
                "psycopg[binary] and psycopg-pool are required when DATABASE_URL is set."
            ) from exc

        self._dsn = dsn
        self._pool = ConnectionPool(
            conninfo=dsn,
            min_size=1,
            max_size=10,
            kwargs={"row_factory": dict_row},
            open=True,
        )
        self._init_db()

    @contextmanager
    def _get_connection(self):
        with self._pool.connection() as conn:
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise

    def close(self) -> None:
        if hasattr(self, "_pool") and self._pool is not None:
            self._pool.close()

    def _init_db(self) -> None:
        """Apply explicit versioned PostgreSQL schema migrations safely under concurrency."""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_xact_lock(84729104)")
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version INTEGER PRIMARY KEY,
                        description TEXT NOT NULL,
                        applied_at TEXT NOT NULL
                    )
                    """
                )
                cur.execute("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations")
                current_version = int(cur.fetchone()["v"])

                if current_version < 1:
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS cases (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL,
                            is_demo BOOLEAN NOT NULL DEFAULT FALSE,
                            status TEXT NOT NULL DEFAULT 'created',
                            subject_id TEXT,
                            affected_side TEXT,
                            demographics_json TEXT NOT NULL,
                            imaging_json TEXT,
                            segmentation_job_json TEXT,
                            meshes_json TEXT NOT NULL DEFAULT '[]',
                            landmarks_json TEXT NOT NULL DEFAULT '[]',
                            measurements_json TEXT,
                            planning_measurements_json TEXT NOT NULL DEFAULT '[]',
                            implant_plan_json TEXT,
                            planning_versions_json TEXT NOT NULL DEFAULT '[]',
                            implant_assets_json TEXT NOT NULL DEFAULT '[]',
                            implant_reference_points_json TEXT NOT NULL DEFAULT '[]',
                            reports_json TEXT NOT NULL DEFAULT '[]',
                            viewer_preferences_json TEXT,
                            created_by_user_id TEXT,
                            is_archived BOOLEAN NOT NULL DEFAULT FALSE
                        )
                        """
                    )
                    cur.execute(
                        "CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC)"
                    )
                    cur.execute(
                        "CREATE INDEX IF NOT EXISTS idx_cases_subject_id ON cases(subject_id)"
                    )

                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS users (
                            id TEXT PRIMARY KEY,
                            email TEXT UNIQUE NOT NULL,
                            hashed_password TEXT NOT NULL,
                            salt TEXT NOT NULL,
                            full_name TEXT NOT NULL,
                            role TEXT NOT NULL,
                            title TEXT,
                            specialty TEXT,
                            organization TEXT,
                            is_active BOOLEAN NOT NULL DEFAULT TRUE,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL,
                            last_login_at TEXT
                        )
                        """
                    )
                    cur.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")

                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS sessions (
                            token TEXT PRIMARY KEY,
                            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                            created_at TEXT NOT NULL,
                            expires_at TEXT NOT NULL,
                            ip_address TEXT
                        )
                        """
                    )
                    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)")
                    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)")

                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS password_resets (
                            token TEXT PRIMARY KEY,
                            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                            created_at TEXT NOT NULL,
                            expires_at TEXT NOT NULL,
                            is_used BOOLEAN NOT NULL DEFAULT FALSE
                        )
                        """
                    )

                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS audit_logs (
                            id TEXT PRIMARY KEY,
                            user_id TEXT,
                            user_email TEXT,
                            action TEXT NOT NULL,
                            resource_type TEXT NOT NULL,
                            resource_id TEXT,
                            details_json TEXT NOT NULL DEFAULT '{}',
                            ip_address TEXT,
                            created_at TEXT NOT NULL
                        )
                        """
                    )
                    cur.execute(
                        "CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC)"
                    )

                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS digital_twin_versions (
                            id TEXT PRIMARY KEY,
                            case_id TEXT NOT NULL,
                            version_number INTEGER NOT NULL,
                            created_at TEXT NOT NULL,
                            user_id TEXT,
                            user_email TEXT,
                            segmentation_version INTEGER,
                            landmark_state_json TEXT NOT NULL DEFAULT '[]',
                            implant_state_json TEXT NOT NULL DEFAULT '{}',
                            measurement_state_json TEXT NOT NULL DEFAULT '[]',
                            model_refs_json TEXT NOT NULL DEFAULT '[]',
                            change_description TEXT NOT NULL DEFAULT '',
                            UNIQUE(case_id, version_number)
                        )
                        """
                    )
                    cur.execute(
                        "CREATE INDEX IF NOT EXISTS idx_dt_versions_case ON digital_twin_versions(case_id, version_number DESC)"
                    )

                    cur.execute(
                        "INSERT INTO schema_migrations (version, description, applied_at) VALUES (%s, %s, %s) ON CONFLICT (version) DO NOTHING",
                        (1, "Initial ShoulderTwin schema", datetime.now(timezone.utc).isoformat()),
                    )

                if current_version < 2:
                    # Migration 2: ensure users, cases, and password_resets have all SQLite parity columns
                    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TEXT")
                    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TEXT")
                    cur.execute("UPDATE users SET updated_at = created_at WHERE updated_at IS NULL")
                    cur.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS subject_id TEXT")
                    cur.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS affected_side TEXT")
                    cur.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS segmentation_job_json TEXT")
                    cur.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS planning_measurements_json TEXT NOT NULL DEFAULT '[]'")
                    cur.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS planning_versions_json TEXT NOT NULL DEFAULT '[]'")
                    cur.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS implant_assets_json TEXT NOT NULL DEFAULT '[]'")
                    cur.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS implant_reference_points_json TEXT NOT NULL DEFAULT '[]'")
                    cur.execute("ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS is_used BOOLEAN NOT NULL DEFAULT FALSE")
                    cur.execute(
                        "INSERT INTO schema_migrations (version, description, applied_at) VALUES (%s, %s, %s) ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description",
                        (2, "Add SQLite parity columns to users and cases", datetime.now(timezone.utc).isoformat()),
                    )

        self._seed_default_users()
        self._bootstrap_initial_admin()

    def _bootstrap_initial_admin(self) -> None:
        admin_email = os.getenv("INITIAL_ADMIN_EMAIL", "").strip().lower()
        admin_password = os.getenv("INITIAL_ADMIN_PASSWORD", "")
        if not admin_email or not admin_password:
            return
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS cnt FROM users")
                if int(cur.fetchone()["cnt"]) > 0:
                    return
                hashed, salt = hash_password(admin_password)
                now_iso = datetime.now(timezone.utc).isoformat()
                cur.execute(
                    """
                    INSERT INTO users (
                        id, email, hashed_password, salt, full_name, role,
                        title, specialty, organization, is_active, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s)
                    """,
                    (
                        f"usr-{uuid.uuid4().hex[:8]}",
                        admin_email,
                        hashed,
                        salt,
                        os.getenv("INITIAL_ADMIN_NAME", "Systems Administrator"),
                        UserRole.ADMIN.value,
                        "Lead Administrator",
                        "Medical Imaging Infrastructure",
                        "ShoulderTwin",
                        now_iso,
                        now_iso,
                    ),
                )

    def _seed_default_users(self) -> None:
        if not settings.ALLOW_DEV_SEEDING or settings.ENVIRONMENT == "production":
            return
        default_accounts = [
            {
                "email": "doctor@shouldertwin.org",
                "password": "DoctorPass123!",
                "fullName": "Dr. Sharma",
                "role": UserRole.DOCTOR.value,
                "title": "MD, FRCS (Tr & Orth)",
                "specialty": "Shoulder & Elbow Reconstruction",
                "organization": "Department of Orthopedic Surgery",
            },
            {
                "email": "researcher@shouldertwin.org",
                "password": "ResearcherPass123!",
                "fullName": "Dr. Sarah Chen",
                "role": UserRole.RESEARCHER.value,
                "title": "PhD",
                "specialty": "Computational Biomechanics & Morphometry",
                "organization": "Orthopedic Biomechanics Research Institute",
            },
            {
                "email": "admin@shouldertwin.org",
                "password": "AdminPass123!",
                "fullName": "Systems Administrator",
                "role": UserRole.ADMIN.value,
                "title": "Lead Administrator",
                "specialty": "Medical Imaging Infrastructure",
                "organization": "ShoulderTwin Core Operations",
            },
        ]
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                for acc in default_accounts:
                    cur.execute("SELECT id FROM users WHERE email = %s", (acc["email"],))
                    if not cur.fetchone():
                        hashed, salt = hash_password(acc["password"])
                        cur.execute(
                            """
                            INSERT INTO users (
                                id, email, hashed_password, salt, full_name, role,
                                title, specialty, organization, is_active, created_at, updated_at
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s)
                            """,
                            (
                                f"usr-{uuid.uuid4().hex[:8]}",
                                acc["email"],
                                hashed,
                                salt,
                                acc["fullName"],
                                acc["role"],
                                acc["title"],
                                acc["specialty"],
                                acc["organization"],
                                now_iso,
                                now_iso,
                            ),
                        )

    # ================= User & Session Management =================

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM users WHERE LOWER(email) = LOWER(%s)", (email.strip(),))
                row = cur.fetchone()
                return dict(row) if row else None

    def get_user_by_id(self, user_id: str) -> Optional[UserProfile]:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
                row = cur.fetchone()
                if not row:
                    return None
                return UserProfile(
                    id=row["id"],
                    email=row["email"],
                    fullName=row["full_name"],
                    role=UserRole(row["role"]),
                    title=row.get("title"),
                    specialty=row.get("specialty"),
                    organization=row.get("organization"),
                    isActive=bool(row["is_active"]),
                    createdAt=row["created_at"],
                    lastLoginAt=row.get("last_login_at"),
                )

    def list_users(self) -> List[UserProfile]:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM users ORDER BY created_at ASC")
                rows = cur.fetchall()
                return [
                    UserProfile(
                        id=r["id"],
                        email=r["email"],
                        fullName=r["full_name"],
                        role=UserRole(r["role"]),
                        title=r.get("title"),
                        specialty=r.get("specialty"),
                        organization=r.get("organization"),
                        isActive=bool(r["is_active"]),
                        createdAt=r["created_at"],
                        lastLoginAt=r.get("last_login_at"),
                    )
                    for r in rows
                ]

    def create_user(
        self,
        email: Any,
        password: Optional[str] = None,
        full_name: Optional[str] = None,
        role: Optional[UserRole] = None,
        title: Optional[str] = None,
        specialty: Optional[str] = None,
        organization: Optional[str] = None,
    ) -> UserProfile:
        """
        Creates a user account with cryptographically hashed password.
        Supports both direct keyword arguments and UserCreateRequest models.
        """
        if hasattr(email, "email") and hasattr(email, "password"):
            req = email
            email_val = req.email.strip().lower()
            password_val = req.password
            full_name_val = getattr(req, "fullName", getattr(req, "full_name", "")).strip()
            role_val = req.role.value if hasattr(req.role, "value") else str(req.role)
            title_val = getattr(req, "title", None)
            specialty_val = getattr(req, "specialty", None)
            org_val = getattr(req, "organization", None)
        else:
            email_val = str(email).strip().lower()
            password_val = password or ""
            full_name_val = full_name.strip() if full_name else ""
            role_val = role.value if hasattr(role, "value") else str(role)
            title_val = title
            specialty_val = specialty
            org_val = organization

        user_id = f"usr-{uuid.uuid4().hex[:8]}"
        hashed, salt = hash_password(password_val)
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (
                        id, email, hashed_password, salt, full_name, role,
                        title, specialty, organization, is_active, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s)
                    """,
                    (
                        user_id,
                        email_val,
                        hashed,
                        salt,
                        full_name_val,
                        role_val,
                        title_val,
                        specialty_val,
                        org_val,
                        now_iso,
                        now_iso,
                    ),
                )
        return self.get_user_by_id(user_id)  # type: ignore[return-value]

    def update_password(self, user_id: str, new_password: str) -> bool:
        hashed, salt = hash_password(new_password)
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE users SET hashed_password = %s, salt = %s, updated_at = %s WHERE id = %s",
                    (hashed, salt, now_iso, user_id),
                )
                cur.execute("DELETE FROM sessions WHERE user_id = %s", (user_id,))
                return cur.rowcount > 0

    def update_user_profile(
        self,
        user_id: str,
        full_name: Optional[str] = None,
        title: Optional[str] = None,
        specialty: Optional[str] = None,
        organization: Optional[str] = None,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
    ) -> Optional[UserProfile]:
        existing = self.get_user_by_id(user_id)
        if not existing:
            return None

        now_iso = datetime.now(timezone.utc).isoformat()
        updates: List[str] = ["updated_at = %s"]
        params: List[Any] = [now_iso]

        if full_name is not None:
            updates.append("full_name = %s")
            params.append(full_name.strip())
        if title is not None:
            updates.append("title = %s")
            params.append(title)
        if specialty is not None:
            updates.append("specialty = %s")
            params.append(specialty)
        if organization is not None:
            updates.append("organization = %s")
            params.append(organization)
        if role is not None:
            updates.append("role = %s")
            params.append(role.value if hasattr(role, "value") else str(role))
        if is_active is not None:
            updates.append("is_active = %s")
            params.append(bool(is_active))

        params.append(user_id)
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s", tuple(params))
        return self.get_user_by_id(user_id)

    def create_session(
        self,
        user_id: str,
        ip_address: Optional[str] = None,
        hours_valid: int = 24,
    ) -> Tuple[str, str]:
        token = generate_session_token()
        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=hours_valid)
        now_iso = now.isoformat()
        expires_iso = expires.isoformat()
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO sessions (token, user_id, created_at, expires_at, ip_address) VALUES (%s, %s, %s, %s, %s)",
                    (token, user_id, now_iso, expires_iso, ip_address),
                )
                cur.execute("UPDATE users SET last_login_at = %s WHERE id = %s", (now_iso, user_id))
        return token, expires_iso

    def get_user_by_session_token(self, token: str) -> Optional[UserProfile]:
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT u.* FROM users u
                    JOIN sessions s ON u.id = s.user_id
                    WHERE s.token = %s AND s.expires_at > %s AND u.is_active = TRUE
                    """,
                    (token, now_iso),
                )
                row = cur.fetchone()
                if not row:
                    return None
                return UserProfile(
                    id=row["id"],
                    email=row["email"],
                    fullName=row["full_name"],
                    role=UserRole(row["role"]),
                    title=row.get("title"),
                    specialty=row.get("specialty"),
                    organization=row.get("organization"),
                    isActive=bool(row["is_active"]),
                    createdAt=row["created_at"],
                    lastLoginAt=row.get("last_login_at"),
                )

    def delete_session(self, token: str) -> bool:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM sessions WHERE token = %s", (token,))
                return cur.rowcount > 0

    def create_password_reset(self, user_id: str, minutes_valid: int = 60) -> str:
        raw_token = generate_reset_token()
        hashed_token = hash_token(raw_token)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=minutes_valid)

        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO password_resets (token, user_id, created_at, expires_at, is_used) VALUES (%s, %s, %s, %s, FALSE)",
                    (hashed_token, user_id, now.isoformat(), expires_at.isoformat()),
                )
        return raw_token

    def verify_and_use_reset_token(self, token: str) -> Optional[str]:
        now_iso = datetime.now(timezone.utc).isoformat()
        hashed_token = hash_token(token)
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT user_id, expires_at, is_used FROM password_resets WHERE token = %s AND expires_at > %s AND is_used = FALSE",
                    (hashed_token, now_iso),
                )
                row = cur.fetchone()
                if not row:
                    return None
                user_id = row["user_id"]
                cur.execute("UPDATE password_resets SET is_used = TRUE WHERE token = %s", (hashed_token,))
                return user_id

    # ================= Audit Logging =================

    def log_audit(
        self,
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ) -> AuditLogRecord:
        log_id = f"aud-{uuid.uuid4().hex[:10]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        details_dict = details or {}
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO audit_logs (
                        id, user_id, user_email, action, resource_type, resource_id,
                        details_json, ip_address, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        log_id,
                        user_id,
                        user_email,
                        action,
                        resource_type,
                        resource_id,
                        json.dumps(details_dict),
                        ip_address,
                        now_iso,
                    ),
                )
        return AuditLogRecord(
            id=log_id,
            userId=user_id,
            userEmail=user_email,
            action=action,
            resourceType=resource_type,
            resourceId=resource_id,
            details=details_dict,
            ipAddress=ip_address,
            createdAt=now_iso,
        )

    def list_audit_logs(self, limit: int = 50) -> List[AuditLogRecord]:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT %s", (limit,))
                rows = cur.fetchall()
                return [
                    AuditLogRecord(
                        id=r["id"],
                        userId=r["user_id"],
                        userEmail=r["user_email"],
                        action=r["action"],
                        resourceType=r["resource_type"],
                        resourceId=r["resource_id"],
                        details=json.loads(r["details_json"] or "{}"),
                        ipAddress=r["ip_address"],
                        createdAt=r["created_at"],
                    )
                    for r in rows
                ]

    # ================= Case Storage =================

    def _row_to_case(self, row: Dict[str, Any]) -> ResearchCase:
        demographics_data = json.loads(row["demographics_json"])
        demographics = PatientDemographics(
            researchSubjectId=demographics_data.get("researchSubjectId", row.get("subject_id") or ""),
            ageBand=demographics_data.get("ageBand", "61-75"),
            biologicalSex=demographics_data.get("biologicalSex", "undisclosed"),
            indication=demographics_data.get("indication", "Primary Osteoarthritis"),
            affectedSide=AnatomicalSide(demographics_data.get("affectedSide", row.get("affected_side") or "right")),
        )
        return ResearchCase(
            id=row["id"],
            name=row["name"],
            createdAt=row["created_at"],
            updatedAt=row["updated_at"],
            status=CaseStatus(row["status"]),
            createdByUserId=row.get("created_by_user_id"),
            isArchived=bool(row.get("is_archived", False)),
            demographics=demographics,
            imaging=json.loads(row["imaging_json"]) if row.get("imaging_json") else None,
            segmentationJob=json.loads(row.get("segmentation_job_json") or row.get("segmentation_json") or "null") if (row.get("segmentation_job_json") or row.get("segmentation_json")) else None,
            meshes=json.loads(row["meshes_json"]) if row.get("meshes_json") else [],
            landmarks=json.loads(row["landmarks_json"]) if row.get("landmarks_json") else [],
            measurements=json.loads(row["measurements_json"]) if row.get("measurements_json") else None,
            implantPlan=json.loads(row["implant_plan_json"]) if row.get("implant_plan_json") else None,
            planningVersions=json.loads(row["planning_versions_json"]) if row.get("planning_versions_json") else [],
            implantAssets=json.loads(row["implant_assets_json"]) if row.get("implant_assets_json") else [],
            implantReferencePoints=json.loads(row["implant_reference_points_json"]) if row.get("implant_reference_points_json") else [],
            planningMeasurements=json.loads(row["planning_measurements_json"]) if row.get("planning_measurements_json") else [],
            reports=json.loads(row["reports_json"]) if row.get("reports_json") else [],
            viewerPreferences=json.loads(row["viewer_preferences_json"]) if row.get("viewer_preferences_json") else None,
            isDemo=bool(row.get("is_demo", False)),
        )

    def user_can_access_case(self, user: UserProfile, case: ResearchCase) -> bool:
        if user.role == UserRole.ADMIN:
            return True
        if case.isDemo:
            return True
        if user.role == UserRole.DOCTOR:
            return bool(case.createdByUserId and case.createdByUserId == user.id)
        if user.role == UserRole.RESEARCHER:
            return True
        return False

    def user_can_modify_case(self, user: UserProfile, case: ResearchCase) -> bool:
        if user.role == UserRole.ADMIN:
            return True
        if user.role == UserRole.DOCTOR:
            if case.createdByUserId and case.createdByUserId == user.id:
                return True
            if case.isDemo:
                return True
            return False
        return False

    def list_cases_for_user(self, user: UserProfile, include_archived: bool = False) -> List[ResearchCase]:
        all_cases = self.list_cases(include_archived=include_archived)
        return [c for c in all_cases if self.user_can_access_case(user, c)]

    def list_cases(self, include_archived: bool = False) -> List[ResearchCase]:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                if include_archived:
                    cur.execute("SELECT * FROM cases ORDER BY created_at DESC")
                else:
                    cur.execute("SELECT * FROM cases WHERE is_archived = FALSE ORDER BY created_at DESC")
                return [self._row_to_case(r) for r in cur.fetchall()]

    def get_case(self, case_id: str) -> Optional[ResearchCase]:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM cases WHERE id = %s", (case_id,))
                row = cur.fetchone()
                return self._row_to_case(row) if row else None

    def create_case(self, req: CaseCreateRequest, created_by_user_id: Optional[str] = None) -> ResearchCase:
        timestamp_slug = uuid.uuid4().hex[:6].upper()
        case_id = f"SHL-2026-{timestamp_slug}"
        now_iso = datetime.now(timezone.utc).isoformat()
        demographics_dict = req.demographics.model_dump() if hasattr(req.demographics, "model_dump") else dict(req.demographics)
        demographics_json = json.dumps(demographics_dict)
        is_demo_bool = bool(req.isDemo)

        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO cases (
                        id, name, created_at, updated_at, is_demo, status,
                        subject_id, affected_side, demographics_json,
                        imaging_json, segmentation_job_json, meshes_json,
                        landmarks_json, measurements_json, planning_measurements_json,
                        implant_plan_json, planning_versions_json, implant_assets_json,
                        implant_reference_points_json, reports_json, viewer_preferences_json,
                        created_by_user_id, is_archived
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s,
                        %s, %s, %s,
                        NULL, NULL, '[]',
                        '[]', NULL, '[]',
                        NULL, '[]', '[]',
                        '[]', '[]', NULL,
                        %s, FALSE
                    )
                    """,
                    (
                        case_id,
                        req.name,
                        now_iso,
                        now_iso,
                        is_demo_bool,
                        CaseStatus.created.value if hasattr(CaseStatus.created, "value") else str(CaseStatus.created),
                        req.demographics.researchSubjectId,
                        req.demographics.affectedSide.value if hasattr(req.demographics.affectedSide, "value") else str(req.demographics.affectedSide),
                        demographics_json,
                        created_by_user_id,
                    ),
                )
        return self.get_case(case_id)  # type: ignore[return-value]

    def update_case(self, case_id: str, updates: Dict[str, Any]) -> Optional[ResearchCase]:
        existing = self.get_case(case_id)
        if not existing:
            return None

        now_iso = datetime.now(timezone.utc).isoformat()
        name = updates.get("name", existing.name)
        status = updates.get("status", existing.status)
        status_val = status.value if hasattr(status, "value") else str(status)

        demographics = updates.get("demographics", existing.demographics)
        if isinstance(demographics, dict):
            demographics = PatientDemographics(**demographics)
        demographics_dict = demographics.model_dump() if hasattr(demographics, "model_dump") else dict(demographics)
        demographics_json = json.dumps(demographics_dict)
        affected_side_val = demographics.affectedSide.value if hasattr(demographics.affectedSide, "value") else str(demographics.affectedSide)

        imaging = updates.get("imaging", existing.imaging)
        imaging_json = json.dumps(imaging) if imaging is not None else None

        segmentation_job = updates.get("segmentationJob", existing.segmentationJob)
        segmentation_job_json = json.dumps(segmentation_job) if segmentation_job is not None else None

        meshes = updates.get("meshes", existing.meshes)
        meshes_json = json.dumps(meshes if isinstance(meshes, list) and (not meshes or isinstance(meshes[0], dict)) else [m.model_dump() if hasattr(m, "model_dump") else dict(m) for m in meshes]) if meshes is not None else "[]"

        landmarks = updates.get("landmarks", existing.landmarks)
        landmarks_json = json.dumps(landmarks if isinstance(landmarks, list) and (not landmarks or isinstance(landmarks[0], dict)) else [l.model_dump() if hasattr(l, "model_dump") else dict(l) for l in landmarks]) if landmarks is not None else "[]"

        measurements = updates.get("measurements", existing.measurements)
        measurements_json = json.dumps(measurements if isinstance(measurements, dict) else (measurements.model_dump() if hasattr(measurements, "model_dump") else dict(measurements))) if measurements is not None else None

        implant_plan = updates.get("implantPlan", existing.implantPlan)
        implant_plan_json = json.dumps(implant_plan if isinstance(implant_plan, dict) else (implant_plan.model_dump() if hasattr(implant_plan, "model_dump") else dict(implant_plan))) if implant_plan is not None else None

        planning_versions = updates.get("planningVersions", existing.planningVersions)
        planning_versions_json = json.dumps(planning_versions) if planning_versions is not None else "[]"

        implant_assets = updates.get("implantAssets", existing.implantAssets)
        implant_assets_json = json.dumps(implant_assets) if implant_assets is not None else "[]"

        implant_reference_points = updates.get("implantReferencePoints", existing.implantReferencePoints)
        implant_reference_points_json = json.dumps(implant_reference_points) if implant_reference_points is not None else "[]"

        planning_measurements = updates.get("planningMeasurements", existing.planningMeasurements)
        planning_measurements_json = json.dumps(planning_measurements) if planning_measurements is not None else "[]"

        reports = updates.get("reports", existing.reports)
        reports_json = json.dumps(reports) if reports is not None else "[]"

        viewer_preferences = updates.get("viewerPreferences", existing.viewerPreferences)
        viewer_preferences_json = json.dumps(viewer_preferences if isinstance(viewer_preferences, dict) else (viewer_preferences.model_dump() if hasattr(viewer_preferences, "model_dump") else dict(viewer_preferences))) if viewer_preferences is not None else None

        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE cases SET
                        name = %s,
                        updated_at = %s,
                        status = %s,
                        subject_id = %s,
                        affected_side = %s,
                        demographics_json = %s,
                        imaging_json = %s,
                        segmentation_job_json = %s,
                        meshes_json = %s,
                        landmarks_json = %s,
                        measurements_json = %s,
                        implant_plan_json = %s,
                        planning_versions_json = %s,
                        implant_assets_json = %s,
                        implant_reference_points_json = %s,
                        planning_measurements_json = %s,
                        reports_json = %s,
                        viewer_preferences_json = %s
                    WHERE id = %s
                    """,
                    (
                        name,
                        now_iso,
                        status_val,
                        demographics.researchSubjectId,
                        affected_side_val,
                        demographics_json,
                        imaging_json,
                        segmentation_job_json,
                        meshes_json,
                        landmarks_json,
                        measurements_json,
                        implant_plan_json,
                        planning_versions_json,
                        implant_assets_json,
                        implant_reference_points_json,
                        planning_measurements_json,
                        reports_json,
                        viewer_preferences_json,
                        case_id,
                    ),
                )
        return self.get_case(case_id)

    def archive_case(self, case_id: str) -> bool:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE cases SET is_archived = TRUE WHERE id = %s", (case_id,))
                return cur.rowcount > 0

    def delete_case(self, case_id: str) -> bool:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM cases WHERE id = %s", (case_id,))
                return cur.rowcount > 0

    def clear(self) -> None:
        if settings.ENVIRONMENT == "production":
            raise RuntimeError("clear() is disabled in production.")
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM digital_twin_versions")
                cur.execute("DELETE FROM cases")

    # ================= Digital Twin Versions =================

    def create_digital_twin_version(
        self,
        case_id: str,
        user_id: Optional[str],
        user_email: Optional[str],
        segmentation_version: Optional[int],
        landmarks: List[Dict[str, Any]],
        implant_plan: Dict[str, Any],
        measurements: List[Dict[str, Any]],
        model_refs: List[Dict[str, Any]],
        change_description: str = "",
    ) -> Dict[str, Any]:
        version_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COALESCE(MAX(version_number), 0) AS max_v FROM digital_twin_versions WHERE case_id = %s",
                    (case_id,),
                )
                next_ver = int(cur.fetchone()["max_v"]) + 1
                cur.execute(
                    """
                    INSERT INTO digital_twin_versions (
                        id, case_id, version_number, created_at, user_id, user_email,
                        segmentation_version, landmark_state_json, implant_state_json,
                        measurement_state_json, model_refs_json, change_description
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        version_id,
                        case_id,
                        next_ver,
                        now,
                        user_id,
                        user_email,
                        segmentation_version,
                        json.dumps(landmarks),
                        json.dumps(implant_plan),
                        json.dumps(measurements),
                        json.dumps(model_refs),
                        change_description or f"Digital twin snapshot v{next_ver}",
                    ),
                )
        return self.get_digital_twin_version(case_id, next_ver)  # type: ignore[return-value]

    def list_digital_twin_versions(self, case_id: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM digital_twin_versions WHERE case_id = %s ORDER BY version_number DESC",
                    (case_id,),
                )
                return [self._row_to_version(r) for r in cur.fetchall()]

    def get_digital_twin_version(self, case_id: str, version_number: int) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM digital_twin_versions WHERE case_id = %s AND version_number = %s",
                    (case_id, version_number),
                )
                row = cur.fetchone()
                return self._row_to_version(row) if row else None

    @staticmethod
    def _row_to_version(row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "caseId": row["case_id"],
            "versionNumber": int(row["version_number"]),
            "createdAt": row["created_at"],
            "userId": row["user_id"],
            "userEmail": row["user_email"],
            "segmentationVersion": row["segmentation_version"],
            "landmarks": json.loads(row["landmark_state_json"] or "[]"),
            "implantPlan": json.loads(row["implant_state_json"] or "{}"),
            "measurements": json.loads(row["measurement_state_json"] or "[]"),
            "modelRefs": json.loads(row["model_refs_json"] or "[]"),
            "changeDescription": row["change_description"],
        }
