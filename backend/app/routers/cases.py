from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status, Header, Request, Depends
from ..models.case import ResearchCase, CaseCreateRequest
from ..models.user import UserProfile, UserRole
from ..storage import case_store
from ..dependencies import get_current_user, require_role

router = APIRouter(prefix="/api", tags=["cases"])


@router.get("/cases", response_model=List[ResearchCase])
def list_cases(authorization: Optional[str] = Header(None)) -> List[ResearchCase]:
    """
    Retrieve de-identified research cases filtered by the caller's role and ownership.
    Doctors see their own created cases and public demo cases.
    Researchers see research cases.
    Administrators see all cases.
    """
    user = get_current_user(authorization)
    return case_store.list_cases_for_user(user)


@router.post("/cases", response_model=ResearchCase, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CaseCreateRequest,
    authorization: Optional[str] = Header(None),
    request: Request = None,
) -> ResearchCase:
    """
    Create a new research case. Requires Doctor or Admin privileges.
    Binds the case to the authenticated physician.
    """
    user = require_role([UserRole.DOCTOR, UserRole.ADMIN])(authorization)
    created = case_store.create_case(payload, created_by_user_id=user.id)

    case_store.log_audit(
        action="CASE_CREATED",
        resource_type="case",
        resource_id=created.id,
        user_id=user.id,
        user_email=user.email,
        details={"case_name": created.name, "side": created.demographics.affectedSide.value},
        ip_address=request.client.host if request and request.client else None,
    )
    return created


@router.get("/cases/{case_id}", response_model=ResearchCase)
def get_case(
    case_id: str,
    authorization: Optional[str] = Header(None),
) -> ResearchCase:
    """
    Retrieve a single research case by ID.
    Enforces cross-user isolation: unauthorized doctors receive HTTP 403 Forbidden.
    """
    user = get_current_user(authorization)
    found = case_store.get_case(case_id)
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Research case '{case_id}' was not found in storage.",
        )

    if not case_store.user_can_access_case(user, found):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. You do not have permission to view research case '{case_id}'.",
        )

    return found


@router.patch("/cases/{case_id}", response_model=ResearchCase)
def update_case(
    case_id: str,
    updates: Dict[str, Any],
    authorization: Optional[str] = Header(None),
    request: Request = None,
) -> ResearchCase:
    """
    Update fields of an existing research case.
    Requires Doctor or Admin role and case modification permission.
    """
    user = require_role([UserRole.DOCTOR, UserRole.ADMIN])(authorization)
    found = case_store.get_case(case_id)
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Research case '{case_id}' was not found in storage.",
        )

    if not case_store.user_can_modify_case(user, found):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. You do not have permission to modify research case '{case_id}'.",
        )

    updated = case_store.update_case(case_id, updates)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Research case '{case_id}' was not found in storage.",
        )

    case_store.log_audit(
        action="CASE_UPDATED",
        resource_type="case",
        resource_id=case_id,
        user_id=user.id,
        user_email=user.email,
        details={"updated_fields": list(updates.keys())},
        ip_address=request.client.host if request and request.client else None,
    )
    return updated


@router.delete("/cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case(
    case_id: str,
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    """
    Delete a research case from SQLite database.
    Requires Doctor (owner) or Admin privileges.
    """
    user = require_role([UserRole.DOCTOR, UserRole.ADMIN])(authorization)
    found = case_store.get_case(case_id)
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Research case '{case_id}' was not found in storage.",
        )

    if not case_store.user_can_modify_case(user, found):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. You do not have permission to delete research case '{case_id}'.",
        )

    success = case_store.delete_case(case_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Research case '{case_id}' was not found in storage.",
        )

    case_store.log_audit(
        action="CASE_DELETED",
        resource_type="case",
        resource_id=case_id,
        user_id=user.id,
        user_email=user.email,
        ip_address=request.client.host if request and request.client else None,
    )
    return None

