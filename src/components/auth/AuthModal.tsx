/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types/auth';
import {
  X,
  Lock,
  Mail,
  User,
  ShieldCheck,
  KeyRound,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Building2,
  Briefcase,
  RefreshCw,
  Users,
} from 'lucide-react';

export type AuthModalView =
  | 'login'
  | 'forgot_password'
  | 'reset_password'
  | 'profile'
  | 'change_password';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: AuthModalView;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialView = 'login',
}) => {
  const { user, login, logout, forgotPassword, resetPassword, changePassword } = useAuth();
  const [view, setView] = useState<AuthModalView>(initialView);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  // Status feedback
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    const res = await login(email, password);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg('Successfully authenticated.');
      setTimeout(() => {
        onClose();
      }, 500);
    } else {
      setErrorMsg(res.error || 'Authentication failed. Please verify credentials.');
    }
  };

  const handleQuickLogin = async (roleEmail: string, rolePass: string) => {
    setEmail(roleEmail);
    setPassword(rolePass);
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    const res = await login(roleEmail, rolePass);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg('Signed in successfully.');
      setTimeout(() => {
        onClose();
      }, 500);
    } else {
      setErrorMsg(res.error || 'Login failed.');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    const res = await forgotPassword(email);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg(res.message);
      if (res.resetToken) {
        setResetToken(res.resetToken);
        setView('reset_password');
      }
    } else {
      setErrorMsg(res.error || 'Failed to process password reset request.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    const res = await resetPassword(resetToken, newPassword);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg('Password updated. You may now log in.');
      setTimeout(() => {
        setView('login');
      }, 1200);
    } else {
      setErrorMsg(res.error || 'Failed to reset password.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    const res = await changePassword(currentPassword, newPassword);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg('Password changed successfully.');
      setTimeout(() => {
        setView('profile');
      }, 1000);
    } else {
      setErrorMsg(res.error || 'Failed to change password. Check current password.');
    }
  };

  const handleLogout = async () => {
    await logout();
    setSuccessMsg('Logged out successfully.');
    setTimeout(() => {
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* View 1: LOGIN */}
        {view === 'login' && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200/80 dark:border-teal-800/60 flex items-center justify-center text-teal-700 dark:text-teal-400">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Sign In to ShoulderTwin
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Access patient CT series, patient-specific 3D reconstructions, and clinical plans.
            </p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="doctor@shouldertwin.org"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:border-teal-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setView('forgot_password');
                    }}
                    className="text-[11px] text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:border-teal-500 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 mt-2"
              >
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Quick Demo Accounts Switcher (Gated exclusively to development mode) */}
            {import.meta.env.DEV && (
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Development Verification Accounts:
                </div>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('doctor@shouldertwin.org', 'DoctorPass123!')}
                    className="w-full p-2 text-left rounded-lg border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">Dr. Sharma</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1.5">(Orthopedic Doctor)</span>
                    </div>
                    <span className="text-[10px] text-teal-700 dark:text-teal-400 font-medium">Use Account →</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickLogin('researcher@shouldertwin.org', 'ResearcherPass123!')}
                    className="w-full p-2 text-left rounded-lg border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">Dr. Sarah Chen</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1.5">(Researcher)</span>
                    </div>
                    <span className="text-[10px] text-teal-700 dark:text-teal-400 font-medium">Use Account →</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickLogin('admin@shouldertwin.org', 'AdminPass123!')}
                    className="w-full p-2 text-left rounded-lg border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">Systems Administrator</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1.5">(Admin)</span>
                    </div>
                    <span className="text-[10px] text-teal-700 dark:text-teal-400 font-medium">Use Account →</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* View 2: USER PROFILE */}
        {view === 'profile' && user && (
          <div>
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-wider shadow-xs">
                {user.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">
                  {user.fullName} {user.title ? `(${user.title})` : ''}
                </h3>
                <div className="text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Role: {user.role}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300 mb-5">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500">Specialty:</span>
                <span className="font-medium">{user.specialty || 'General Orthopedics'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500">Organization:</span>
                <span className="font-medium">{user.organization || 'ShoulderTwin Medical'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500">Security:</span>
                <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                  PBKDF2-HMAC-SHA256 (600k rounds, 32B salt)
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setView('change_password');
                }}
                className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-2 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Change Password</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2 px-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        )}

        {/* View 3: CHANGE PASSWORD */}
        {view === 'change_password' && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-teal-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Change Password
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter your current password and establish a new 8+ character password.
            </p>

            {errorMsg && (
              <div className="p-3 mb-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 text-xs text-rose-700">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="p-3 mb-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 text-xs text-emerald-700">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setView('profile')}
                  className="flex-1 py-2 text-xs text-slate-600 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2 text-xs font-semibold bg-teal-700 text-white rounded-lg hover:bg-teal-800"
                >
                  Save Password
                </button>
              </div>
            </form>
          </div>
        )}

        {/* View 4: FORGOT PASSWORD */}
        {view === 'forgot_password' && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Mail className="w-4 h-4 text-teal-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Reset Forgotten Password
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter your registered email to request a secure password reset token.
            </p>

            {errorMsg && (
              <div className="p-3 mb-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="p-3 mb-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Registered Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor@shouldertwin.org"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setView('login')}
                  className="flex-1 py-2 text-xs text-slate-600 border border-slate-200 rounded-lg"
                >
                  Back to Login
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2 text-xs font-semibold bg-teal-700 text-white rounded-lg hover:bg-teal-800"
                >
                  Request Reset Token
                </button>
              </div>
            </form>
          </div>
        )}

        {/* View 5: RESET PASSWORD */}
        {view === 'reset_password' && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-teal-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Set New Password
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              A high-entropy reset token was registered. Enter your new password below.
            </p>

            {errorMsg && (
              <div className="p-3 mb-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="p-3 mb-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reset Token
                </label>
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 text-xs font-semibold bg-teal-700 text-white rounded-lg hover:bg-teal-800 mt-2"
              >
                Update Password
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
