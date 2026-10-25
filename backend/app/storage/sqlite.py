"""
SQLite-backed Storage Repository for Digital Twin of the Shoulder.

PERSISTENCE BEHAVIOR:
- Data persists across server restarts in a local SQLite file (default: data/shoulder_twin.db).
- All ResearchCase fields (including nested demographics, imaging, segmentation,
  meshes, landmarks, measurements, implant plan, and clinical reports) are fully serialized and retained.
- Uses parameterized SQL queries exclusively.
"""

from datetime import datetime, timezone
import json
import os
import sqlite3
import uuid
from typing import Any, Dict, List, Optional
from ..config import settings
from ..models.case import ResearchCase, CaseCreateRequest, CaseStatus, PatientDemographics, AnatomicalSide


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
        """Create database tables and indices if they do not exist."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
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
                    reports_json TEXT NOT NULL DEFAULT '[]'
                )
                """
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_cases_subject_id ON cases(subject_id)"
            )
            conn.commit()

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
        )

    def list_cases(self) -> List[ResearchCase]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM cases ORDER BY created_at DESC")
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

    def create_case(self, req: CaseCreateRequest) -> ResearchCase:
        timestamp_slug = uuid.uuid4().hex[:6].upper()
        case_id = f"SHL-2026-{timestamp_slug}"
        now_iso = datetime.now(timezone.utc).isoformat()

        demographics_json = json.dumps(req.demographics.model_dump())
        is_demo_int = 1 if req.isDemo else 0

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO cases (
                    id, name, created_at, updated_at, is_demo, status,
                    subject_id, affected_side, demographics_json,
                    imaging_json, segmentation_job_json, meshes_json,
                    landmarks_json, measurements_json, implant_plan_json, reports_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, '[]', '[]', NULL, NULL, '[]')
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

        demographics_json = json.dumps(demographics.model_dump())

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
