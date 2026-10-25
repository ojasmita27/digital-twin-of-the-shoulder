/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { NavRoute } from './Sidebar';
import { ResearchCase } from '../../types/case';
import { apiClient } from '../../services/apiClient';
import { BackendHealthResponse } from '../../types/api';
import {
  Server,
  FolderOpen,
  ChevronDown,
  Bell,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Cpu,
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
  const [backendHealth, setBackendHealth] = useState<{
    status: 'checking' | 'connected' | 'unreachable';
    error?: string;
    details?: BackendHealthResponse | null;
  }>({ status: 'checking' });

  const [showCaseDropdown, setShowCaseDropdown] = useState(false);

  // Perform genuine health check on mount and interval
  const checkBackend = async () => {
    setBackendHealth((prev) => ({ ...prev, status: 'checking' }));
    const result = await apiClient.checkHealth();
    const currentBaseUrl = apiClient.getConfig().baseUrl || 'same-origin proxy (/api)';
    if (result.data) {
      setBackendHealth({
        status: 'connected',
        details: result.data,
      });
    } else {
      setBackendHealth({
        status: 'unreachable',
        error: result.error || `Connection refused (${currentBaseUrl})`,
        details: null,
      });
    }
  };

  useEffect(() => {
    checkBackend();
    const interval = setInterval(checkBackend, 30000); // 30s probe
    return () => clearInterval(interval);
  }, []);

  const routeTitles: Record<NavRoute, string> = {
    overview: 'Project Overview',
    cases: 'Case Management',
    imaging: 'CT Multi-Planar Viewer',
    segmentation: 'Anatomical Segmentation',
    anatomy3d: '3D Shoulder Viewport',
    measurements: 'Morphometric Measurements',
    planning: 'Arthroplasty Planning',
    reports: 'Clinical Reports',
    research: 'Research Datasets',
    settings: 'Backend API & Settings',
  };

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between gap-8 select-none z-30">
      {/* Zone 1: Brand Wordmark (Single text element wordmark as required by Top Bar Contract) */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            onRouteChange('overview');
          }}
          className="text-sm font-bold tracking-tight text-slate-100 whitespace-nowrap hover:text-cyan-400 transition-colors"
        >
          Digital Twin of the Shoulder
        </a>
        <span className="text-slate-600 font-mono text-xs">/</span>
        <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
          {routeTitles[currentRoute]}
        </span>
      </div>

      {/* Zone 2: Fast Navigation Links (Single-line, whitespace-nowrap) */}
      <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
        <button
          onClick={() => onRouteChange('overview')}
          className={`whitespace-nowrap transition-colors hover:text-slate-100 ${
            currentRoute === 'overview' ? 'text-cyan-400 font-semibold' : ''
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => onRouteChange('cases')}
          className={`whitespace-nowrap transition-colors hover:text-slate-100 ${
            currentRoute === 'cases' ? 'text-cyan-400 font-semibold' : ''
          }`}
        >
          Cases
        </button>
        <button
          onClick={() => onRouteChange('imaging')}
          className={`whitespace-nowrap transition-colors hover:text-slate-100 ${
            currentRoute === 'imaging' ? 'text-cyan-400 font-semibold' : ''
          }`}
        >
          Imaging
        </button>
        <button
          onClick={() => onRouteChange('anatomy3d')}
          className={`whitespace-nowrap transition-colors hover:text-slate-100 ${
            currentRoute === 'anatomy3d' ? 'text-cyan-400 font-semibold' : ''
          }`}
        >
          3D Anatomy
        </button>
        <button
          onClick={() => onRouteChange('planning')}
          className={`whitespace-nowrap transition-colors hover:text-slate-100 ${
            currentRoute === 'planning' ? 'text-cyan-400 font-semibold' : ''
          }`}
        >
          Planning
        </button>
      </nav>

      {/* Zone 3: Active Case Selector + Real Backend Status (Honest, no fake green indicator) */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Active Case Selector */}
        <div className="relative">
          <button
            onClick={() => setShowCaseDropdown(!showCaseDropdown)}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded text-xs text-slate-200 transition-colors max-w-[200px]"
          >
            <FolderOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate font-mono text-[11px]">
              {activeCase ? activeCase.id : 'No Case Selected'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
          </button>

          {showCaseDropdown && (
            <div className="absolute right-0 mt-1 w-64 bg-slate-900 border border-slate-800 rounded-md shadow-xl py-1 text-xs z-50">
              <div className="px-3 py-1.5 text-[10px] uppercase font-mono text-slate-500 border-b border-slate-800 flex justify-between items-center">
                <span>Select Case</span>
                <button
                  onClick={() => {
                    setShowCaseDropdown(false);
                    onOpenCreateCaseModal();
                  }}
                  className="text-cyan-400 hover:underline"
                >
                  + New
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto">
                {cases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelectCase(c.id);
                      setShowCaseDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 flex flex-col hover:bg-slate-800/80 transition-colors ${
                      activeCase?.id === c.id ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-300'
                    }`}
                  >
                    <div className="font-mono text-[11px] font-semibold flex items-center justify-between">
                      <span>{c.id}</span>
                      {c.isDemo && (
                        <span className="text-[9px] text-amber-400 font-sans border border-amber-500/40 px-1 rounded">
                          DEMO
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Real Backend Connection Status (Never fake a green light) */}
        <button
          onClick={() => onRouteChange('settings')}
          title={
            backendHealth.status === 'connected'
              ? 'FastAPI Backend Connected'
              : `FastAPI Backend Unreachable: ${backendHealth.error || 'Server not running at localhost:8000'}`
          }
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono transition-colors border ${
            backendHealth.status === 'connected'
              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800'
              : backendHealth.status === 'checking'
              ? 'bg-slate-800 text-slate-400 border-slate-700'
              : 'bg-rose-950/30 text-rose-300 border-rose-900/50 hover:bg-rose-950/50'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span className="text-[11px]">
            {backendHealth.status === 'connected'
              ? 'FastAPI Online'
              : backendHealth.status === 'checking'
              ? 'Checking...'
              : 'Backend Unavailable'}
          </span>
        </button>

        {/* Notifications Tray Icon */}
        <button
          onClick={onOpenNotifications}
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors relative"
          title="System Event & Log Center"
        >
          <Bell className="w-4 h-4" />
          {unreadNotificationsCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400" />
          )}
        </button>
      </div>
    </header>
  );
};
