"""
User, Authentication, and Audit Models for ShoulderTwin.
"""

from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field


class UserRole(str, Enum):
    DOCTOR = "doctor"
    RESEARCHER = "researcher"
    ADMIN = "admin"


class UserBase(BaseModel):
    email: str
    fullName: str
    role: UserRole
    title: Optional[str] = None
    specialty: Optional[str] = None
    organization: Optional[str] = None
    isActive: bool = True


class UserProfile(UserBase):
    id: str
    createdAt: str
    lastLoginAt: Optional[str] = None


class UserCreateRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    fullName: str
    role: UserRole = UserRole.DOCTOR
    title: Optional[str] = "MD, FRCS"
    specialty: Optional[str] = "Orthopedic Surgery"
    organization: Optional[str] = "Department of Orthopedic Surgery"


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    token: str
    tokenType: str = "Bearer"
    expiresAt: str
    user: UserProfile


class ForgotPasswordRequest(BaseModel):
    email: str


class ForgotPasswordResponse(BaseModel):
    message: str



class ResetPasswordRequest(BaseModel):
    resetToken: str
    newPassword: str = Field(..., min_length=8)


class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str = Field(..., min_length=8)


class AuditLogRecord(BaseModel):
    id: str
    userId: Optional[str] = None
    userEmail: Optional[str] = None
    action: str
    resourceType: str
    resourceId: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    ipAddress: Optional[str] = None
    createdAt: str
