/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  referenceNormal?: string;
  delta?: string;
  subtext?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  referenceNormal,
  delta,
  subtext,
}) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-lg flex flex-col justify-between">
      <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
        {label}
      </div>

      <div className="flex items-baseline gap-1.5 my-1">
        <span className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
          {value}
        </span>
        {unit && (
          <span className="text-xs uppercase font-mono text-slate-400">
            {unit}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mt-1 border-t border-slate-800/60 pt-1.5">
        {referenceNormal && (
          <span>Norm: <span className="text-slate-400">{referenceNormal}</span></span>
        )}
        {delta && (
          <span className="text-cyan-400 font-medium">{delta}</span>
        )}
        {subtext && !referenceNormal && !delta && (
          <span className="text-slate-500 truncate">{subtext}</span>
        )}
      </div>
    </div>
  );
};
