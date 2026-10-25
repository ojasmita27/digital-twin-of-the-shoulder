from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status
from ..models.case import ResearchCase, CaseCreateRequest
from ..storage import case_store

router = APIRouter(prefix="/api", tags=["cases"])


@router.get("/cases", response_model=List[ResearchCase])
def list_cases() -> List[ResearchCase]:
    """Retrieve all de-identified research cases stored in SQLite database."""
    return case_store.list_cases()


@router.post("/cases", response_model=ResearchCase, status_code=status.HTTP_201_CREATED)
def create_case(payload: CaseCreateRequest) -> ResearchCase:
    """Create a new research case in memory with a generated non-identifying identifier."""
    return case_store.create_case(payload)


@router.get("/cases/{case_id}", response_model=ResearchCase)
def get_case(case_id: str) -> ResearchCase:
    """Retrieve a single research case by ID."""
    found = case_store.get_case(case_id)
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Research case '{case_id}' was not found in storage.",
        )
    return found


@router.patch("/cases/{case_id}", response_model=ResearchCase)
def update_case(case_id: str, updates: Dict[str, Any]) -> ResearchCase:
    """Update fields of an existing research case."""
    updated = case_store.update_case(case_id, updates)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Research case '{case_id}' was not found in storage.",
        )
    return updated


@router.delete("/cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case(case_id: str):
    """Delete a research case from SQLite database."""
    success = case_store.delete_case(case_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Research case '{case_id}' was not found in storage.",
        )
    return None
