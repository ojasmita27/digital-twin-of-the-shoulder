/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ResearchCase, CaseStatus } from '../../types/case';
import { NavRoute } from '../layout/Sidebar';
import { MetricCard } from '../common/MetricCard';
import { StatusBadge } from '../common/StatusBadge';
import { ANATOMY_IMAGES } from '../../assets/anatomyImages';
import {
  FolderPlus,
  Upload,
  Box,
  ArrowRight,
  Scan,
  Compass,
  FileCheck,
  RefreshCw,
  AlertTriangle,
  Layers,
  Ruler,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronRight,
  Activity,
  ShieldCheck,
  ShieldAlert,
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
  const backendCasesCount = cases.filter((c) => !c.isDemo).length;
  const demoCasesCount = cases.filter((c) => c.isDemo).length;
  const casesWithImaging = cases.filter((c) => !!c.imaging).length;
  const casesWithMeshes = cases.filter((c) => c.meshes.length > 0).length;
  const casesPlanned = cases.filter((c) => !!c.implantPlan).length;

  // Workflow steps definition
  const WORKFLOW_STEPS: {
    key: NavRoute;
    label: string;
    isCompleted: (c: ResearchCase | null) => boolean;
    isActive: (c: ResearchCase | null) => boolean;
  }[] = [
    {
      key: 'cases',
      label: '1. Research Case',
      isCompleted: (c) => !!c,
      isActive: (c) => !c || c.status === 'created',
    },
    {
      key: 'imaging',
      label: '2. CT Imaging',
      isCompleted: (c) => !!c?.imaging,
      isActive: (c) => !!c && (!c.imaging || c.status === 'imaging_imported'),
    },
    {
      key: 'segmentation',
      label: '3. Segmentation',
      isCompleted: (c) => (c?.meshes.length ?? 0) > 0 || c?.status === 'segmentation_completed',
      isActive: (c) => !!c?.imaging && (c?.meshes.length ?? 0) === 0,
    },
    {
      key: 'anatomy3d',
      label: '4. 3D Reconstruction',
      isCompleted: (c) => (c?.meshes.length ?? 0) > 0 || c?.status === 'models_generated',
      isActive: (c) => !!c && (c.meshes.length > 0 || !!c.imaging),
    },
    {
      key: 'measurements',
      label: '5. Measurements',
      isCompleted: (c) => !!c?.measurements,
      isActive: (c) => !!c?.landmarks && !c.measurements,
    },
    {
      key: 'planning',
      label: '6. Implant Plan',
      isCompleted: (c) => !!c?.implantPlan,
      isActive: (c) => !!c?.measurements && !c.implantPlan,
    },
    {
      key: 'reports',
      label: '7. Surgical Report',
      isCompleted: (c) => (c?.reports.length ?? 0) > 0,
      isActive: (c) => !!c?.implantPlan,
    },
  ];

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* 1. VISUAL REFERENCE HERO SECTION */}
      <div className="relative overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm transition-colors">
        {/* Subtle background ambient gradient */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/5 dark:bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-6 p-6 sm:p-8 relative z-10">
          {/* Left Hero Content (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-cyan-950/40 border border-teal-200/80 dark:border-cyan-800/60 text-[11px] font-mono text-teal-700 dark:text-cyan-300">
              <Activity className="w-3.5 h-3.5 text-teal-600 dark:text-cyan-400" />
              <span>Orthopedic Medical Imaging & Preoperative Planning</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Digital Twin of the Shoulder
            </h1>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
              An interactive research platform transforming cross-sectional CT series into patient-specific 3D anatomical models, calculating ISB-standardized morphometrics, and simulating reverse and anatomic arthroplasty implants.
            </p>

            {/* Hero Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={onOpenCreateModal}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white dark:bg-cyan-400 dark:hover:bg-cyan-300 dark:text-slate-950 rounded-lg shadow-sm transition-all transform active:scale-95"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Create Research Case</span>
              </button>

              <button
                onClick={() => onNavigate('imaging')}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4 text-teal-600 dark:text-cyan-400" />
                <span>Import CT Series (.dcm)</span>
              </button>
            </div>

            {/* Active Case Quick Stat Bar */}
            {activeCase && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono text-[11px]">Mounted Case:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                  {activeCase.id}
                </span>
                <span>·</span>
                <span className="capitalize">{activeCase.demographics.affectedSide} Shoulder</span>
                <span>·</span>
                <span className="truncate max-w-[180px]">{activeCase.demographics.indication}</span>
              </div>
            )}
          </div>

          {/* Right Hero Visual: Transparent 3D Anatomical Shoulder (5 cols) */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            <div className="relative w-full max-w-sm aspect-4/3 rounded-lg overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-radial from-slate-100 to-slate-200/60 dark:from-slate-800/50 dark:to-slate-950 shadow-inner group">
              <img
                src={ANATOMY_IMAGES.hero}
                alt="Human Shoulder Joint Anatomy 3D Rendering"
                className="w-full h-full object-contain filter contrast-105 select-none transition-transform duration-500 group-hover:scale-105"
              />

              {/* Anatomical Structure Pin Labels */}
              <div className="absolute top-3 left-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200 dark:border-slate-700/80 px-2 py-0.5 rounded text-[10px] font-mono text-slate-700 dark:text-slate-300 shadow-xs pointer-events-none">
                Clavicle
              </div>

              <div className="absolute bottom-6 left-6 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200 dark:border-slate-700/80 px-2 py-0.5 rounded text-[10px] font-mono text-slate-700 dark:text-slate-300 shadow-xs pointer-events-none">
                Proximal Humerus
              </div>

              <div className="absolute top-1/2 right-4 -translate-y-1/2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200 dark:border-slate-700/80 px-2 py-0.5 rounded text-[10px] font-mono text-slate-700 dark:text-slate-300 shadow-xs pointer-events-none">
                Scapular Vault
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. COMPACT CLINICAL WORKFLOW TRACKER */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs transition-colors">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Clinical Assessment Workflow
            </h2>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {activeCase ? `Active: ${activeCase.id}` : 'Select a case to track progress'}
            </span>
          </div>

          {activeCase && (
            <span className="text-[11px] font-mono text-teal-600 dark:text-cyan-400">
              <StatusBadge status={activeCase.status} />
            </span>
          )}
        </div>

        {/* Workflow Progression Stepper */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {WORKFLOW_STEPS.map((step, idx) => {
            const completed = step.isCompleted(activeCase);
            const active = step.isActive(activeCase);

            return (
              <button
                key={step.key}
                onClick={() => onNavigate(step.key)}
                className={`p-2.5 rounded-md border text-left transition-all flex flex-col justify-between ${
                  active
                    ? 'bg-teal-50/80 dark:bg-cyan-950/40 border-teal-300 dark:border-cyan-700/80 text-teal-900 dark:text-cyan-200 shadow-xs'
                    : completed
                    ? 'bg-slate-50 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300 hover:border-slate-300'
                    : 'bg-slate-50/40 dark:bg-slate-950/40 border-slate-100 dark:border-slate-800/50 text-slate-400 dark:text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono font-bold">
                    {completed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 inline" />
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">0{idx + 1}</span>
                    )}
                  </span>
                  <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                </div>
                <span className="text-[11px] font-medium truncate block">
                  {step.label.split('. ')[1]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. REAL SUMMARY METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Registered Cases"
          value={cases.length}
          subtext={`${backendCasesCount} backend · ${demoCasesCount} demo`}
        />
        <MetricCard
          label="CT Series Ingested"
          value={casesWithImaging}
          subtext={`${casesWithImaging} of ${cases.length} with CT data`}
        />
        <MetricCard
          label="Reconstructed Meshes"
          value={casesWithMeshes}
          subtext={`${casesWithMeshes} cases with polygonal bone models`}
        />
        <MetricCard
          label="Preoperative Plans"
          value={casesPlanned}
          subtext={`${casesPlanned} virtual arthroplasty plans`}
        />
      </div>

      {/* Backend Status Warning (if offline) */}
      {backendError && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-300 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-rose-900 dark:text-rose-200">Backend Communication Offline</div>
              <div className="text-[11px] text-rose-700 dark:text-rose-300/90 leading-relaxed mt-0.5">
                {backendError}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                <span>Configure your hosted FastAPI base URL in </span>
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className="text-teal-600 dark:text-cyan-400 underline font-medium"
                >
                  Developer Settings
                </button>
                <span> · Local desktop dev: <code className="text-teal-700 dark:text-cyan-300 font-mono text-[10px]">uvicorn backend.app.main:app --port 8001</code></span>
              </div>
            </div>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-md transition-colors shrink-0 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-teal-600 dark:text-cyan-400' : ''}`} />
              <span>Sync GET /api/cases</span>
            </button>
          )}
        </div>
      )}

      {/* 4. ACTIVE CASE ASSESSMENT WORKBENCH */}
      {activeCase && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-xs transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-teal-700 dark:text-cyan-400 font-semibold">
                  Active Clinical Subject
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-200">{activeCase.id}</span>
                {activeCase.isDemo ? (
                  <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-transparent border border-amber-500/40 px-1.5 py-0.5 rounded">
                    DEMO MODEL
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-transparent border border-emerald-500/40 px-1.5 py-0.5 rounded">
                    SQLITE PERSISTED
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
                {activeCase.name}
              </h2>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                <span>Subject: <strong className="text-slate-800 dark:text-slate-200">{activeCase.demographics.researchSubjectId}</strong></span>
                <span>·</span>
                <span>Indication: <strong className="text-slate-800 dark:text-slate-200">{activeCase.demographics.indication}</strong></span>
                <span>·</span>
                <span>Side: <strong className="text-slate-800 dark:text-slate-200 capitalize">{activeCase.demographics.affectedSide}</strong></span>
              </div>
            </div>

            {/* Direct Workflow Launch Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onNavigate('anatomy3d')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-50 dark:bg-cyan-500/10 hover:bg-teal-100 dark:hover:bg-cyan-500/20 text-teal-800 dark:text-cyan-300 border border-teal-200 dark:border-cyan-500/30 rounded-md transition-colors"
              >
                <Box className="w-3.5 h-3.5" />
                <span>Open 3D Model</span>
              </button>
              <button
                onClick={() => onNavigate('imaging')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md transition-colors"
              >
                <Scan className="w-3.5 h-3.5" />
                <span>CT Viewer</span>
              </button>
              <button
                onClick={() => onNavigate('planning')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md transition-colors"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Implant Plan</span>
              </button>
            </div>
          </div>

          {/* 6-Point Case Assessment Checklist */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-4 text-xs">
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">CT Series</span>
              {activeCase.imaging ? (
                <div className="font-semibold text-emerald-700 dark:text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{activeCase.imaging.sliceCount} slices</span>
                </div>
              ) : (
                <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">Not Uploaded</span>
              )}
            </div>

            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">CT Validation</span>
              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                {activeCase.imaging?.reconstructionReadiness || (activeCase.imaging ? 'Volumetric' : 'Pending')}
              </span>
            </div>

            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">AI Segmentation</span>
              <span className="font-mono text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                {activeCase.meshes.length > 0 ? 'Template Ready' : 'Model Pending'}
              </span>
            </div>

            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">3D Anatomy</span>
              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                {activeCase.meshes.length > 0 ? `${activeCase.meshes.length} Meshes` : 'Demo Template'}
              </span>
            </div>

            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">Morphometrics</span>
              <span className="font-mono text-[11px] text-teal-700 dark:text-cyan-400 font-semibold">
                {activeCase.measurements ? `${activeCase.measurements.glenoidVersionDeg}° Version` : 'Pending'}
              </span>
            </div>

            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">Arthroplasty Plan</span>
              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 font-medium truncate block">
                {activeCase.implantPlan ? activeCase.implantPlan.procedureType.replace('_', ' ') : 'Unplanned'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5. RECENT RESEARCH CASES TABLE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-xs transition-colors">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent Research Cases</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Registered patient-specific cases and baseline reference models
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-md transition-colors font-mono"
                title="Refresh case list from GET /api/cases"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-teal-600 dark:text-cyan-400' : ''}`} />
                <span>{isLoading ? 'Syncing...' : 'Sync'}</span>
              </button>
            )}
            <button
              onClick={onResetDemo}
              className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-md"
              title="Reload baseline reference case"
            >
              Restore Demo
            </button>
            <button
              onClick={() => onNavigate('cases')}
              className="px-2.5 py-1 text-xs text-teal-600 dark:text-cyan-400 hover:underline font-mono"
            >
              View All Cases →
            </button>
          </div>
        </div>

        {cases.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No research cases registered. Click "Create Research Case" above to start.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-mono text-[11px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-2.5">Case ID</th>
                  <th className="px-4 py-2.5">Subject & Indication</th>
                  <th className="px-4 py-2.5">Side</th>
                  <th className="px-4 py-2.5">CT Series</th>
                  <th className="px-4 py-2.5">Pipeline Stage</th>
                  <th className="px-4 py-2.5">Last Updated</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                      activeCase?.id === c.id ? 'bg-teal-50/50 dark:bg-cyan-500/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-1.5">
                        <span>{c.id}</span>
                        {c.isDemo ? (
                          <span className="text-[9px] text-amber-700 dark:text-amber-400 font-sans border border-amber-500/40 px-1 rounded">
                            DEMO
                          </span>
                        ) : (
                          <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-sans border border-emerald-500/40 px-1 rounded">
                            SQLITE
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-slate-200">{c.name}</div>
                      <div className="text-[11px] text-slate-500">{c.demographics.indication}</div>
                    </td>
                    <td className="px-4 py-3 capitalize font-mono text-slate-600 dark:text-slate-400">
                      {c.demographics.affectedSide}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      {c.imaging ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {c.imaging.sliceCount} slices
                        </span>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                      {c.updatedAt ? c.updatedAt.split('T')[0] : c.createdAt.split('T')[0]}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => {
                          onSelectCase(c.id);
                          onNavigate('anatomy3d');
                        }}
                        className="px-2.5 py-1 text-xs text-teal-700 dark:text-cyan-400 hover:underline border border-slate-200 dark:border-slate-800 rounded transition-colors"
                      >
                        Open 3D
                      </button>
                      <button
                        onClick={() => {
                          onSelectCase(c.id);
                          onNavigate('imaging');
                        }}
                        className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800 rounded transition-colors"
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
