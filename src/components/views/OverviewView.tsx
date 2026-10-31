/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ResearchCase } from '../../types/case';
import { NavRoute } from '../layout/Sidebar';
import { ANATOMY_IMAGES } from '../../assets/anatomyImages';
import {
  FolderPlus,
  Upload,
  Box,
  ArrowRight,
  Ruler,
  Wrench,
  FileCheck,
  ChevronRight,
  Folder,
  Calendar,
  Layers,
  FileText,
  Activity,
  Check,
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

type StepStatus = 'completed' | 'in_progress' | 'not_started';

interface WorkflowStepConfig {
  key: NavRoute;
  number: number;
  label: string;
  status: StepStatus;
  statusText: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  cases,
  activeCase,
  onSelectCase,
  onNavigate,
  onOpenCreateModal,
}) => {
  // Determine realistic workflow status for the active case
  const getWorkflowSteps = (): WorkflowStepConfig[] => {
    // 1. Research Case
    const caseCompleted = !!activeCase;

    // 2. CT Imaging
    const imagingCompleted = !!(activeCase?.imaging && activeCase.imaging.sliceCount > 0);
    const imagingInProgress = !!activeCase && !imagingCompleted;

    // 3. 3D Reconstruction
    const reconCompleted = !!(activeCase && activeCase.meshes.length > 0);
    const reconInProgress = !!activeCase && imagingCompleted && !reconCompleted;

    // 4. Measurements
    const measCompleted = !!(activeCase?.measurements);
    const measInProgress = !!activeCase && reconCompleted && !measCompleted;

    // 5. Implant Planning
    const planCompleted = !!(activeCase?.implantPlan);
    const planInProgress = !!activeCase && measCompleted && !planCompleted;

    // 6. Report
    const reportCompleted = !!(activeCase && activeCase.reports.length > 0);
    const reportInProgress = !!activeCase && planCompleted && !reportCompleted;

    return [
      {
        key: 'cases',
        number: 1,
        label: 'Research Case',
        status: caseCompleted ? 'completed' : 'not_started',
        statusText: caseCompleted ? 'Completed' : 'Not Started',
        icon: FileText,
      },
      {
        key: 'imaging',
        number: 2,
        label: 'CT Imaging',
        status: imagingCompleted ? 'completed' : imagingInProgress ? 'in_progress' : 'not_started',
        statusText: imagingCompleted ? 'Completed' : imagingInProgress ? 'In Progress' : 'Not Started',
        icon: Layers,
      },
      {
        key: 'anatomy3d',
        number: 3,
        label: '3D Reconstruction',
        status: reconCompleted ? 'completed' : reconInProgress ? 'in_progress' : 'not_started',
        statusText: reconCompleted ? 'Completed' : reconInProgress ? 'In Progress' : 'Not Started',
        icon: Box,
      },
      {
        key: 'measurements',
        number: 4,
        label: 'Measurements',
        status: measCompleted ? 'completed' : measInProgress ? 'in_progress' : 'not_started',
        statusText: measCompleted ? 'Completed' : measInProgress ? 'In Progress' : 'Not Started',
        icon: Ruler,
      },
      {
        key: 'planning',
        number: 5,
        label: 'Implant Planning',
        status: planCompleted ? 'completed' : planInProgress ? 'in_progress' : 'not_started',
        statusText: planCompleted ? 'Completed' : planInProgress ? 'In Progress' : 'Not Started',
        icon: Wrench,
      },
      {
        key: 'reports',
        number: 6,
        label: 'Report',
        status: reportCompleted ? 'completed' : reportInProgress ? 'in_progress' : 'not_started',
        statusText: reportCompleted ? 'Completed' : reportInProgress ? 'In Progress' : 'Not Started',
        icon: FileCheck,
      },
    ];
  };

  const workflowSteps = getWorkflowSteps();

  // Determine next assessment step
  const getNextDestination = (): { label: string; route: NavRoute } => {
    if (!activeCase) return { label: 'Create Research Case', route: 'cases' };
    if (!activeCase.imaging) return { label: 'Continue Assessment', route: 'imaging' };
    if (activeCase.meshes.length === 0 && !activeCase.isDemo) return { label: 'Continue Assessment', route: 'anatomy3d' };
    if (!activeCase.measurements) return { label: 'Continue Assessment', route: 'measurements' };
    if (!activeCase.implantPlan) return { label: 'Continue Assessment', route: 'planning' };
    return { label: 'Continue Assessment', route: 'reports' };
  };

  const nextDestination = getNextDestination();

  // Ensure baseline cases are shown gracefully in the Recent Cases table
  const baselineDemoCases = [
    {
      id: 'DEMO-SHL-2026-0042',
      side: 'Right',
      indication: 'Primary Osteoarthritis',
      status: 'In Progress',
      statusVariant: 'sky',
      updated: '12 Jan 2026',
    },
    {
      id: 'DEMO-SHL-2026-0041',
      side: 'Left',
      indication: 'Rotator Cuff Arthropathy',
      status: 'CT Imported',
      statusVariant: 'emerald',
      updated: '10 Jan 2026',
    },
    {
      id: 'DEMO-SHL-2026-0039',
      side: 'Right',
      indication: 'Fracture',
      status: 'Planning',
      statusVariant: 'amber',
      updated: '08 Jan 2026',
    },
  ];

  // Merge loaded real cases with baseline demonstration rows if appropriate
  const displayedCases = cases.length > 0 ? cases.slice(0, 5) : [];

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* 1. CLINICAL HERO SECTION - Matching Reference Image Composition */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-50 via-sky-50/70 to-[#dce8f5] dark:from-slate-900 dark:via-slate-900/95 dark:to-slate-950 border border-slate-200/90 dark:border-slate-800 p-8 sm:p-10 transition-colors shadow-2xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-6">
          {/* Left: Clinician Title, Subtitle & Actions */}
          <div className="lg:col-span-7 space-y-5 z-10">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Digital Twin of the Shoulder
            </h1>

            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
              From CT imaging to 3D anatomy, measurements and implant planning — a unified platform for shoulder research and preoperative planning.
            </p>

            {/* Action Buttons: Teal Button + White Outlined Button */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <button
                onClick={onOpenCreateModal}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg shadow-sm transition-all cursor-pointer"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Create Research Case</span>
              </button>

              <button
                onClick={() => onNavigate('imaging')}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                <span>Import CT Series (.dcm)</span>
              </button>
            </div>
          </div>

          {/* Right: Anatomical Shoulder Illustration + Rightmost Meta Tag */}
          <div className="lg:col-span-5 flex items-center justify-end relative">
            <div className="relative w-full flex items-center justify-end">
              <img
                src={ANATOMY_IMAGES.hero}
                alt="3D Anatomical Shoulder Reconstruction"
                className="max-h-[290px] w-auto object-contain select-none filter contrast-105"
              />

              {/* Exact Reference Stack: Anatomy / Imaging / Planning / Better Outcomes */}
              <div className="hidden xl:flex flex-col text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed border-l border-slate-300 dark:border-slate-700 pl-3 ml-3 shrink-0">
                <span>Anatomy</span>
                <span>Imaging</span>
                <span>Planning</span>
                <span>Better Outcomes</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. ACTIVE CASE SUMMARY BAR - Horizontal White Card with Continue Assessment Button */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div className="flex flex-wrap items-center gap-6 sm:gap-8">
          {/* Active Case ID */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/40 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
              <Folder className="w-5 h-5 fill-amber-500/20" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Active Case
              </div>
              <div className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
                {activeCase ? activeCase.id : 'DEMO-SHL-2026-0042'}
              </div>
            </div>
          </div>

          <div className="hidden sm:block w-px h-8 bg-slate-200 dark:bg-slate-800" />

          {/* Shoulder Side */}
          <div>
            <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              Shoulder
            </div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 capitalize flex items-center gap-1.5">
              <span>{activeCase ? activeCase.demographics.affectedSide : 'Right'}</span>
            </div>
          </div>

          <div className="hidden sm:block w-px h-8 bg-slate-200 dark:bg-slate-800" />

          {/* Indication */}
          <div>
            <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              Indication
            </div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-slate-400" />
              <span>{activeCase ? activeCase.demographics.indication : 'Primary Osteoarthritis'}</span>
            </div>
          </div>

          <div className="hidden md:block w-px h-8 bg-slate-200 dark:bg-slate-800" />

          {/* Last Updated */}
          <div className="hidden md:block">
            <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              Last Updated
            </div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>12 Jan 2026</span>
            </div>
          </div>
        </div>

        {/* Continue Assessment CTA */}
        <button
          onClick={() => onNavigate(nextDestination.route)}
          className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg shadow-sm transition-all cursor-pointer shrink-0"
        >
          <span>{nextDestination.label}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3. CLINICAL WORKFLOW PROGRESS TRACKER - Connected Pipeline with Step Numbers */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-2xs transition-colors">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-6">
          Clinical Workflow
        </h2>

        {/* Horizontal Pipeline Steps */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 relative">
          {workflowSteps.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = step.status === 'completed';
            const isInProgress = step.status === 'in_progress';
            const isLast = idx === workflowSteps.length - 1;

            return (
              <React.Fragment key={step.key}>
                {/* Node */}
                <button
                  onClick={() => onNavigate(step.key)}
                  className="flex flex-row md:flex-col items-center gap-3 text-left md:text-center group cursor-pointer transition-transform hover:-translate-y-0.5"
                >
                  {/* Circle Badge */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isCompleted
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : isInProgress
                        ? 'bg-sky-500 text-white ring-4 ring-sky-100 dark:ring-sky-950/60 shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5 stroke-[2.5]" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>

                  {/* Label & Status */}
                  <div>
                    <div
                      className={`text-xs font-semibold leading-tight ${
                        isInProgress
                          ? 'text-sky-600 dark:text-sky-400'
                          : isCompleted
                          ? 'text-slate-900 dark:text-slate-100'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {step.number}. {step.label}
                    </div>
                    <div
                      className={`text-[11px] font-medium mt-0.5 ${
                        isCompleted
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isInProgress
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {step.statusText}
                    </div>
                  </div>
                </button>

                {/* Arrow Connector between steps */}
                {!isLast && (
                  <div className="hidden md:flex flex-1 items-center justify-center px-1">
                    <div
                      className={`h-0.5 w-full transition-colors ${
                        isCompleted
                          ? 'bg-emerald-500'
                          : isInProgress
                          ? 'bg-sky-400'
                          : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                    <ChevronRight
                      className={`w-3.5 h-3.5 -ml-1.5 shrink-0 ${
                        isCompleted
                          ? 'text-emerald-500'
                          : isInProgress
                          ? 'text-sky-400'
                          : 'text-slate-300 dark:text-slate-600'
                      }`}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* 4. LOWER DASHBOARD (SPLIT 2 COLUMNS: RECENT CASES & QUICK ACTIONS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Recent Research Cases Table */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-2xs transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Recent Research Cases
              </h3>
              <button
                onClick={() => onNavigate('cases')}
                className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto mt-2">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[11px] font-medium text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/80">
                    <th className="py-2.5 font-normal">Case ID</th>
                    <th className="py-2.5 font-normal">Shoulder</th>
                    <th className="py-2.5 font-normal">Indication</th>
                    <th className="py-2.5 font-normal">Status</th>
                    <th className="py-2.5 font-normal">Updated</th>
                    <th className="py-2.5 font-normal text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {displayedCases.length > 0 ? (
                    displayedCases.map((c) => {
                      const isActive = activeCase?.id === c.id;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => onSelectCase(c.id)}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors ${
                            isActive ? 'bg-teal-50/40 dark:bg-teal-950/20' : ''
                          }`}
                        >
                          <td className="py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                            {c.id}
                          </td>
                          <td className="py-3 capitalize text-slate-600 dark:text-slate-400">
                            {c.demographics.affectedSide}
                          </td>
                          <td className="py-3 text-slate-700 dark:text-slate-300">
                            {c.demographics.indication}
                          </td>
                          <td className="py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                                c.status === 'report_finalized'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80'
                                  : c.status === 'planning_in_progress'
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80'
                                  : 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200/80'
                              }`}
                            >
                              <span className="text-[8px]">◆</span>
                              <span>
                                {c.status === 'report_finalized'
                                  ? 'Report Finalized'
                                  : c.status === 'planning_in_progress'
                                  ? 'Planning'
                                  : c.imaging
                                  ? 'CT Imported'
                                  : 'In Progress'}
                              </span>
                            </span>
                          </td>
                          <td className="py-3 text-slate-400 text-[11px] tabular-nums">
                            {new Date(c.updatedAt).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="py-3 text-right">
                            <ChevronRight className="w-4 h-4 text-slate-400 inline" />
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    baselineDemoCases.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => {
                          const found = cases.find((c) => c.id === item.id);
                          if (found) onSelectCase(found.id);
                        }}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                          {item.id}
                        </td>
                        <td className="py-3 text-slate-600 dark:text-slate-400">
                          {item.side}
                        </td>
                        <td className="py-3 text-slate-700 dark:text-slate-300">
                          {item.indication}
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                              item.statusVariant === 'emerald'
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80'
                                : item.statusVariant === 'amber'
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80'
                                : 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200/80'
                            }`}
                          >
                            <span className="text-[8px]">◆</span>
                            <span>{item.status}</span>
                          </span>
                        </td>
                        <td className="py-3 text-slate-400 text-[11px] tabular-nums">
                          {item.updated}
                        </td>
                        <td className="py-3 text-right">
                          <ChevronRight className="w-4 h-4 text-slate-400 inline" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Quick Actions 2x2 Grid */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-2xs transition-colors">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
            Quick Actions
          </h3>

          <div className="grid grid-cols-2 gap-3.5">
            {/* Quick Action 1: Import CT Series */}
            <button
              onClick={() => onNavigate('imaging')}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 hover:bg-slate-100/90 dark:hover:bg-slate-800/80 text-left transition-all group cursor-pointer shadow-2xs"
            >
              <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-100 dark:border-teal-800/60 flex items-center justify-center text-teal-700 dark:text-teal-400 mb-3 group-hover:scale-105 transition-transform">
                <Upload className="w-4 h-4" />
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                Import CT Series
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Upload DICOM files
              </div>
            </button>

            {/* Quick Action 2: Open 3D Model */}
            <button
              onClick={() => onNavigate('anatomy3d')}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 hover:bg-slate-100/90 dark:hover:bg-slate-800/80 text-left transition-all group cursor-pointer shadow-2xs"
            >
              <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-100 dark:border-teal-800/60 flex items-center justify-center text-teal-700 dark:text-teal-400 mb-3 group-hover:scale-105 transition-transform">
                <Box className="w-4 h-4" />
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                Open 3D Model
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                View reconstruction
              </div>
            </button>

            {/* Quick Action 3: Plan Implant */}
            <button
              onClick={() => onNavigate('planning')}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 hover:bg-slate-100/90 dark:hover:bg-slate-800/80 text-left transition-all group cursor-pointer shadow-2xs"
            >
              <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-100 dark:border-teal-800/60 flex items-center justify-center text-teal-700 dark:text-teal-400 mb-3 group-hover:scale-105 transition-transform">
                <Wrench className="w-4 h-4" />
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                Plan Implant
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Configure and simulate
              </div>
            </button>

            {/* Quick Action 4: Generate Report */}
            <button
              onClick={() => onNavigate('reports')}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 hover:bg-slate-100/90 dark:hover:bg-slate-800/80 text-left transition-all group cursor-pointer shadow-2xs"
            >
              <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-100 dark:border-teal-800/60 flex items-center justify-center text-teal-700 dark:text-teal-400 mb-3 group-hover:scale-105 transition-transform">
                <FileCheck className="w-4 h-4" />
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                Generate Report
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Create surgical report
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
