/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Scan,
  Cpu,
  Box,
  Ruler,
  Compass,
  FileCheck,
  Database,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { ANATOMY_IMAGES } from '../../assets/anatomyImages';

export type NavRoute =
  | 'overview'
  | 'cases'
  | 'imaging'
  | 'segmentation'
  | 'anatomy3d'
  | 'measurements'
  | 'planning'
  | 'reports'
  | 'research'
  | 'settings';

interface SidebarProps {
  currentRoute: NavRoute;
  onRouteChange: (route: NavRoute) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItemConfig {
  route: NavRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_NAV_ITEMS: NavItemConfig[] = [
  { route: 'overview', label: 'Overview', icon: LayoutDashboard },
  { route: 'cases', label: 'Research Cases', icon: FolderKanban },
  { route: 'imaging', label: 'CT Imaging', icon: Scan },
  { route: 'segmentation', label: 'Segmentation', icon: Cpu },
  { route: 'anatomy3d', label: '3D Reconstruction', icon: Box },
  { route: 'measurements', label: 'Measurements', icon: Ruler },
  { route: 'planning', label: 'Implant Planning', icon: Compass },
  { route: 'reports', label: 'Reports', icon: FileCheck },
];

const SECONDARY_NAV_ITEMS: NavItemConfig[] = [
  { route: 'research', label: 'Research Datasets', icon: Database },
  { route: 'settings', label: 'Developer Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onRouteChange,
  collapsed,
  onToggleCollapse,
}) => {
  return (
    <aside
      className={`relative flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-200 select-none z-20 overflow-hidden ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-6 h-6 rounded bg-teal-600/10 dark:bg-cyan-500/10 border border-teal-600/20 dark:border-cyan-500/30 flex items-center justify-center text-teal-700 dark:text-cyan-400 font-bold text-xs shrink-0">
              ST
            </div>
            <div className="font-semibold text-sm tracking-tight text-slate-900 dark:text-slate-100 truncate">
              ShoulderTwin
            </div>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto w-7 h-7 rounded bg-teal-600/10 dark:bg-cyan-500/10 border border-teal-600/20 dark:border-cyan-500/30 flex items-center justify-center text-teal-700 dark:text-cyan-400 font-bold text-xs">
            ST
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className={`p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors ${
            collapsed ? 'mx-auto mt-2' : ''
          }`}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Primary Navigation List (8 Modules) */}
      <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto relative z-10">
        {!collapsed && (
          <div className="px-2.5 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
            Clinical Workspaces
          </div>
        )}
        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentRoute === item.route;

          return (
            <button
              key={item.route}
              onClick={() => onRouteChange(item.route)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                isActive
                  ? 'bg-teal-50 dark:bg-cyan-500/10 text-teal-800 dark:text-cyan-300 border border-teal-200 dark:border-cyan-500/30 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-teal-700 dark:text-cyan-400' : 'text-slate-500 dark:text-slate-400'
                }`}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Secondary Navigation Section (Configuration) */}
      <div className="px-2.5 py-2 border-t border-slate-200 dark:border-slate-800/80 space-y-1 relative z-10">
        {!collapsed && (
          <div className="px-2.5 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
            System & Data
          </div>
        )}
        {SECONDARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentRoute === item.route;

          return (
            <button
              key={item.route}
              onClick={() => onRouteChange(item.route)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                isActive
                  ? 'bg-teal-50 dark:bg-cyan-500/10 text-teal-800 dark:text-cyan-300 border border-teal-200 dark:border-cyan-500/30 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-teal-700 dark:text-cyan-400' : 'text-slate-500 dark:text-slate-400'
                }`}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Subtle Anatomical Watermark Background Illustration */}
      {!collapsed && (
        <div className="absolute bottom-16 right-0 w-44 h-44 opacity-8 dark:opacity-15 pointer-events-none select-none overflow-hidden z-0">
          <img
            src={ANATOMY_IMAGES.sidebarWatermark}
            alt=""
            className="w-full h-full object-cover filter contrast-125 dark:invert-0 invert"
          />
        </div>
      )}

      {/* Research Prototype Notice in Footer */}
      {!collapsed && (
        <div className="p-3 mx-2.5 mb-3 bg-amber-50/70 dark:bg-slate-950/70 border border-amber-200/80 dark:border-slate-800 rounded-md text-[11px] text-slate-600 dark:text-slate-400 flex flex-col gap-1 relative z-10">
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium text-[11px]">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>Research Prototype</span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-500 leading-tight">
            Not for direct clinical diagnosis or surgical intervention.
          </p>
        </div>
      )}
    </aside>
  );
};
