/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ANATOMY_IMAGES } from '../../assets/anatomyImages';
import {
  LayoutDashboard,
  FolderKanban,
  Scan,
  Cpu,
  Box,
  Ruler,
  Wrench,
  FileCheck,
  Database,
  Settings,
  ChevronDown,
  Layers,
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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavItemConfig {
  route: NavRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Exactly matching reference 8 Clinical Workspaces
const PRIMARY_NAV_ITEMS: NavItemConfig[] = [
  { route: 'overview', label: 'Overview', icon: LayoutDashboard },
  { route: 'cases', label: 'Research Cases', icon: FolderKanban },
  { route: 'imaging', label: 'CT Imaging', icon: Scan },
  { route: 'segmentation', label: 'Segmentation', icon: Layers },
  { route: 'anatomy3d', label: '3D Reconstruction', icon: Box },
  { route: 'measurements', label: 'Measurements', icon: Ruler },
  { route: 'planning', label: 'Implant Planning', icon: Wrench },
  { route: 'reports', label: 'Reports', icon: FileCheck },
];

const ADMIN_NAV_ITEMS: NavItemConfig[] = [
  { route: 'research', label: 'Research Datasets', icon: Database },
  { route: 'settings', label: 'Developer & Admin', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onRouteChange,
}) => {
  const { user } = useAuth();
  const isAdminActive = currentRoute === 'research' || currentRoute === 'settings';
  const [adminExpanded, setAdminExpanded] = useState(isAdminActive);
  const showAdminSection = user?.role === 'admin';

  return (
    <aside className="relative flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200/90 dark:border-slate-800 transition-colors select-none z-20 shrink-0 h-full overflow-hidden">
      {/* Brand Header - Matching Reference: Shoulder Logo + ShoulderTwin + Digital Twin of the Shoulder */}
      <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
        <img
          src={ANATOMY_IMAGES.logo}
          alt="ShoulderTwin Logo"
          className="w-8 h-8 object-contain shrink-0"
        />
        <div className="overflow-hidden">
          <div className="font-bold text-base text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
            ShoulderTwin
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium truncate">
            Digital Twin of the Shoulder
          </div>
        </div>
      </div>

      {/* Primary Clinician Navigation List (8 Workspaces) */}
      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto z-10">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          CLINICAL WORKSPACE
        </div>

        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentRoute === item.route;

          return (
            <button
              key={item.route}
              onClick={() => onRouteChange(item.route)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all text-left ${
                isActive
                  ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200 font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-colors ${
                  isActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}

        {/* Discreet Secondary Admin & Research section (shown only to authorized admin accounts) */}
        {showAdminSection && (
          <div className="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800/60">
            <button
              onClick={() => setAdminExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <span>RESEARCH & ADMIN</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform ${adminExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            {adminExpanded && (
              <div className="space-y-1 mt-1">
                {ADMIN_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentRoute === item.route;

                  return (
                    <button
                      key={item.route}
                      onClick={() => onRouteChange(item.route)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-[11px] font-medium transition-all text-left ${
                        isActive
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Watermark Illustration in Bottom Left - Blended faintly like in reference */}
      <div className="absolute -bottom-6 -left-6 w-44 h-60 pointer-events-none opacity-20 dark:opacity-10 select-none overflow-hidden z-0">
        <img
          src={ANATOMY_IMAGES.watermark}
          alt=""
          className="w-full h-full object-contain filter grayscale"
        />
      </div>

      {/* Compact Research Disclaimer (Exact Reference Copy) */}
      <div className="relative p-4 border-t border-slate-100 dark:border-slate-800 text-[10.5px] text-slate-400 dark:text-slate-500 leading-relaxed z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs">
        Research prototype — not intended for direct clinical diagnosis or surgical decision-making.
      </div>
    </aside>
  );
};
