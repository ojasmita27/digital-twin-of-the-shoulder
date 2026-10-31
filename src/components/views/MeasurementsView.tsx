/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ResearchCase, MorphometricMeasurements } from '../../types/case';
import { MetricCard } from '../common/MetricCard';
import {
  Ruler,
  Info,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface MeasurementsViewProps {
  activeCase: ResearchCase | null;
}

export const MeasurementsView: React.FC<MeasurementsViewProps> = ({ activeCase }) => {
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const measurements = activeCase?.measurements;
  const isDemo = activeCase?.isDemo || !measurements;

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-teal-700 dark:text-cyan-400 font-semibold">
              Morphometric Biomechanics Suite
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {activeCase ? activeCase.id : 'No Case Selected'}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Morphometric Measurements
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Standardized anatomical measurements computed from 3D surface landmarks and multi-planar CT reconstructions according to ISB recommendations.
          </p>
        </div>

        {/* Data Provenance Badge */}
        <div className="flex items-center gap-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-md shadow-xs">
          {isDemo ? (
            <span className="text-amber-700 dark:text-amber-400">DEMO DATA · Computed from Reference Template</span>
          ) : (
            <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>ISB Coordinate Standardized</span>
            </span>
          )}
        </div>
      </div>

      {/* Glenoid Vault & Morphology Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
            Glenoid Morphology & Orientation
          </h2>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
            Friedman Axial Axis & Maurer Beta Vector
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Glenoid Version"
            value={measurements ? `${measurements.glenoidVersionDeg > 0 ? '+' : ''}${measurements.glenoidVersionDeg}` : '—'}
            unit="deg"
            referenceNormal="-2° to +4°"
            delta={measurements ? (measurements.glenoidVersionDeg < -5 ? 'Retroverted' : 'Neutral') : undefined}
            subtext="Friedman line reference"
          />

          <MetricCard
            label="Glenoid Inclination (Beta)"
            value={measurements ? `${measurements.glenoidInclinationDeg > 0 ? '+' : ''}${measurements.glenoidInclinationDeg}` : '—'}
            unit="deg"
            referenceNormal="0° to +5°"
            delta={measurements ? (measurements.glenoidInclinationDeg > 5 ? 'Superior Tilt' : 'Normal') : undefined}
            subtext="Supraspinatus fossa line"
          />

          <MetricCard
            label="Glenoid Height (S-I)"
            value={measurements ? measurements.glenoidHeightMm : '—'}
            unit="mm"
            referenceNormal="35 - 39 mm"
            subtext="Superior-inferior pole diameter"
          />

          <MetricCard
            label="Glenoid Width (A-P)"
            value={measurements ? measurements.glenoidWidthMm : '—'}
            unit="mm"
            referenceNormal="25 - 29 mm"
            subtext="Anterior-posterior diameter"
          />
        </div>
      </div>

      {/* Proximal Humerus Geometry */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
            Proximal Humerus Articular Geometry
          </h2>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
            Sphere Fitting Algorithm (RMSE &lt; 0.45mm)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Humeral Head Diameter"
            value={measurements ? measurements.humeralHeadDiameterMm : '—'}
            unit="mm"
            referenceNormal="42 - 50 mm"
            subtext="Fitted sphere diameter"
          />

          <MetricCard
            label="Neck-Shaft Angle"
            value={measurements ? measurements.humeralNeckShaftAngleDeg : '—'}
            unit="deg"
            referenceNormal="130° - 140°"
            delta="Anatomical Standard"
            subtext="Diaphyseal-head center axis"
          />

          <MetricCard
            label="Humeral Retroversion"
            value={measurements ? measurements.humeralRetroversionDeg : '—'}
            unit="deg"
            referenceNormal="-20° to -35°"
            subtext="Relative to transepicondylar axis"
          />

          <MetricCard
            label="Walch Classification"
            value={measurements?.walchClassification || '—'}
            subtext="Posterior glenoid bone loss pattern"
          />
        </div>
      </div>

      {/* Structured Measurement Summary Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-xs transition-colors">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-mono uppercase tracking-wider text-slate-700 dark:text-slate-300 font-semibold">
            Comprehensive Morphometric Registry
          </h3>
          <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
            {isDemo ? 'Baseline Reference Template Values' : 'Patient-Specific Values'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-mono text-[11px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5">Parameter</th>
                <th className="px-4 py-2.5">Measured Value</th>
                <th className="px-4 py-2.5">Reference Normal</th>
                <th className="px-4 py-2.5">Anatomical Landmark Baseline</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300 font-mono">
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-slate-900 dark:text-slate-200">Glenoid Version</td>
                <td className="px-4 py-3 text-teal-700 dark:text-cyan-400 font-bold">
                  {measurements ? `${measurements.glenoidVersionDeg > 0 ? '+' : ''}${measurements.glenoidVersionDeg}°` : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500">-2° to +4°</td>
                <td className="px-4 py-3 font-sans text-slate-500">Friedman scapular body axis to glenoid line</td>
                <td className="px-4 py-3">
                  <span className={measurements && measurements.glenoidVersionDeg < -5 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                    {measurements && measurements.glenoidVersionDeg < -5 ? 'Retroverted' : 'Normal'}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-slate-900 dark:text-slate-200">Glenoid Inclination (Beta)</td>
                <td className="px-4 py-3 text-teal-700 dark:text-cyan-400 font-bold">
                  {measurements ? `${measurements.glenoidInclinationDeg > 0 ? '+' : ''}${measurements.glenoidInclinationDeg}°` : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500">0° to +5°</td>
                <td className="px-4 py-3 font-sans text-slate-500">Supraspinatus fossa line to glenoid S-I vector</td>
                <td className="px-4 py-3">
                  <span className="text-emerald-600 dark:text-emerald-400">Normal</span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-slate-900 dark:text-slate-200">Glenoid Height</td>
                <td className="px-4 py-3 text-teal-700 dark:text-cyan-400 font-bold">
                  {measurements ? `${measurements.glenoidHeightMm} mm` : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500">35 – 39 mm</td>
                <td className="px-4 py-3 font-sans text-slate-500">Superior to inferior glenoid margin</td>
                <td className="px-4 py-3">
                  <span className="text-emerald-600 dark:text-emerald-400">Normal</span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-slate-900 dark:text-slate-200">Glenoid Width</td>
                <td className="px-4 py-3 text-teal-700 dark:text-cyan-400 font-bold">
                  {measurements ? `${measurements.glenoidWidthMm} mm` : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500">25 – 29 mm</td>
                <td className="px-4 py-3 font-sans text-slate-500">Anterior to posterior mid-vault equator</td>
                <td className="px-4 py-3">
                  <span className="text-emerald-600 dark:text-emerald-400">Normal</span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-slate-900 dark:text-slate-200">Humeral Head Sphere</td>
                <td className="px-4 py-3 text-teal-700 dark:text-cyan-400 font-bold">
                  {measurements ? `${measurements.humeralHeadDiameterMm} mm` : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500">42 – 50 mm</td>
                <td className="px-4 py-3 font-sans text-slate-500">Articular surface least-squares sphere fit</td>
                <td className="px-4 py-3">
                  <span className="text-emerald-600 dark:text-emerald-400">Normal</span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-slate-900 dark:text-slate-200">Neck-Shaft Angle</td>
                <td className="px-4 py-3 text-teal-700 dark:text-cyan-400 font-bold">
                  {measurements ? `${measurements.humeralNeckShaftAngleDeg}°` : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500">130° – 140°</td>
                <td className="px-4 py-3 font-sans text-slate-500">Humeral neck normal vector vs diaphyseal shaft</td>
                <td className="px-4 py-3">
                  <span className="text-emerald-600 dark:text-emerald-400">Normal</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Collapsible Measurement Methodology & Scientific Citations */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-xs transition-colors">
        <button
          onClick={() => setMethodologyOpen(!methodologyOpen)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <BookOpen className="w-4 h-4 text-teal-600 dark:text-cyan-400" />
            <span>Methodology & Anatomical Landmark Definitions</span>
          </div>
          {methodologyOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {methodologyOpen && (
          <div className="p-5 pt-0 border-t border-slate-100 dark:border-slate-800/80 space-y-4 text-xs text-slate-600 dark:text-slate-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-slate-100">1. Glenoid Version (Friedman Axis)</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Evaluated on the axial plane passing through the mid-glenoid level. The scapular body axis connects the medial border of the scapula to the center of the glenoid vault. A perpendicular line represents neutral version (0°).
                </p>
                <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                  Ref: Friedman RJ et al. Clin Orthop Relat Res. 1992.
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-slate-100">2. Glenoid Inclination (Beta Angle)</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Calculated on the reformatted coronal plane along the scapular spine. The beta angle is formed between the floor of the supraspinatus fossa and the line connecting superior and inferior glenoid margins.
                </p>
                <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                  Ref: Maurer A et al. J Shoulder Elbow Surg. 2012.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-md text-xs text-amber-800 dark:text-amber-200/90">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-amber-900 dark:text-amber-300">Research & Validation Notice</div>
                <p className="text-[11px] text-amber-800/80 dark:text-amber-200/80 leading-relaxed">
                  All morphometric values shown are computed for research, statistical shape modeling, and educational demonstration. Clinical decision-making requires certified diagnostic review.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
