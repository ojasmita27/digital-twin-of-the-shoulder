/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ResearchCase, MorphometricMeasurements } from '../../types/case';
import { MetricCard } from '../common/MetricCard';
import {
  Ruler,
  Info,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  BookOpen,
} from 'lucide-react';

interface MeasurementsViewProps {
  activeCase: ResearchCase | null;
}

export const MeasurementsView: React.FC<MeasurementsViewProps> = ({ activeCase }) => {
  const measurements = activeCase?.measurements;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-slate-100">
              Morphometric Measurements & Biomechanics
            </h1>
            <span className="text-slate-600">·</span>
            <span className="text-xs font-mono text-cyan-400">
              {activeCase ? activeCase.id : 'No Case Selected'}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Validated anatomical measurements computed from 3D surface landmarks and 2D axial/coronal CT planes according to ISB recommendations.
          </p>
        </div>

        {/* Validation Status Badge */}
        <div className="flex items-center gap-2 text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span className="text-slate-400">Provenance:</span>
          <span className="text-emerald-400">ISB Coordinate Standardization</span>
        </div>
      </div>

      {/* Metrics Row: Glenoid Morphometrics */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400">
            Glenoid Vault & Morphology
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">
            Algorithm: Friedman Axial Axis & Maurer Beta Vector
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

      {/* Metrics Row: Humerus Morphometrics */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400">
            Proximal Humerus Geometry
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">
            Algorithm: Sphere Fitting to Articular Surface (RMSE &lt; 0.45mm)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Head Diameter"
            value={measurements ? measurements.humeralHeadDiameterMm : '—'}
            unit="mm"
            referenceNormal="42 - 50 mm"
            subtext="Sphere fitting diameter"
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

      {/* Measurement Methodology & Literature Provenance */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <span>Measurement Definitions & Scientific Methodology</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1.5">
            <div className="font-semibold text-slate-100">1. Glenoid Version (Friedman Axis)</div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Measured on the axial slice passing through the mid-glenoid level. The scapular body line is drawn from the medial border of the scapula to the center of the glenoid vault. A perpendicular line represents the neutral (0°) glenoid line. Deviation anteriorly is anteversion (+), posteriorly is retroversion (-).
            </p>
            <div className="text-[10px] font-mono text-slate-500">
              Ref: Friedman RJ et al. Clin Orthop Relat Res. 1992.
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1.5">
            <div className="font-semibold text-slate-100">2. Glenoid Inclination (Beta Angle)</div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Calculated on the coronal plane reformatted along the scapular spine. The beta angle is formed between the floor of the supraspinatus fossa and the line connecting superior and inferior glenoid margins.
            </p>
            <div className="text-[10px] font-mono text-slate-500">
              Ref: Maurer A et al. J Shoulder Elbow Surg. 2012.
            </div>
          </div>
        </div>

        {/* Validation Disclaimer */}
        <div className="flex items-start gap-2.5 p-3.5 bg-amber-950/20 border border-amber-900/50 rounded text-xs text-amber-200/90">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-semibold text-amber-300">Research & Validation Notice</div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              All morphometric values shown above are computed for research, statistical shape modeling, and educational demonstration. Clinical execution requires certified orthopedic review with calibrated surgical planning software.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
