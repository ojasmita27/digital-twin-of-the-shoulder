/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CaseStatus } from '../../types/case';

interface StatusBadgeProps {
  status: CaseStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusLabels: Record<CaseStatus, { label: string; color: string }> = {
    created: { label: 'Created · Awaiting CT', color: 'text-slate-400' },
    imaging_imported: { label: 'CT Imported', color: 'text-cyan-400' },
    imaging_validated: { label: 'CT Validated', color: 'text-cyan-300' },
    segmentation_queued: { label: 'Segmentation Queued', color: 'text-amber-400' },
    segmentation_completed: { label: 'Segmented', color: 'text-emerald-400' },
    models_generated: { label: '3D Meshes Available', color: 'text-emerald-300' },
    measurements_computed: { label: 'Measurements Computed', color: 'text-cyan-300' },
    planning_in_progress: { label: 'Planning Active', color: 'text-sky-300' },
    report_finalized: { label: 'Report Finalized', color: 'text-indigo-300' },
  };

  const item = statusLabels[status] || { label: status, color: 'text-slate-400' };

  // Text-first indicator without pill boxes (per Universal Frontend Design Constitution)
  return (
    <span className={`text-xs font-mono font-medium ${item.color}`}>
      {item.label}
    </span>
  );
};
