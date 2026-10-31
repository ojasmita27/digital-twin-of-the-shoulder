"""
SQLite-backed Storage Repository for Digital Twin of the Shoulder.

PERSISTENCE BEHAVIOR:
- Data persists across server restarts in a local SQLite file (default: data/shoulder_twin.db).
- User accounts, cryptographically hashed passwords with salt, active sessions, password reset tokens,
  and comprehensive audit logs are maintained in relational SQLite tables.
- All ResearchCase fields (including nested demographics, imaging, segmentation,
  meshes, landmarks, measurements, implant plan, and clinical reports) are fully serialized and retained.
- Uses parameterized SQL queries exclusively.
"""

from datetime import datetime, timezone, timedelta
import json
import os
import sqlite3
import uuid
from typing import Any, Dict, List, Optional, Tuple
from ..config import settings
from ..models.case import ResearchCase, CaseCreateRequest, CaseStatus, PatientDemographics, AnatomicalSide
from ..models.user import UserProfile, UserRole, AuditLogRecord
from ..services.auth_service import hash_password, verify_password, generate_session_token, generate_reset_token, hash_token


def _dump_model(model: Any) -> Dict[str, Any]:
    """Resilient Pydantic v1 (.dict()) and v2 (.model_dump()) serializer."""
    if hasattr(model, "model_dump"):
        return model.model_dump()
    if hasattr(model, "dict"):
        return model.dict()
    if isinstance(model, dict):
        return model
    return dict(model)


class SqliteCaseStore:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or settings.DATABASE_PATH
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        # Ensure parent directory exists
        parent_dir = os.path.dirname(os.path.abspath(self.db_path))
        if parent_dir and not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)

        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Create database tables and indices if they do not exist, and seed baseline accounts."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA foreign_keys = ON;")
            
            # 1. Cases table

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS cases (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    is_demo INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'created',
                    subject_id TEXT NOT NULL,
                    affected_side TEXT NOT NULL,
                    demographics_json TEXT NOT NULL,
                    imaging_json TEXT,
                    segmentation_job_json TEXT,
                    meshes_json TEXT NOT NULL DEFAULT '[]',
                    landmarks_json TEXT NOT NULL DEFAULT '[]',
                    measurements_json TEXT,
                    implant_plan_json TEXT,
                    reports_json TEXT NOT NULL DEFAULT '[]',
                    created_by_user_id TEXT,
                    is_archived INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_cases_subject_id ON cases(subject_id)"
            )

            # 2. Users table with salt and hashed passwords (never plaintext)
            cursor.execute(
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
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_login_at TEXT
                )
                """
            )
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")

            # 3. Active Sessions table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    ip_address TEXT,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )
                """
            )
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)")

            # 4. Password Resets table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS password_resets (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    is_used INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )
                """
            )

            # 5. Audit Logs table
            cursor.execute(
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
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC)")

            conn.commit()

        # Seed initial default users if none exist
        self._seed_default_users()

    def _seed_default_users(self) -> None:
        """Seed initial real accounts for Doctor, Researcher, and Administrator in development mode."""
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
            cursor = conn.cursor()
            for acc in default_accounts:
                cursor.execute("SELECT id FROM users WHERE email = ?", (acc["email"],))
                if not cursor.fetchone():
                    user_id = f"usr-{uuid.uuid4().hex[:8]}"
                    hashed_pw, salt = hash_password(acc["password"])
                    cursor.execute(
                        """
                        INSERT INTO users (
                            id, email, hashed_password, salt, full_name, role,
                            title, specialty, organization, is_active, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                        """,
                        (
                            user_id,
                            acc["email"],
                            hashed_pw,
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
            conn.commit()

    # ================= User & Session Management =================

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", (email.strip(),))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_user_by_id(self, user_id: str) -> Optional[UserProfile]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return UserProfile(
                id=row["id"],
                email=row["email"],
                fullName=row["full_name"],
                role=UserRole(row["role"]),
                title=row["title"],
                specialty=row["specialty"],
                organization=row["organization"],
                isActive=bool(row["is_active"]),
                createdAt=row["created_at"],
                lastLoginAt=row["last_login_at"],
            )

    def list_users(self) -> List[UserProfile]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users ORDER BY created_at ASC")
            rows = cursor.fetchall()
            return [
                UserProfile(
                    id=row["id"],
                    email=row["email"],
                    fullName=row["full_name"],
                    role=UserRole(row["role"]),
                    title=row["title"],
                    specialty=row["specialty"],
                    organization=row["organization"],
                    isActive=bool(row["is_active"]),
                    createdAt=row["created_at"],
                    lastLoginAt=row["last_login_at"],
                )
                for row in rows
            ]

    def create_user(
        self,
        email: str,
        password: str,
        full_name: str,
        role: UserRole,
        title: Optional[str] = None,
        specialty: Optional[str] = None,
        organization: Optional[str] = None,
    ) -> UserProfile:
        user_id = f"usr-{uuid.uuid4().hex[:8]}"
        hashed_pw, salt = hash_password(password)
        now_iso = datetime.now(timezone.utc).isoformat()

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO users (
                    id, email, hashed_password, salt, full_name, role,
                    title, specialty, organization, is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    user_id,
                    email.strip().lower(),
                    hashed_pw,
                    salt,
                    full_name.strip(),
                    role.value,
                    title,
                    specialty,
                    organization,
                    now_iso,
                    now_iso,
                ),
            )
            conn.commit()

        return self.get_user_by_id(user_id)

    def update_password(self, user_id: str, new_password: str) -> bool:
        hashed_pw, salt = hash_password(new_password)
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE users SET hashed_password = ?, salt = ?, updated_at = ? WHERE id = ?",
                (hashed_pw, salt, now_iso, user_id),
            )
            # Invalidate all prior sessions for security
            cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            conn.commit()
            return cursor.rowcount > 0

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
        new_name = full_name if full_name is not None else existing.fullName
        new_title = title if title is not None else existing.title
        new_spec = specialty if specialty is not None else existing.specialty
        new_org = organization if organization is not None else existing.organization
        new_role = role.value if role is not None else existing.role.value
        new_active = int(is_active) if is_active is not None else int(existing.isActive)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE users SET
                    full_name = ?,
                    title = ?,
                    specialty = ?,
                    organization = ?,
                    role = ?,
                    is_active = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (new_name, new_title, new_spec, new_org, new_role, new_active, now_iso, user_id),
            )
            conn.commit()

        return self.get_user_by_id(user_id)

    def create_session(self, user_id: str, ip_address: Optional[str] = None, hours_valid: int = 24) -> Tuple[str, str]:
        token = generate_session_token()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=hours_valid)
        now_iso = now.isoformat()
        expires_iso = expires_at.isoformat()

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO sessions (token, user_id, created_at, expires_at, ip_address) VALUES (?, ?, ?, ?, ?)",
                (token, user_id, now_iso, expires_iso, ip_address),
            )
            cursor.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now_iso, user_id))
            conn.commit()

        return token, expires_iso

    def get_user_by_session_token(self, token: str) -> Optional[UserProfile]:
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT u.* FROM users u
                JOIN sessions s ON u.id = s.user_id
                WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1
                """,
                (token, now_iso),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return UserProfile(
                id=row["id"],
                email=row["email"],
                fullName=row["full_name"],
                role=UserRole(row["role"]),
                title=row["title"],
                specialty=row["specialty"],
                organization=row["organization"],
                isActive=bool(row["is_active"]),
                createdAt=row["created_at"],
                lastLoginAt=row["last_login_at"],
            )

    def delete_session(self, token: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
            return cursor.rowcount > 0

    def create_password_reset(self, user_id: str, minutes_valid: int = 60) -> str:
        raw_token = generate_reset_token()
        hashed_token = hash_token(raw_token)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=minutes_valid)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO password_resets (token, user_id, created_at, expires_at, is_used) VALUES (?, ?, ?, ?, 0)",
                (hashed_token, user_id, now.isoformat(), expires_at.isoformat()),
            )
            conn.commit()

        return raw_token

    def verify_and_use_reset_token(self, token: str) -> Optional[str]:
        """Returns user_id if token is valid and unexpired, then marks it used."""
        now_iso = datetime.now(timezone.utc).isoformat()
        hashed_token = hash_token(token)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT user_id FROM password_resets WHERE token = ? AND expires_at > ? AND is_used = 0",
                (hashed_token, now_iso),
            )
            row = cursor.fetchone()
            if not row:
                return None
            user_id = row["user_id"]
            cursor.execute("UPDATE password_resets SET is_used = 1 WHERE token = ?", (hashed_token,))
            conn.commit()
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
        details_json = json.dumps(details or {})

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO audit_logs (
                    id, user_id, user_email, action, resource_type,
                    resource_id, details_json, ip_address, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (log_id, user_id, user_email, action, resource_type, resource_id, details_json, ip_address, now_iso),
            )
            conn.commit()

        return AuditLogRecord(
            id=log_id,
            userId=user_id,
            userEmail=user_email,
            action=action,
            resourceType=resource_type,
            resourceId=resource_id,
            details=details or {},
            ipAddress=ip_address,
            createdAt=now_iso,
        )

    def list_audit_logs(self, limit: int = 50) -> List[AuditLogRecord]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            return [
                AuditLogRecord(
                    id=row["id"],
                    userId=row["user_id"],
                    userEmail=row["user_email"],
                    action=row["action"],
                    resourceType=row["resource_type"],
                    resourceId=row["resource_id"],
                    details=json.loads(row["details_json"]) if row["details_json"] else {},
                    ipAddress=row["ip_address"],
                    createdAt=row["created_at"],
                )
                for row in rows
            ]

    # ================= Case Storage (Existing Core Preserved) =================

    def _row_to_case(self, row: sqlite3.Row) -> ResearchCase:
        """Safely deserialize SQLite row into typed ResearchCase model."""
        demographics_data = json.loads(row["demographics_json"])
        demographics = PatientDemographics(
            researchSubjectId=demographics_data.get("researchSubjectId", row["subject_id"]),
            ageBand=demographics_data.get("ageBand", "61-75"),
            biologicalSex=demographics_data.get("biologicalSex", "undisclosed"),
            indication=demographics_data.get("indication", "Primary Osteoarthritis"),
            affectedSide=AnatomicalSide(demographics_data.get("affectedSide", row["affected_side"])),
        )

        imaging = json.loads(row["imaging_json"]) if row["imaging_json"] else None
        segmentation_job = (
            json.loads(row["segmentation_job_json"]) if row["segmentation_job_json"] else None
        )
        meshes = json.loads(row["meshes_json"]) if row["meshes_json"] else []
        landmarks = json.loads(row["landmarks_json"]) if row["landmarks_json"] else []
        measurements = (
            json.loads(row["measurements_json"]) if row["measurements_json"] else None
        )
        implant_plan = (
            json.loads(row["implant_plan_json"]) if row["implant_plan_json"] else None
        )
        reports = json.loads(row["reports_json"]) if row["reports_json"] else []

        created_by_user_id = row["created_by_user_id"] if "created_by_user_id" in row.keys() else None

        return ResearchCase(
            id=row["id"],
            name=row["name"],
            createdAt=row["created_at"],
            updatedAt=row["updated_at"],
            isDemo=bool(row["is_demo"]),
            status=CaseStatus(row["status"]),
            demographics=demographics,
            imaging=imaging,
            segmentationJob=segmentation_job,
            meshes=meshes,
            landmarks=landmarks,
            measurements=measurements,
            implantPlan=implant_plan,
            reports=reports,
            createdByUserId=created_by_user_id,
        )

    def user_can_access_case(self, user: UserProfile, case: ResearchCase) -> bool:
        """
        Evaluate read permissions for a research case:
        - Admin: full access to all cases.
        - Doctor: access to demo cases OR cases created by this doctor.
        - Researcher: access to de-identified research cases.
        """
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
        """
        Evaluate mutate permissions (update, delete, upload imaging):
        - Admin: full modification access.
        - Doctor: can modify cases they created OR demo cases. Cannot touch other doctors' private cases.
        - Researcher: read-only access (no direct clinical edits).
        """
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
        """Retrieve cases filtered according to the user's role and data isolation boundary."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if user.role == UserRole.ADMIN or user.role == UserRole.RESEARCHER:
                if include_archived:
                    cursor.execute("SELECT * FROM cases ORDER BY created_at DESC")
                else:
                    cursor.execute("SELECT * FROM cases WHERE is_archived = 0 ORDER BY created_at DESC")
            elif user.role == UserRole.DOCTOR:
                if include_archived:
                    cursor.execute(
                        "SELECT * FROM cases WHERE (is_demo = 1 OR created_by_user_id = ?) ORDER BY created_at DESC",
                        (user.id,),
                    )
                else:
                    cursor.execute(
                        "SELECT * FROM cases WHERE is_archived = 0 AND (is_demo = 1 OR created_by_user_id = ?) ORDER BY created_at DESC",
                        (user.id,),
                    )
            else:
                return []
            rows = cursor.fetchall()
            return [self._row_to_case(r) for r in rows]

    def list_cases(self, include_archived: bool = False) -> List[ResearchCase]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if include_archived:
                cursor.execute("SELECT * FROM cases ORDER BY created_at DESC")
            else:
                cursor.execute("SELECT * FROM cases WHERE is_archived = 0 ORDER BY created_at DESC")
            rows = cursor.fetchall()
            return [self._row_to_case(r) for r in rows]

    def get_case(self, case_id: str) -> Optional[ResearchCase]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM cases WHERE id = ?", (case_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_case(row)

    def create_case(self, req: CaseCreateRequest, created_by_user_id: Optional[str] = None) -> ResearchCase:
        timestamp_slug = uuid.uuid4().hex[:6].upper()
        case_id = f"SHL-2026-{timestamp_slug}"
        now_iso = datetime.now(timezone.utc).isoformat()

        demographics_json = json.dumps(_dump_model(req.demographics))
        is_demo_int = 1 if req.isDemo else 0

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO cases (
                    id, name, created_at, updated_at, is_demo, status,
                    subject_id, affected_side, demographics_json,
                    imaging_json, segmentation_job_json, meshes_json,
                    landmarks_json, measurements_json, implant_plan_json, reports_json,
                    created_by_user_id, is_archived
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, '[]', '[]', NULL, NULL, '[]', ?, 0)
                """,
                (
                    case_id,
                    req.name,
                    now_iso,
                    now_iso,
                    is_demo_int,
                    CaseStatus.created.value,
                    req.demographics.researchSubjectId,
                    req.demographics.affectedSide.value,
                    demographics_json,
                    created_by_user_id,
                ),
            )
            conn.commit()

        return ResearchCase(
            id=case_id,
            name=req.name,
            createdAt=now_iso,
            updatedAt=now_iso,
            isDemo=bool(req.isDemo),
            status=CaseStatus.created,
            demographics=req.demographics,
            meshes=[],
            landmarks=[],
            reports=[],
            createdByUserId=created_by_user_id,
        )


    def update_case(self, case_id: str, updates: Dict[str, Any]) -> Optional[ResearchCase]:
        existing = self.get_case(case_id)
        if not existing:
            return None

        now_iso = datetime.now(timezone.utc).isoformat()
        name = updates.get("name", existing.name)
        status = updates.get("status", existing.status.value)
        if isinstance(status, CaseStatus):
            status = status.value

        demographics = updates.get("demographics", existing.demographics)
        if isinstance(demographics, dict):
            demographics = PatientDemographics(**demographics)

        demographics_json = json.dumps(_dump_model(demographics))

        imaging = updates.get("imaging", existing.imaging)
        imaging_json = json.dumps(imaging) if imaging is not None else None

        segmentation_job = updates.get("segmentationJob", existing.segmentationJob)
        segmentation_job_json = json.dumps(segmentation_job) if segmentation_job is not None else None

        meshes = updates.get("meshes", existing.meshes)
        meshes_json = json.dumps(meshes) if meshes is not None else "[]"

        landmarks = updates.get("landmarks", existing.landmarks)
        landmarks_json = json.dumps(landmarks) if landmarks is not None else "[]"

        measurements = updates.get("measurements", existing.measurements)
        measurements_json = json.dumps(measurements) if measurements is not None else None

        implant_plan = updates.get("implantPlan", existing.implantPlan)
        implant_plan_json = json.dumps(implant_plan) if implant_plan is not None else None

        reports = updates.get("reports", existing.reports)
        reports_json = json.dumps(reports) if reports is not None else "[]"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE cases SET
                    name = ?,
                    updated_at = ?,
                    status = ?,
                    subject_id = ?,
                    affected_side = ?,
                    demographics_json = ?,
                    imaging_json = ?,
                    segmentation_job_json = ?,
                    meshes_json = ?,
                    landmarks_json = ?,
                    measurements_json = ?,
                    implant_plan_json = ?,
                    reports_json = ?
                WHERE id = ?
                """,
                (
                    name,
                    now_iso,
                    status,
                    demographics.researchSubjectId,
                    demographics.affectedSide.value,
                    demographics_json,
                    imaging_json,
                    segmentation_job_json,
                    meshes_json,
                    landmarks_json,
                    measurements_json,
                    implant_plan_json,
                    reports_json,
                    case_id,
                ),
            )
            conn.commit()

        return self.get_case(case_id)

    def archive_case(self, case_id: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE cases SET is_archived = 1 WHERE id = ?", (case_id,))
            conn.commit()
            return cursor.rowcount > 0

    def delete_case(self, case_id: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM cases WHERE id = ?", (case_id,))
            conn.commit()
            return cursor.rowcount > 0

    def clear(self) -> None:
        """Remove all cases from the table (primarily for test fixtures)."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM cases")
            conn.commit()


# Default singleton instance bound to settings.DATABASE_PATH
case_store = SqliteCaseStore()
