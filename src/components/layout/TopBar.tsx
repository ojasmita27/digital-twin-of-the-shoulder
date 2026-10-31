/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { NavRoute } from './Sidebar';
import { ResearchCase } from '../../types/case';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { AuthModal, AuthModalView } from '../auth/AuthModal';
import {
  Search,
  Sun,
  Moon,
  ChevronDown,
  FolderOpen,
  User,
  Settings,
  Bell,
  KeyRound,
  LogOut,
  ShieldCheck,
  LogIn,
} from 'lucide-react';

interface TopBarProps {
  currentRoute: NavRoute;
  onRouteChange: (route: NavRoute) => void;
  activeCase: ResearchCase | null;
  cases: ResearchCase[];
  onSelectCase: (caseId: string) => void;
  onOpenCreateCaseModal: () => void;
  onOpenNotifications: () => void;
  unreadNotificationsCount?: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentRoute,
  onRouteChange,
  activeCase,
  cases,
  onSelectCase,
  onOpenCreateCaseModal,
  onOpenNotifications,
  unreadNotificationsCount = 0,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalView, setAuthModalView] = useState<AuthModalView>('login');

  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCases = cases.filter(
    (c) =>
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.demographics.researchSubjectId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.demographics.indication.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Compute initials for the user avatar
  const userInitials = user
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '??';

  const roleLabel = user
    ? user.role === 'doctor'
      ? 'Orthopedic Surgeon'
      : user.role === 'researcher'
      ? 'Research Scientist'
      : 'System Administrator'
    : 'Guest';

  return (
    <>
      <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800 px-6 flex items-center justify-between gap-6 select-none z-30 transition-colors">
        {/* Search Bar - Search case ID, patient or indication */}
        <div ref={searchRef} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchDropdown(true);
            }}
            onFocus={() => {
              if (searchQuery.trim().length > 0) setShowSearchDropdown(true);
            }}
            placeholder="Search case ID or patient..."
            className="w-full bg-slate-50/90 dark:bg-slate-950/80 border border-slate-200/90 dark:border-slate-800 rounded-full pl-10 pr-4 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-colors shadow-2xs"
          />

          {/* Live Filter Popover */}
          {showSearchDropdown && searchQuery.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1.5 text-xs z-50 max-h-60 overflow-y-auto">
              {filteredCases.length === 0 ? (
                <div className="p-3 text-center text-slate-400 text-xs">
                  No matching research cases or patient records
                </div>
              ) : (
                filteredCases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelectCase(c.id);
                      setShowSearchDropdown(false);
                      setSearchQuery('');
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 flex items-center justify-between transition-colors border-b last:border-b-0 border-slate-100 dark:border-slate-800/60"
                  >
                    <div>
                      <div className="font-mono font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <span>{c.id}</span>
                        {activeCase?.id === c.id && (
                          <span className="text-[10px] text-teal-600 dark:text-cyan-400 bg-teal-50 dark:bg-cyan-950/40 px-1.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {c.name} · {c.demographics.indication}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono capitalize">
                      {c.demographics.affectedSide}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right Controls: Theme Toggle & Clinician Profile Badge */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Dual Theme Switch: Sun - Slider - Moon */}
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="relative flex items-center gap-1.5 px-2 py-1 bg-amber-50 dark:bg-slate-800/90 border border-amber-200/70 dark:border-slate-700/80 rounded-full transition-colors cursor-pointer shadow-2xs hover:border-amber-300 dark:hover:border-slate-600"
          >
            <Sun className={`w-3.5 h-3.5 transition-colors ${theme === 'dark' ? 'text-slate-400' : 'text-amber-500'}`} />
            <div className="relative w-8 h-4 bg-amber-200/60 dark:bg-slate-950 rounded-full transition-colors">
              <div
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white dark:bg-slate-200 shadow-xs transition-transform duration-200 ${
                  theme === 'dark' ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </div>
            <Moon className={`w-3.5 h-3.5 transition-colors ${theme === 'dark' ? 'text-cyan-400' : 'text-slate-400'}`} />
          </button>

          {/* Notifications Icon */}
          <button
            onClick={onOpenNotifications}
            className="p-2 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors relative cursor-pointer"
            title="System Notifications & Event Log"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-teal-500 dark:bg-cyan-400" />
            )}
          </button>

          {/* Actual Logged-in User Profile Badge */}
          {isAuthenticated && user ? (
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-3 p-1.5 pr-2.5 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {/* Avatar Circle with Real Initials */}
                <div className="w-8 h-8 rounded-full bg-slate-900 dark:bg-slate-800 text-white border border-slate-800 dark:border-slate-700 flex items-center justify-center font-bold text-xs tracking-wider shadow-xs">
                  {userInitials}
                </div>

                {/* Real User Name & Role */}
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                    {user.fullName}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    {roleLabel}
                  </div>
                </div>

                <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              </button>

              {/* Profile Menu Dropdown */}
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-2 text-xs z-50">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {user.fullName} {user.title ? `(${user.title})` : ''}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {user.email}
                    </div>
                    <div className="inline-flex items-center gap-1 mt-1 text-[10px] text-teal-700 dark:text-teal-400 font-semibold uppercase tracking-wider bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 rounded">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Role: {user.role}</span>
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        setAuthModalView('profile');
                        setAuthModalOpen(true);
                      }}
                      className="w-full px-4 py-2 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <User className="w-4 h-4 text-slate-400" />
                      <span>User Profile & Security</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        setAuthModalView('change_password');
                        setAuthModalOpen(true);
                      }}
                      className="w-full px-4 py-2 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4 text-slate-400" />
                      <span>Change Password</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        setAuthModalView('login');
                        setAuthModalOpen(true);
                      }}
                      className="w-full px-4 py-2 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <LogIn className="w-4 h-4 text-slate-400" />
                      <span>Switch Account / Sign In</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onOpenCreateCaseModal();
                      }}
                      className="w-full px-4 py-2 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <FolderOpen className="w-4 h-4 text-slate-400" />
                      <span>Create Research Case</span>
                    </button>

                    {user.role === 'admin' && (
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          onRouteChange('settings');
                        }}
                        className="w-full px-4 py-2 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                      >
                        <Settings className="w-4 h-4 text-slate-400" />
                        <span>System Administration</span>
                      </button>
                    )}
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                  <div className="py-0.5">
                    <button
                      onClick={async () => {
                        setShowProfileMenu(false);
                        await logout();
                      }}
                      className="w-full px-4 py-2 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => {
                setAuthModalView('login');
                setAuthModalOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Interactive Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialView={authModalView}
      />
    </>
  );
};
