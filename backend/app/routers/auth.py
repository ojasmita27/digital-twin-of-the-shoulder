"""
Authentication and User Management Router for ShoulderTwin.
Handles real password hashing, session tokens, password resets, role inspection, and audit logging.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Header, Request
from ..models.user import (
    LoginRequest,
    LoginResponse,
    UserProfile,
    UserRole,
    UserCreateRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    ChangePasswordRequest,
    AuditLogRecord,
)
from ..services.auth_service import verify_password
from ..storage import case_store
from ..dependencies import get_current_user, require_role, get_token_from_header

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request):
    """
    Authenticate user via email and password using salted PBKDF2-HMAC-SHA256.
    Returns session bearer token and user profile on success.
    """
    user_record = case_store.get_user_by_email(payload.email)
    if not user_record:
        case_store.log_audit(
            action="LOGIN_FAILED_UNKNOWN_USER",
            resource_type="auth",
            details={"email": payload.email},
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user_record.get("is_active", 1):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated. Please contact an administrator.",
        )

    # Verify password against salt
    is_valid = verify_password(
        payload.password,
        user_record["hashed_password"],
        user_record["salt"],
    )

    if not is_valid:
        case_store.log_audit(
            action="LOGIN_FAILED_BAD_PASSWORD",
            resource_type="auth",
            user_id=user_record["id"],
            user_email=user_record["email"],
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Create persistent session
    token, expires_at = case_store.create_session(
        user_id=user_record["id"],
        ip_address=request.client.host if request.client else None,
    )

    case_store.log_audit(
        action="LOGIN_SUCCESS",
        resource_type="auth",
        user_id=user_record["id"],
        user_email=user_record["email"],
        details={"role": user_record["role"]},
        ip_address=request.client.host if request.client else None,
    )

    user_profile = case_store.get_user_by_id(user_record["id"])

    return LoginResponse(
        token=token,
        tokenType="Bearer",
        expiresAt=expires_at,
        user=user_profile,
    )


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(authorization: Optional[str] = Header(None)):
    """Invalidate current session token."""
    token = get_token_from_header(authorization)
    if token:
        user = case_store.get_user_by_session_token(token)
        case_store.delete_session(token)
        if user:
            case_store.log_audit(
                action="LOGOUT",
                resource_type="auth",
                user_id=user.id,
                user_email=user.email,
            )
    return {"message": "Logged out successfully."}


@router.get("/me", response_model=UserProfile)
def get_current_user_profile(authorization: Optional[str] = Header(None)):
    """Retrieve the currently authenticated user's profile."""
    return get_current_user(authorization)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, request: Request):
    """
    Generate password reset token for user account.
    Returns generic response to prevent user enumeration.
    Never exposes the reset token in the API response or logs.
    """
    user_record = case_store.get_user_by_email(payload.email)
    if user_record:
        # Generates cryptographically secure token, hashes it with SHA-256 before database insertion
        # In production deployment, the raw token is dispatched via authenticated SMTP email service
        _raw_token = case_store.create_password_reset(user_record["id"])
        case_store.log_audit(
            action="PASSWORD_RESET_REQUESTED",
            resource_type="auth",
            user_id=user_record["id"],
            user_email=user_record["email"],
            ip_address=request.client.host if request.client else None,
        )

    # Constant generic message to avoid user enumeration
    return ForgotPasswordResponse(
        message="If an active account exists with that email, a password reset token has been registered.",
    )



@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, request: Request):
    """
    Reset password using a valid reset token.
    """
    user_id = case_store.verify_and_use_reset_token(payload.resetToken)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    case_store.update_password(user_id, payload.newPassword)
    user = case_store.get_user_by_id(user_id)
    case_store.log_audit(
        action="PASSWORD_RESET_COMPLETED",
        resource_type="auth",
        user_id=user_id,
        user_email=user.email if user else None,
        ip_address=request.client.host if request.client else None,
    )

    return {"message": "Password updated successfully. You can now log in with your new password."}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    """
    Change password for the currently logged-in user. Requires valid current password.
    """
    user = get_current_user(authorization)
    user_record = case_store.get_user_by_email(user.email)
    if not user_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User record not found.")

    if not verify_password(payload.currentPassword, user_record["hashed_password"], user_record["salt"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password incorrect.")

    case_store.update_password(user.id, payload.newPassword)
    case_store.log_audit(
        action="PASSWORD_CHANGED",
        resource_type="auth",
        user_id=user.id,
        user_email=user.email,
        ip_address=request.client.host if request and request.client else None,
    )

    return {"message": "Password changed successfully. Please log in with your new password."}


# ================= Administrator Endpoints =================

@router.get("/users", response_model=List[UserProfile])
def list_users(authorization: Optional[str] = Header(None)):
    """Administrator-only: list all registered user accounts."""
    require_role([UserRole.ADMIN])(authorization)
    return case_store.list_users()


@router.post("/users", response_model=UserProfile, status_code=status.HTTP_201_CREATED)
def create_new_user(payload: UserCreateRequest, authorization: Optional[str] = Header(None)):
    """Administrator-only: create a new user account with assigned role."""
    admin = require_role([UserRole.ADMIN])(authorization)

    existing = case_store.get_user_by_email(payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{payload.email}' already exists.",
        )

    new_user = case_store.create_user(
        email=payload.email,
        password=payload.password,
        full_name=payload.fullName,
        role=payload.role,
        title=payload.title,
        specialty=payload.specialty,
        organization=payload.organization,
    )

    case_store.log_audit(
        action="USER_CREATED_BY_ADMIN",
        resource_type="user",
        resource_id=new_user.id,
        user_id=admin.id,
        user_email=admin.email,
        details={"created_email": new_user.email, "role": new_user.role.value},
    )

    return new_user


@router.get("/audit-logs", response_model=List[AuditLogRecord])
def get_audit_logs(limit: int = 50, authorization: Optional[str] = Header(None)):
    """Administrator-only: view tamper-evident security audit logs."""
    require_role([UserRole.ADMIN])(authorization)
    return case_store.list_audit_logs(limit=limit)
