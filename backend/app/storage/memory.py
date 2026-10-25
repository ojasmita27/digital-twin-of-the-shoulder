"""
In-Memory Storage Implementation for Phase 1.

CRITICAL PERSISTENCE BEHAVIOR:
- Data stored in this module lives strictly in the process memory (RAM).
- It DOES NOT persist to disk, SQLite, PostgreSQL, or Supabase.
- ALL data will be wiped when the Python backend server stops or restarts.
- Persistent database integration (PostgreSQL / Supabase) is planned for Phase 2.
"""

from datetime import datetime, timezone
import uuid
from typing import Dict, List, Optional
from ..models.case import ResearchCase, CaseCreateRequest, CaseStatus


class InMemoryCaseStore:
    def __init__(self):
        self._cases: Dict[str, ResearchCase] = {}

    def list_cases(self) -> List[ResearchCase]:
        return list(self._cases.values())

    def get_case(self, case_id: str) -> Optional[ResearchCase]:
        return self._cases.get(case_id)

    def create_case(self, req: CaseCreateRequest) -> ResearchCase:
        timestamp_slug = uuid.uuid4().hex[:6].upper()
        case_id = f"SHL-2026-{timestamp_slug}"
        now_iso = datetime.now(timezone.utc).isoformat()

        new_case = ResearchCase(
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
        self._cases[case_id] = new_case
        return new_case

    def delete_case(self, case_id: str) -> bool:
        if case_id in self._cases:
            del self._cases[case_id]
            return True
        return False

    def clear(self) -> None:
        self._cases.clear()


# Global singleton instance for in-memory storage
case_store = InMemoryCaseStore()
