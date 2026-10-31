/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { NavRoute } from './Sidebar';
import { ResearchCase } from '../../types/case';
import { apiClient, BackendHealthState } from '../../services/apiClient';
import { useTheme } from '../../context/ThemeContext';
import {
  Server,
  FolderOpen,
  ChevronDown,
  Bell,
  Sun,
  Moon,
  Search,
  Activity,
  Plus,
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
  const [backendHealth, setBackendHealth] = useState<BackendHealthState>(apiClient.getHealthState());
  const [showCaseDropdown, setShowCaseDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsubscribe = apiClient.subscribeHealth((state) => {
      setBackendHealth(state);
    });
    apiClient.checkHealth();
    const interval = setInterval(() => {
      apiClient.checkHealth();
    }, 30000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const routeTitles: Record<NavRoute, string> = {
    overview: 'Clinical Overview',
    cases: 'Research Cases Registry',
    imaging: 'CT Imaging Workspace',
    segmentation: 'Anatomical Segmentation',
    anatomy3d: '3D Shoulder Reconstruction',
    measurements: 'Morphometric Biomechanics',
    planning: 'Arthroplasty Planning',
    reports: 'Preoperative Reports',
    research: 'Research Datasets',
    settings: 'Developer Settings',
  };

  const filteredCases = cases.filter(
    (c) =>
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.demographics.researchSubjectId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-5 flex items-center justify-between gap-4 select-none z-30 transition-colors">
      {/* Brand & Route Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            onRouteChange('overview');
          }}
          className="flex items-center gap-2 text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-cyan-400 transition-colors"
        >
          <span className="w-6 h-6 rounded bg-teal-600/10 dark:bg-cyan-500/10 border border-teal-600/20 dark:border-cyan-500/30 flex items-center justify-center text-teal-700 dark:text-cyan-400 font-bold text-xs">
            ST
          </span>
          <span className="text-sm font-bold tracking-tight">ShoulderTwin</span>
        </a>
        <span className="text-slate-400 dark:text-slate-600 font-mono text-xs">/</span>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {routeTitles[currentRoute]}
        </span>
      </div>

      {/* Case Quick Search Bar */}
      <div className="hidden md:flex items-center relative max-w-xs w-full">
        <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Quick search case or subject ID..."
          className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md pl-8 pr-3 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-hidden focus:border-teal-500 dark:focus:border-cyan-500 font-mono transition-colors"
        />
        {searchQuery && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-xl py-1 text-xs z-50 max-h-48 overflow-y-auto">
            {filteredCases.length === 0 ? (
              <div className="p-2 text-center text-slate-400 text-xs">No matching cases</div>
            ) : (
              filteredCases.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onSelectCase(c.id);
                    setSearchQuery('');
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="font-mono text-slate-800 dark:text-slate-200">{c.id}</span>
                  <span className="text-[11px] text-slate-400 truncate ml-2">{c.demographics.researchSubjectId}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Active Case Selector + Real Backend Status + Theme Toggle */}
      <div className="flex items-center gap-2.5 shrink-0 ml-auto">
        {/* Active Case Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowCaseDropdown(!showCaseDropdown)}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-md text-xs text-slate-800 dark:text-slate-200 transition-colors max-w-[210px]"
          >
            <FolderOpen className="w-3.5 h-3.5 text-teal-600 dark:text-cyan-400 shrink-0" />
            <div className="truncate text-left font-mono text-[11px] leading-tight">
              {activeCase ? activeCase.id : 'No Case Selected'}
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0 ml-auto" />
          </button>

          {showCaseDropdown && (
            <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-xl py-1 text-xs z-50">
              <div className="px-3 py-1.5 text-[10px] uppercase font-mono text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <span>Select Research Case</span>
                <button
                  onClick={() => {
                    setShowCaseDropdown(false);
                    onOpenCreateCaseModal();
                  }}
                  className="text-teal-600 dark:text-cyan-400 hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" />
                  <span>New</span>
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto">
                {cases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelectCase(c.id);
                      setShowCaseDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 flex flex-col hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors ${
                      activeCase?.id === c.id
                        ? 'bg-teal-50 dark:bg-cyan-500/10 text-teal-900 dark:text-cyan-300'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="font-mono text-[11px] font-semibold flex items-center justify-between">
                      <span>{c.id}</span>
                      {c.isDemo ? (
                        <span className="text-[9px] text-amber-600 dark:text-amber-400 font-sans border border-amber-500/40 px-1 rounded">
                          DEMO
                        </span>
                      ) : (
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-sans border border-emerald-500/40 px-1 rounded">
                          SQLITE
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Real Backend Connection Status */}
        <button
          onClick={() => onRouteChange('settings')}
          title={
            backendHealth.status === 'connected'
              ? `FastAPI Backend Online (${backendHealth.baseUrl})`
              : `FastAPI Backend Unreachable: ${backendHealth.error || 'Server unreachable'}`
          }
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors border ${
            backendHealth.status === 'connected'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : backendHealth.status === 'checking'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/50 hover:bg-rose-100'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span className="text-[11px]">
            {backendHealth.status === 'connected'
              ? backendHealth.baseUrl.includes('render.com')
                ? 'FastAPI Online'
                : 'FastAPI Local'
              : backendHealth.status === 'checking'
              ? 'Checking...'
              : 'Backend Offline'}
          </span>
        </button>

        {/* Working Light/Dark Theme Toggle */}
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700/60 transition-colors"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* Notifications Tray Icon */}
        <button
          onClick={onOpenNotifications}
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors relative"
          title="System Notifications & Event Log"
        >
          <Bell className="w-4 h-4" />
          {unreadNotificationsCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-teal-500 dark:bg-cyan-400" />
          )}
        </button>
      </div>
    </header>
  );
};
