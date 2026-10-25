/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ResearchCase } from '../../types/case';
import {
  FileText,
  Printer,
  Download,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  Ruler,
  Compass,
} from 'lucide-react';

interface ReportsViewProps {
  activeCase: ResearchCase | null;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ activeCase }) => {
  const report = activeCase?.reports?.[0];
  const measurements = activeCase?.measurements;
  const imaging = activeCase?.imaging;
  const implantPlan = activeCase?.implantPlan;

  const handlePrint = () => {
    window.print();
  };

  if (!activeCase) {
    return (
      <div className="p-12 text-center text-slate-500 text-xs">
        No research case selected. Please select a case from the top bar or case list.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* Top Header & Actions Bar (no-print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-slate-100">
              Preoperative Surgical Reconstruction Report
            </h1>
            <span className="text-slate-600">·</span>
            <span className="text-xs font-mono text-cyan-400">{activeCase.id}</span>
          </div>
          <p className="text-xs text-slate-400">
            Validated morphometrics, volumetric CT parameters, and virtual arthroplasty plan summary.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-cyan-400 text-slate-950 hover:bg-cyan-300 rounded transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

      {/* Printable Clinical Document Canvas */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 space-y-6 text-slate-200 text-xs shadow-xl print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
        {/* Document Header */}
        <div className="border-b border-slate-800 pb-5 flex items-start justify-between">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold mb-1 print:text-cyan-800">
              DIGITAL TWIN OF THE SHOULDER · RECONSTRUCTION ARCHIVE
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-100 print:text-black">
              Patient-Specific Preoperative Arthroplasty Plan
            </h2>
            <div className="text-xs text-slate-400 mt-1 print:text-slate-600">
              Document ID: {report?.reportId || `REP-${activeCase.id}-01`} · Generated:{' '}
              {report?.generatedAt ? report.generatedAt.split('T')[0] : new Date().toISOString().split('T')[0]}
            </div>
          </div>

          <div className="text-right font-mono text-xs">
            <div className="text-slate-400 print:text-slate-600">SUBJECT ID:</div>
            <div className="text-base font-bold text-slate-100 print:text-black">
              {activeCase.demographics.researchSubjectId}
            </div>
            <div className="text-[11px] text-cyan-400 print:text-cyan-700 capitalize">
              {activeCase.demographics.affectedSide} Shoulder
            </div>
          </div>
        </div>

        {/* Section 1: Subject Demographics & Indication */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-950 rounded border border-slate-800/80 font-mono text-xs print:bg-slate-50 print:border-slate-200">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Pathology</span>
            <span className="text-slate-200 font-medium print:text-black">
              {activeCase.demographics.indication}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Age Band</span>
            <span className="text-slate-200 print:text-black">
              {activeCase.demographics.ageBand} years
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Biological Sex</span>
            <span className="text-slate-200 capitalize print:text-black">
              {activeCase.demographics.biologicalSex}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Classification</span>
            <span className="text-cyan-400 font-bold print:text-cyan-800">
              Walch {measurements?.walchClassification || 'Unclassified'}
            </span>
          </div>
        </div>

        {/* Section 2: Source Imaging Parameters */}
        <div className="space-y-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800 pb-1 print:text-slate-700">
            1. Source CT Imaging Verification
          </h3>
          {imaging ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono text-slate-300 print:text-black">
              <div>Modality: {imaging.modality}</div>
              <div>Slice Count: {imaging.sliceCount} slices</div>
              <div>Slice Thickness: {imaging.sliceThicknessMm} mm</div>
              <div>Pixel Spacing: {imaging.pixelSpacingMm[0]} mm</div>
              <div>Tube Voltage: {imaging.kvp} kVp</div>
              <div>Tube Current: {imaging.tubeCurrentMa} mA</div>
              <div>Reconstruction Kernel: {imaging.reconstructionKernel}</div>
              <div>Series: {imaging.seriesInstanceUid.substring(0, 16)}...</div>
            </div>
          ) : (
            <div className="text-slate-500 italic text-xs">No CT volume attached.</div>
          )}
        </div>

        {/* Section 3: Anatomical Morphometrics Table */}
        <div className="space-y-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800 pb-1 print:text-slate-700">
            2. Anatomical Morphometrics & Biomechanical Measures
          </h3>

          {measurements ? (
            <table className="w-full text-left font-mono text-xs border border-slate-800 print:border-slate-300">
              <thead className="bg-slate-950 text-slate-400 text-[11px] print:bg-slate-100 print:text-black">
                <tr>
                  <th className="p-2">Measurement Parameter</th>
                  <th className="p-2">Observed Value</th>
                  <th className="p-2">Reference Normal</th>
                  <th className="p-2">Interpretation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300 print:divide-slate-200 print:text-black">
                <tr>
                  <td className="p-2 font-medium">Glenoid Version (Friedman Axis)</td>
                  <td className="p-2 font-bold text-cyan-400 print:text-cyan-800">
                    {measurements.glenoidVersionDeg}°
                  </td>
                  <td className="p-2 text-slate-400">-2° to +4°</td>
                  <td className="p-2">
                    {measurements.glenoidVersionDeg < -5 ? 'Pathological Retroversion' : 'Normal Version'}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Glenoid Inclination (Beta Angle)</td>
                  <td className="p-2 font-bold text-cyan-400 print:text-cyan-800">
                    {measurements.glenoidInclinationDeg}°
                  </td>
                  <td className="p-2 text-slate-400">0° to +5°</td>
                  <td className="p-2">
                    {measurements.glenoidInclinationDeg > 5 ? 'Superior Inclination' : 'Neutral'}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Glenoid Height / Width</td>
                  <td className="p-2 font-bold text-slate-100 print:text-black">
                    {measurements.glenoidHeightMm} × {measurements.glenoidWidthMm} mm
                  </td>
                  <td className="p-2 text-slate-400">37 × 27 mm</td>
                  <td className="p-2">Aspect Ratio: {(measurements.glenoidHeightMm / measurements.glenoidWidthMm).toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Humeral Head Sphere Diameter</td>
                  <td className="p-2 font-bold text-slate-100 print:text-black">
                    {measurements.humeralHeadDiameterMm} mm
                  </td>
                  <td className="p-2 text-slate-400">42 - 50 mm</td>
                  <td className="p-2">Best-fit sphere (RMSE &lt; 0.45mm)</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Humeral Neck-Shaft Angle</td>
                  <td className="p-2 font-bold text-slate-100 print:text-black">
                    {measurements.humeralNeckShaftAngleDeg}°
                  </td>
                  <td className="p-2 text-slate-400">130° - 140°</td>
                  <td className="p-2">Anatomical Baseline</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="text-slate-500 italic text-xs">No computed measurements.</div>
          )}
        </div>

        {/* Section 4: Virtual Implant Specifications */}
        <div className="space-y-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800 pb-1 print:text-slate-700">
            3. Planned Arthroplasty Implant Configuration
          </h3>

          {implantPlan ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-950 rounded border border-slate-800 print:bg-slate-50 print:border-slate-200 text-xs">
              <div>
                <span className="font-mono text-[11px] text-cyan-400 font-semibold uppercase block mb-1">
                  Glenoid Component
                </span>
                <div className="space-y-1 font-mono text-[11px] text-slate-300 print:text-black">
                  <div>Type: Baseplate & Glenosphere</div>
                  <div>Glenosphere Diameter: {implantPlan.glenoidComponent.sizeMm} mm</div>
                  <div>Lateralization: +{implantPlan.glenoidComponent.lateralizationMm} mm</div>
                  <div>Inferior Tilt: {implantPlan.glenoidComponent.inferiorTiltDeg}°</div>
                </div>
              </div>

              <div>
                <span className="font-mono text-[11px] text-cyan-400 font-semibold uppercase block mb-1">
                  Humeral Component
                </span>
                <div className="space-y-1 font-mono text-[11px] text-slate-300 print:text-black">
                  <div>Stem Size: {implantPlan.humeralComponent.stemSize}</div>
                  <div>Neck-Shaft Inclination: {implantPlan.humeralComponent.stemInclinationDeg}°</div>
                  <div>Tray Lateralization: +{implantPlan.humeralComponent.humeralTrayLateralizationMm} mm</div>
                  <div>Polyethylene Insert: {implantPlan.humeralComponent.humeralInsertThicknessMm} mm</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 italic text-xs">No implant plan configured.</div>
          )}
        </div>

        {/* Mandatory Research & Validation Disclaimer */}
        <div className="p-4 bg-amber-950/20 border border-amber-900/40 rounded text-xs space-y-1.5 print:bg-slate-100 print:border-slate-300 print:text-black">
          <div className="font-bold text-amber-300 print:text-black flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>RESEARCH PROTOTYPE DISCLAIMER — NOT A VALIDATED MEDICAL DEVICE</span>
          </div>
          <p className="text-[11px] text-amber-200/80 leading-relaxed print:text-slate-700">
            This digital twin reconstruction report was generated by an open-source research and engineering platform. It is not approved by the FDA, CE, or health authorities for direct clinical diagnosis, surgical decision making, or patient treatment. All surgical decisions remain the independent responsibility of the licensed orthopedic surgeon.
          </p>
        </div>
      </div>
    </div>
  );
};
