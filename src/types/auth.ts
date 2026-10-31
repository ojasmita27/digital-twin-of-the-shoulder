/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'doctor' | 'researcher' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  title?: string;
  specialty?: string;
  organization?: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface LoginResponse {
  token: string;
  tokenType: string;
  expiresAt: string;
  user: UserProfile;
}

export interface AuditLogRecord {
  id: string;
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details: Record<string, any>;
  ipAddress?: string | null;
  createdAt: string;
}
