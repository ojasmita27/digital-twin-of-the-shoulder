/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ResearchCase } from '../../types/case';
import { NavRoute } from '../layout/Sidebar';
import { MetricCard } from '../common/MetricCard';
import { StatusBadge } from '../common/StatusBadge';
import {
  FolderPlus,
  Upload,
  Box,
  Server,
  ArrowRight,
  Scan,
  Compass,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

interface OverviewViewProps {
  cases: ResearchCase[];
  activeCase: ResearchCase | null;
  onSelectCase: (caseId: string) => void;
  onNavigate: (route: NavRoute) => void;
  onOpenCreateModal: () => void;
  onResetDemo: () => void;
  isLoading?: boolean;
  backendError?: string | null;
  onRefresh?: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  cases,
  activeCase,
  onSelectCase,
  onNavigate,
  onOpenCreateModal,
  onResetDemo,
  isLoading = false,
  backendError = null,
  onRefresh,
}) => {
  const casesWithImaging = cases.filter((c) => !!c.imaging).length;
  const casesWithMeshes = cases.filter((c) => c.meshes.length > 0).length;
  const casesPlanned = cases.filter((c) => !!c.implantPlan).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono uppercase tracking-wider text-cyan-400">
              Orthopedic Visualization & Planning Architecture
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-xs font-mono text-amber-400/90 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              Phase 1 Engineering Foundation
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">
            Digital Twin of the Shoulder
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl mt-1 leading-relaxed">
            Patient-specific shoulder anatomy reconstruction and preoperative arthroplasty planning platform.
            Transforms cross-sectional CT volumes into inspectable 3D meshes, derives standardized anatomical morphometrics,
            and enables virtual implant alignment.
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-cyan-400 text-slate-950 hover:bg-cyan-300 rounded transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Create New Case</span>
          </button>
          <button
            onClick={() => onNavigate('imaging')}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 rounded transition-colors"
          >
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>Import CT Series</span>
          </button>
        </div>
      </div>

      {/* Honest Scientific Pipeline Architecture */}
      <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400">
            Reconstruction & Planning Pipeline
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">End-to-End Workflow</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-xs">
          {[
            { step: '01', title: 'DICOM CT Ingestion', desc: 'Isotropic 1.0mm voxel resampling', active: true, route: 'imaging' },
            { step: '02', title: 'AI Segmentation', desc: 'Scapula & Humerus mask inference', active: true, route: 'segmentation' },
            { step: '03', title: '3D Surface Meshing', desc: 'Marching cubes & Taubin filter', active: true, route: 'anatomy3d' },
            { step: '04', title: 'Morphometrics', desc: 'Glenoid version, inclination, retroversion', active: true, route: 'measurements' },
            { step: '05', title: 'Implant Placement', desc: 'Metaglene, glenosphere & stem sizing', active: true, route: 'planning' },
            { step: '06', title: 'Surgical Report', desc: 'Validated PDF plan export', active: true, route: 'reports' },
          ].map((item, idx) => (
            <button
              key={item.step}
              onClick={() => onNavigate(item.route as NavRoute)}
              className="text-left p-3 rounded bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors group flex flex-col justify-between"
            >
              <div>
                <span className="text-[10px] font-mono text-cyan-400/80 font-bold block mb-1">
                  {item.step}
                </span>
                <span className="font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors block">
                  {item.title}
                </span>
                <p className="text-[11px] text-slate-500 mt-1 leading-tight">
                  {item.desc}
                </p>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 group-hover:text-cyan-400 mt-3 pt-2 border-t border-slate-900">
                <span>Inspect</span>
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Real Metrics Grid (No fabricated statistics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Registered Cases"
          value={cases.length}
          subtext={`${cases.filter((c) => c.isDemo).length} demo record`}
        />
        <MetricCard
          label="Validated CT Series"
          value={casesWithImaging}
          subtext="DICOM volumes ingested"
        />
        <MetricCard
          label="Reconstructed Meshes"
          value={casesWithMeshes}
          subtext="Scapula & humerus polydata"
        />
        <MetricCard
          label="Active Arthroplasty Plans"
          value={casesPlanned}
          subtext="Reverse & anatomic TSA"
        />
      </div>

      {/* Backend Status Warning (if offline) */}
      {backendError && (
        <div className="p-3.5 bg-rose-950/30 border border-rose-900/50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-300">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-rose-200">Backend Communication Unavailable</div>
              <div className="text-[11px] text-rose-300/90 leading-relaxed mt-0.5">
                {backendError}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                <span>In hosted preview: configure your deployed FastAPI URL in </span>
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className="text-cyan-400 underline hover:text-cyan-300 font-medium"
                >
                  Settings
                </button>
                <span> · Local desktop dev: <code className="text-cyan-300 font-mono text-[10px]">uvicorn backend.app.main:app --port 8001</code></span>
              </div>
            </div>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs font-mono bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded transition-colors shrink-0 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Retry GET /api/cases</span>
            </button>
          )}
        </div>
      )}

      {/* Cases Workspace Quick Access Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Research Cases</h3>
            <span className="text-xs text-slate-500">
              Select a research case to view 3D reconstructions and measurements
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 border border-slate-800 rounded transition-colors font-mono"
                title="Refresh case list from GET /api/cases"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
                <span>{isLoading ? 'Syncing...' : 'Sync'}</span>
              </button>
            )}
            <button
              onClick={onResetDemo}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 border border-slate-800 rounded"
              title="Reload baseline reference case"
            >
              Reload Demo Baseline
            </button>
            <button
              onClick={() => onNavigate('cases')}
              className="px-2.5 py-1 text-xs text-cyan-400 hover:underline font-mono"
            >
              View Full Table →
            </button>
          </div>
        </div>

        {cases.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No research cases registered. Click "Create New Case" or "Reload Demo Baseline" to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2.5">Case Identifier</th>
                  <th className="px-4 py-2.5">Subject & Indication</th>
                  <th className="px-4 py-2.5">Side</th>
                  <th className="px-4 py-2.5">Pipeline State</th>
                  <th className="px-4 py-2.5">Meshes</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      activeCase?.id === c.id ? 'bg-cyan-500/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-mono font-medium text-slate-100">
                      <div className="flex items-center gap-1.5">
                        <span>{c.id}</span>
                        {c.isDemo ? (
                          <span className="text-[9px] text-amber-400 font-sans border border-amber-500/40 px-1 rounded">
                            SYNTHETIC DEMO
                          </span>
                        ) : (
                          <span className="text-[9px] text-emerald-400 font-sans border border-emerald-500/40 px-1 rounded">
                            BACKEND
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200">{c.name}</div>
                      <div className="text-[11px] text-slate-500">{c.demographics.indication}</div>
                    </td>
                    <td className="px-4 py-3 capitalize font-mono text-slate-400">
                      {c.demographics.affectedSide}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {c.meshes.length} models
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => {
                          onSelectCase(c.id);
                          onNavigate('anatomy3d');
                        }}
                        className="px-2 py-1 text-xs text-cyan-400 hover:text-cyan-300 border border-slate-800 hover:border-slate-700 rounded transition-colors"
                      >
                        Open 3D
                      </button>
                      <button
                        onClick={() => {
                          onSelectCase(c.id);
                          onNavigate('imaging');
                        }}
                        className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 border border-slate-800 rounded transition-colors"
                      >
                        CT Slices
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
