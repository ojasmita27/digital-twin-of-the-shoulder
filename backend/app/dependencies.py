"""
FastAPI Security and Role-Based Access Control Dependencies.
"""

from typing import List, Optional
from fastapi import Header, HTTPException, status, Request
from .models.user import UserProfile, UserRole
from .storage import case_store


def get_token_from_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract Bearer token from Authorization header."""
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return authorization


def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[UserProfile]:
    """Retrieve user if valid bearer token is present; otherwise returns None."""
    token = get_token_from_header(authorization)
    if not token:
        return None
    return case_store.get_user_by_session_token(token)


def get_current_user(authorization: Optional[str] = Header(None)) -> UserProfile:
    """Enforce authentication: raises 401 if token is missing, expired, or invalid."""
    token = get_token_from_header(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = case_store.get_user_by_session_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_role(allowed_roles: List[UserRole]):
    """Enforce Role-Based Access Control (RBAC)."""
    def role_checker(authorization: Optional[str] = Header(None)) -> UserProfile:
        user = get_current_user(authorization)
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. This action requires one of the following roles: {[r.value for r in allowed_roles]}.",
            )
        return user
    return role_checker
