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
  badge?: string;
  badgeType?: 'active' | 'pending' | 'planned';
}

const NAV_ITEMS: NavItemConfig[] = [
  { route: 'overview', label: 'Overview', icon: LayoutDashboard },
  { route: 'cases', label: 'Cases', icon: FolderKanban },
  { route: 'imaging', label: 'Imaging (CT)', icon: Scan },
  { route: 'segmentation', label: 'Segmentation', icon: Cpu, badge: 'GPU', badgeType: 'pending' },
  { route: 'anatomy3d', label: '3D Anatomy', icon: Box, badge: 'Interactive', badgeType: 'active' },
  { route: 'measurements', label: 'Measurements', icon: Ruler },
  { route: 'planning', label: 'Implant Planning', icon: Compass },
  { route: 'reports', label: 'Reports', icon: FileCheck },
  { route: 'research', label: 'Research Datasets', icon: Database },
  { route: 'settings', label: 'API & Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onRouteChange,
  collapsed,
  onToggleCollapse,
}) => {
  return (
    <aside
      className={`relative flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-200 select-none ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-slate-800">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-6 h-6 rounded bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xs">
              DT
            </div>
            <div className="font-semibold text-sm tracking-tight text-slate-100 truncate">
              Shoulder Twin
            </div>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto w-7 h-7 rounded bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xs">
            DT
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className={`p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors ${
            collapsed ? 'mx-auto mt-2' : ''
          }`}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentRoute === item.route;

          return (
            <button
              key={item.route}
              onClick={() => onRouteChange(item.route)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                isActive
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
              {!collapsed && (
                <div className="flex items-center justify-between flex-1 truncate">
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                        item.badgeType === 'active'
                          ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800'
                          : item.badgeType === 'pending'
                          ? 'bg-amber-950/40 text-amber-300 border-amber-900/60'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Research Prototype Notice in Footer */}
      {!collapsed && (
        <div className="p-3 mx-2 mb-3 bg-slate-950/70 border border-slate-800 rounded text-[11px] text-slate-400 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-amber-400/90 font-medium text-[11px]">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>Research Prototype</span>
          </div>
          <p className="text-[10px] text-slate-500 leading-tight">
            Not for direct clinical diagnosis or surgical intervention.
          </p>
        </div>
      )}
    </aside>
  );
};
