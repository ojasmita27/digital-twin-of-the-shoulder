/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ResearchCase, CaseStatus } from '../../types/case';
import { NavRoute } from '../layout/Sidebar';
import { StatusBadge } from '../common/StatusBadge';
import {
  FolderPlus,
  Search,
  Filter,
  Box,
  Scan,
  Compass,
  FileCheck,
  Trash2,
  Download,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

interface CasesViewProps {
  cases: ResearchCase[];
  activeCase: ResearchCase | null;
  onSelectCase: (caseId: string) => void;
  onNavigate: (route: NavRoute) => void;
  onOpenCreateModal: () => void;
  onDeleteCase: (caseId: string) => void;
  isLoading?: boolean;
  backendError?: string | null;
  onRefresh?: () => void;
}

export const CasesView: React.FC<CasesViewProps> = ({
  cases,
  activeCase,
  onSelectCase,
  onNavigate,
  onOpenCreateModal,
  onDeleteCase,
  isLoading = false,
  backendError = null,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterIndication, setFilterIndication] = useState<string>('all');
  const [filterSide, setFilterSide] = useState<string>('all');

  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.demographics.researchSubjectId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesIndication =
      filterIndication === 'all' || c.demographics.indication === filterIndication;

    const matchesSide =
      filterSide === 'all' || c.demographics.affectedSide === filterSide;

    return matchesSearch && matchesIndication && matchesSide;
  });

  const exportCaseJSON = (c: ResearchCase) => {
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${c.id}_research_bundle.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const LIFECYCLE_STEPS: { key: CaseStatus; label: string }[] = [
    { key: 'created', label: 'Case Created' },
    { key: 'imaging_imported', label: 'CT Imported' },
    { key: 'imaging_validated', label: 'CT Validated' },
    { key: 'segmentation_completed', label: 'AI Segmented' },
    { key: 'models_generated', label: '3D Meshes' },
    { key: 'measurements_computed', label: 'Morphometrics' },
    { key: 'planning_in_progress', label: 'Implant Plan' },
    { key: 'report_finalized', label: 'Final Report' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">
            Case Management
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Registry of de-identified research subjects, CT imaging acquisitions, and planned reconstructions.
          </p>
        </div>
        <button
          onClick={onOpenCreateModal}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-cyan-400 text-slate-950 hover:bg-cyan-300 rounded transition-colors self-start sm:self-auto"
        >
          <FolderPlus className="w-4 h-4" />
          <span>New Research Case</span>
        </button>
      </div>

      {/* Honest Backend Warning Banner (Shown only if server is unreachable) */}
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
              className="px-3 py-1.5 text-xs font-mono bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded transition-colors self-start sm:self-auto shrink-0 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Retry GET /api/cases</span>
            </button>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by case ID, title, or subject..."
            className="w-full bg-slate-950 border border-slate-800 rounded pl-9 pr-3 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-hidden focus:border-cyan-500 font-mono text-xs"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 font-mono">INDICATION:</span>
            <select
              value={filterIndication}
              onChange={(e) => setFilterIndication(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-300 text-xs focus:outline-hidden"
            >
              <option value="all">All Indications</option>
              <option value="Primary Osteoarthritis">Primary Osteoarthritis</option>
              <option value="Rotator Cuff Tear Arthropathy">Rotator Cuff Tear</option>
              <option value="Proximal Humerus Fracture">Humerus Fracture</option>
              <option value="Research Normative">Normative Control</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 font-mono">SIDE:</span>
            <select
              value={filterSide}
              onChange={(e) => setFilterSide(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-300 text-xs focus:outline-hidden"
            >
              <option value="all">All Sides</option>
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid: Cases List + Selected Case Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cases Table List (Left 2 cols) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Registered Cases ({filteredCases.length})
            </span>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 rounded transition-colors"
                title="Refresh case registry from GET /api/cases"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
                <span>{isLoading ? 'Syncing...' : 'Sync GET /api/cases'}</span>
              </button>
            )}
          </div>

          {filteredCases.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No matching research cases found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5">Identifier</th>
                    <th className="px-4 py-2.5">Subject & Indication</th>
                    <th className="px-4 py-2.5">Side</th>
                    <th className="px-4 py-2.5">Lifecycle</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {filteredCases.map((c) => {
                    const isSelected = activeCase?.id === c.id;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => onSelectCase(c.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-cyan-500/10 hover:bg-cyan-500/15'
                            : 'hover:bg-slate-800/50'
                        }`}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-slate-100">
                          <div className="flex items-center gap-1.5">
                            <span>{c.id}</span>
                            {c.isDemo ? (
                              <span className="text-[9px] text-amber-400 border border-amber-500/40 px-1 rounded font-sans">
                                SYNTHETIC DEMO
                              </span>
                            ) : (
                              <span className="text-[9px] text-emerald-400 border border-emerald-500/40 px-1 rounded font-sans">
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
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectCase(c.id);
                              onNavigate('anatomy3d');
                            }}
                            className="px-2 py-1 text-xs text-cyan-400 hover:text-cyan-300 border border-slate-800 hover:border-slate-700 rounded transition-colors"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Case Inspector (Right Column) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          {activeCase ? (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-cyan-400 font-bold">
                    {activeCase.id}
                  </span>
                  {activeCase.isDemo && (
                    <span className="text-[10px] text-amber-400 border border-amber-500/40 px-1.5 rounded">
                      SYNTHETIC RECORD
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-slate-100 mt-1">
                  {activeCase.name}
                </h3>
                <div className="text-xs text-slate-400 mt-0.5">
                  Subject ID: <span className="font-mono text-slate-300">{activeCase.demographics.researchSubjectId}</span>
                </div>
              </div>

              {/* Demographics Pill-Free Display */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950 p-3 rounded border border-slate-800/80">
                <div>
                  <span className="text-slate-500 block text-[10px]">AFFECTED SIDE:</span>
                  <span className="text-slate-200 capitalize font-medium">
                    {activeCase.demographics.affectedSide} Shoulder
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">AGE BAND:</span>
                  <span className="text-slate-200">{activeCase.demographics.ageBand} yrs</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">BIOLOGICAL SEX:</span>
                  <span className="text-slate-200 capitalize">{activeCase.demographics.biologicalSex}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">CREATED:</span>
                  <span className="text-slate-200">{activeCase.createdAt.split('T')[0]}</span>
                </div>
              </div>

              {/* Linked Artifacts */}
              <div className="space-y-2 text-xs">
                <div className="font-mono text-[11px] text-slate-400 uppercase tracking-wider">
                  Linked Artifacts & Data
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Scan className="w-3.5 h-3.5 text-cyan-400" />
                      <span>CT Series Volume</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      {activeCase.imaging ? `${activeCase.imaging.sliceCount} Slices` : 'Not Attached'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Box className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Surface Meshes</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      {activeCase.meshes.length} Models
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Compass className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Arthroplasty Plan</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      {activeCase.implantPlan ? 'Configured' : 'Pending'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                    <div className="flex items-center gap-2 text-slate-300">
                      <FileCheck className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Preoperative Reports</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      {activeCase.reports.length} Generated
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-2 border-t border-slate-800">
                <button
                  onClick={() => onNavigate('anatomy3d')}
                  className="w-full py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-xs rounded transition-colors flex items-center justify-center gap-2"
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>Launch 3D Reconstruction Viewport</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => exportCaseJSON(activeCase)}
                    className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON</span>
                  </button>

                  <button
                    onClick={() => onDeleteCase(activeCase.id)}
                    className="py-1.5 px-3 bg-rose-950/40 hover:bg-rose-950/60 text-rose-300 text-xs rounded border border-rose-900/50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500 text-xs">
              Select a research case to view provenance and linked anatomical geometry.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
