"""
Dry-run / safe migration script from local SQLite to PostgreSQL for ShoulderTwin.
Never overwrites existing PostgreSQL records (ON CONFLICT DO NOTHING) and never deletes SQLite.
Robust to older SQLite schemas where optional or version-dependent tables (e.g. digital_twin_versions) may be absent.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys

# Ensure repository root is in python search path
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)


def _get_sqlite_table_columns(cursor: sqlite3.Cursor, table_name: str) -> set[str]:
    cursor.execute(f"PRAGMA table_info({table_name})")
    return {row["name"] for row in cursor.fetchall()}


def migrate(sqlite_path: str, postgres_dsn: str, apply: bool = False) -> None:
    if not os.path.isfile(sqlite_path):
        print(f"SQLite database not found at {sqlite_path}", file=sys.stderr)
        sys.exit(1)

    sconn = sqlite3.connect(sqlite_path)
    sconn.row_factory = sqlite3.Row
    scur = sconn.cursor()

    # 1. Discover actual tables present in the SQLite database
    scur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    sqlite_tables = {row["name"] for row in scur.fetchall()}

    target_tables = ["users", "cases", "sessions", "password_resets", "audit_logs", "digital_twin_versions"]
    counts: dict[str, str | int] = {}
    for tbl in target_tables:
        if tbl in sqlite_tables:
            scur.execute(f"SELECT COUNT(*) FROM {tbl}")
            counts[tbl] = int(scur.fetchone()[0])
        else:
            counts[tbl] = "0 (table not in SQLite schema)"

    print("--- SQLite Source Inspection ---")
    print(f"Source file: {sqlite_path}")
    print(f"Tables present in SQLite: {sorted(list(sqlite_tables))}")
    print("Row counts per table:")
    for tbl, count in counts.items():
        print(f"  - {tbl}: {count}")

    if not apply:
        print("\n[DRY-RUN] No changes written to PostgreSQL. Pass --apply to execute.")
        sconn.close()
        return

    # 2. Apply migration to PostgreSQL
    from backend.app.storage.postgres import PostgresCaseStore

    pg = PostgresCaseStore(postgres_dsn)
    pg._init_db()

    with pg._get_connection() as pconn:
        with pconn.cursor() as pcur:
            # --- 2a. Users ---
            if "users" in sqlite_tables:
                user_cols = _get_sqlite_table_columns(scur, "users")
                scur.execute("SELECT * FROM users")
                migrated_users = 0
                for r in scur.fetchall():
                    updated_at = r["updated_at"] if "updated_at" in user_cols and r["updated_at"] else r["created_at"]
                    last_login_at = r["last_login_at"] if "last_login_at" in user_cols else None
                    pcur.execute(
                        """
                        INSERT INTO users (
                            id, email, hashed_password, salt, full_name, role,
                            title, specialty, organization, is_active, created_at, updated_at, last_login_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            r["id"],
                            r["email"],
                            r["hashed_password"],
                            r["salt"],
                            r["full_name"],
                            r["role"],
                            r["title"],
                            r["specialty"],
                            r["organization"],
                            bool(r["is_active"]),
                            r["created_at"],
                            updated_at,
                            last_login_at,
                        ),
                    )
                    migrated_users += 1
                print(f"Processed {migrated_users} user records.")

            # --- 2b. Cases ---
            if "cases" in sqlite_tables:
                case_cols = _get_sqlite_table_columns(scur, "cases")
                scur.execute("SELECT * FROM cases")
                migrated_cases = 0
                for r in scur.fetchall():
                    demographics_json = r["demographics_json"]
                    demog_data = json.loads(demographics_json) if demographics_json else {}

                    subject_id = r["subject_id"] if "subject_id" in case_cols else demog_data.get("researchSubjectId", "")
                    affected_side = r["affected_side"] if "affected_side" in case_cols else demog_data.get("affectedSide", "right")
                    seg_job = (
                        r["segmentation_job_json"]
                        if "segmentation_job_json" in case_cols
                        else (r["segmentation_json"] if "segmentation_json" in case_cols else None)
                    )
                    planning_m = r["planning_measurements_json"] if "planning_measurements_json" in case_cols else "[]"
                    planning_v = r["planning_versions_json"] if "planning_versions_json" in case_cols else "[]"
                    implant_a = r["implant_assets_json"] if "implant_assets_json" in case_cols else "[]"
                    implant_ref = r["implant_reference_points_json"] if "implant_reference_points_json" in case_cols else "[]"
                    viewer_pref = r["viewer_preferences_json"] if "viewer_preferences_json" in case_cols else None
                    created_by = r["created_by_user_id"] if "created_by_user_id" in case_cols else None
                    is_archived = bool(r["is_archived"]) if "is_archived" in case_cols else False
                    is_demo = bool(r["is_demo"]) if "is_demo" in case_cols else False

                    pcur.execute(
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
                            %s, %s, %s,
                            %s, %s, %s,
                            %s, %s, %s,
                            %s, %s, %s,
                            %s, %s
                        )
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            r["id"],
                            r["name"],
                            r["created_at"],
                            r["updated_at"],
                            is_demo,
                            r["status"],
                            subject_id,
                            affected_side,
                            demographics_json,
                            r["imaging_json"] if "imaging_json" in case_cols else None,
                            seg_job,
                            r["meshes_json"] if "meshes_json" in case_cols else "[]",
                            r["landmarks_json"] if "landmarks_json" in case_cols else "[]",
                            r["measurements_json"] if "measurements_json" in case_cols else None,
                            planning_m,
                            r["implant_plan_json"] if "implant_plan_json" in case_cols else None,
                            planning_v,
                            implant_a,
                            implant_ref,
                            r["reports_json"] if "reports_json" in case_cols else "[]",
                            viewer_pref,
                            created_by,
                            is_archived,
                        ),
                    )
                    migrated_cases += 1
                print(f"Processed {migrated_cases} case records.")

            # --- 2c. Active Sessions (if present) ---
            if "sessions" in sqlite_tables:
                scur.execute("SELECT * FROM sessions")
                migrated_sessions = 0
                for r in scur.fetchall():
                    pcur.execute(
                        """
                        INSERT INTO sessions (token, user_id, created_at, expires_at, ip_address)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (token) DO NOTHING
                        """,
                        (r["token"], r["user_id"], r["created_at"], r["expires_at"], r["ip_address"]),
                    )
                    migrated_sessions += 1
                print(f"Processed {migrated_sessions} session records.")

            # --- 2d. Password Resets (if present) ---
            if "password_resets" in sqlite_tables:
                pr_cols = _get_sqlite_table_columns(scur, "password_resets")
                scur.execute("SELECT * FROM password_resets")
                migrated_resets = 0
                for r in scur.fetchall():
                    is_used = bool(r["is_used"]) if "is_used" in pr_cols else bool(r["used"]) if "used" in pr_cols else False
                    pcur.execute(
                        """
                        INSERT INTO password_resets (token, user_id, created_at, expires_at, is_used)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (token) DO NOTHING
                        """,
                        (r["token"], r["user_id"], r["created_at"], r["expires_at"], is_used),
                    )
                    migrated_resets += 1
                print(f"Processed {migrated_resets} password reset records.")

            # --- 2e. Audit Logs (if present) ---
            if "audit_logs" in sqlite_tables:
                scur.execute("SELECT * FROM audit_logs")
                migrated_audits = 0
                for r in scur.fetchall():
                    pcur.execute(
                        """
                        INSERT INTO audit_logs (
                            id, user_id, user_email, action, resource_type, resource_id,
                            details_json, ip_address, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            r["id"],
                            r["user_id"],
                            r["user_email"],
                            r["action"],
                            r["resource_type"],
                            r["resource_id"],
                            r["details_json"],
                            r["ip_address"],
                            r["created_at"],
                        ),
                    )
                    migrated_audits += 1
                print(f"Processed {migrated_audits} audit log records.")

            # --- 2f. Digital Twin Versions (if present) ---
            if "digital_twin_versions" in sqlite_tables:
                scur.execute("SELECT * FROM digital_twin_versions")
                migrated_versions = 0
                for r in scur.fetchall():
                    pcur.execute(
                        """
                        INSERT INTO digital_twin_versions (
                            id, case_id, version_number, created_at, user_id, user_email,
                            segmentation_version, landmark_state_json, implant_state_json,
                            measurement_state_json, model_refs_json, change_description
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (case_id, version_number) DO NOTHING
                        """,
                        (
                            r["id"],
                            r["case_id"],
                            r["version_number"],
                            r["created_at"],
                            r["user_id"],
                            r["user_email"],
                            r["segmentation_version"],
                            r["landmark_state_json"],
                            r["implant_state_json"],
                            r["measurement_state_json"],
                            r["model_refs_json"],
                            r["change_description"],
                        ),
                    )
                    migrated_versions += 1
                print(f"Processed {migrated_versions} digital twin version records.")
            else:
                print("Skipped digital_twin_versions (table not present in source SQLite).")

    pg.close()
    sconn.close()
    print("\nMigration applied successfully (existing PostgreSQL records preserved with ON CONFLICT DO NOTHING).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate ShoulderTwin SQLite data to PostgreSQL.")
    parser.add_argument("--sqlite-path", default="data/shoulder_twin.db")
    parser.add_argument("--apply", action="store_true", help="Apply migration (default is dry-run)")
    args = parser.parse_args()

    dsn = os.getenv("DATABASE_URL", "").strip()
    if not dsn and args.apply:
        print("DATABASE_URL environment variable is required for --apply.", file=sys.stderr)
        sys.exit(1)

    migrate(args.sqlite_path, dsn, apply=args.apply)
