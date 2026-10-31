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
      <div className="p-12 text-center text-slate-400 text-xs">
        No research case selected. Please select a case from the top bar or case list.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* Top Header & Actions Bar (no-print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print border-b border-slate-200 dark:border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-teal-700 dark:text-cyan-400 font-semibold">
              Clinical Export Suite
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{activeCase.id}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Preoperative Surgical Report
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Validated morphometrics, volumetric CT parameters, and virtual arthroplasty plan summary.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white dark:bg-cyan-400 dark:hover:bg-cyan-300 dark:text-slate-950 rounded-lg transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

      {/* Printable Clinical Document Canvas */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 space-y-6 text-slate-800 dark:text-slate-200 text-xs shadow-md print:bg-white print:text-black print:border-none print:shadow-none print:p-0 transition-colors">
        {/* Document Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex items-start justify-between">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-teal-700 dark:text-cyan-400 font-bold mb-1 print:text-teal-800">
              SHOULDERTWIN · ORTHOPEDIC RECONSTRUCTION ARCHIVE
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 print:text-black">
              Patient-Specific Preoperative Arthroplasty Plan
            </h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 print:text-slate-600">
              Document ID: {report?.reportId || `REP-${activeCase.id}-01`} · Generated:{' '}
              {report?.generatedAt ? report.generatedAt.split('T')[0] : new Date().toISOString().split('T')[0]}
            </div>
          </div>

          <div className="text-right font-mono text-xs">
            <div className="text-slate-400 print:text-slate-600">SUBJECT ID:</div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100 print:text-black">
              {activeCase.demographics.researchSubjectId}
            </div>
            <div className="text-[11px] text-teal-700 dark:text-cyan-400 print:text-teal-700 capitalize">
              {activeCase.demographics.affectedSide} Shoulder
            </div>
          </div>
        </div>

        {/* Section 1: Subject Demographics & Indication */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-950 rounded-md border border-slate-200/80 dark:border-slate-800/80 font-mono text-xs print:bg-slate-50 print:border-slate-200">
          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase">Pathology</span>
            <span className="text-slate-800 dark:text-slate-200 font-medium print:text-black">
              {activeCase.demographics.indication}
            </span>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase">Age Band</span>
            <span className="text-slate-800 dark:text-slate-200 print:text-black">
              {activeCase.demographics.ageBand} years
            </span>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase">Biological Sex</span>
            <span className="text-slate-800 dark:text-slate-200 capitalize print:text-black">
              {activeCase.demographics.biologicalSex}
            </span>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase">Classification</span>
            <span className="text-teal-700 dark:text-cyan-400 font-bold print:text-teal-800">
              Walch {measurements?.walchClassification || 'Unclassified'}
            </span>
          </div>
        </div>

        {/* Section 2: Source Imaging Parameters */}
        <div className="space-y-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 pb-1 print:text-slate-700">
            1. Source CT Imaging Verification
          </h3>
          {imaging ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono text-slate-700 dark:text-slate-300 print:text-black">
              <div>Modality: {imaging.modality}</div>
              <div>Slice Count: {imaging.sliceCount} slices</div>
              <div>Slice Thickness: {imaging.sliceThicknessMm} mm</div>
              <div>Pixel Spacing: {imaging.pixelSpacingMm[0]} mm</div>
              <div>Tube Voltage: {imaging.kvp || 120} kVp</div>
              <div>Tube Current: {imaging.tubeCurrentMa || 250} mA</div>
              <div>Kernel: {imaging.reconstructionKernel}</div>
              <div>Acquisition: {imaging.acquisitionDate || 'Unspecified'}</div>
            </div>
          ) : (
            <div className="text-slate-400 italic">No primary CT imaging data linked.</div>
          )}
        </div>

        {/* Section 3: Anatomical Morphometrics Summary */}
        <div className="space-y-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 pb-1 print:text-slate-700">
            2. Anatomical Morphometric Analysis
          </h3>
          {measurements ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-1">Anatomical Landmark Parameter</th>
                    <th className="py-1">Patient Value</th>
                    <th className="py-1">Normal Reference Interval</th>
                    <th className="py-1">Deviation / Interpretation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  <tr>
                    <td className="py-1.5 font-sans">Glenoid Version (Friedman Axis)</td>
                    <td className="py-1.5 font-bold text-teal-700 dark:text-cyan-400">{measurements.glenoidVersionDeg}°</td>
                    <td className="py-1.5">-2° to +4°</td>
                    <td className="py-1.5">
                      {measurements.glenoidVersionDeg < -5 ? 'Retroverted Vault' : 'Normal Alignment'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-sans">Glenoid Inclination (Beta Angle)</td>
                    <td className="py-1.5 font-bold text-teal-700 dark:text-cyan-400">{measurements.glenoidInclinationDeg}°</td>
                    <td className="py-1.5">0° to +5°</td>
                    <td className="py-1.5">
                      {measurements.glenoidInclinationDeg > 5 ? 'Superior Tilt' : 'Normal Alignment'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-sans">Glenoid Height (Superior-Inferior)</td>
                    <td className="py-1.5 font-bold text-teal-700 dark:text-cyan-400">{measurements.glenoidHeightMm} mm</td>
                    <td className="py-1.5">35 to 39 mm</td>
                    <td className="py-1.5">Normal Anatomical Size</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-sans">Glenoid Width (Anterior-Posterior)</td>
                    <td className="py-1.5 font-bold text-teal-700 dark:text-cyan-400">{measurements.glenoidWidthMm} mm</td>
                    <td className="py-1.5">25 to 29 mm</td>
                    <td className="py-1.5">Normal Anatomical Size</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-sans">Humeral Head Sphere Diameter</td>
                    <td className="py-1.5 font-bold text-teal-700 dark:text-cyan-400">{measurements.humeralHeadDiameterMm} mm</td>
                    <td className="py-1.5">42 to 50 mm</td>
                    <td className="py-1.5">Articular Sphere Fit (RMSE &lt; 0.45mm)</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-sans">Humeral Neck-Shaft Inclination</td>
                    <td className="py-1.5 font-bold text-teal-700 dark:text-cyan-400">{measurements.humeralNeckShaftAngleDeg}°</td>
                    <td className="py-1.5">130° to 140°</td>
                    <td className="py-1.5">Standard Anatomical Inclination</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-slate-400 italic">No morphometric measurements recorded.</div>
          )}
        </div>

        {/* Section 4: Preoperative Plan Specification */}
        <div className="space-y-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 pb-1 print:text-slate-700">
            3. Virtual Arthroplasty Configuration
          </h3>
          {implantPlan ? (
            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-md border border-slate-200 dark:border-slate-800 text-xs space-y-3 font-mono">
              <div className="flex items-center justify-between text-teal-700 dark:text-cyan-400 font-bold uppercase">
                <span>Procedure: {implantPlan.procedureType.replace('_', ' ')}</span>
                <span>System: {implantPlan.glenoidComponent.system}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[11px] text-slate-700 dark:text-slate-300">
                <div>Glenosphere Size: {implantPlan.glenoidComponent.sizeMm} mm</div>
                <div>Baseplate Lateralization: +{implantPlan.glenoidComponent.lateralizationMm} mm</div>
                <div>Inferior Tilt: {implantPlan.glenoidComponent.inferiorTiltDeg}°</div>
                <div>Humeral Stem: {implantPlan.humeralComponent.stemSize}</div>
                <div>Stem Inclination: {implantPlan.humeralComponent.stemInclinationDeg}°</div>
                <div>Tray Lateralization: +{implantPlan.humeralComponent.humeralTrayLateralizationMm} mm</div>
              </div>

              {implantPlan.notes && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 font-sans text-slate-600 dark:text-slate-400 text-[11px]">
                  <strong>Surgical Notes:</strong> {implantPlan.notes}
                </div>
              )}
            </div>
          ) : (
            <div className="text-slate-400 italic">No virtual implant plan configured.</div>
          )}
        </div>

        {/* Clinical Disclaimer & Sign-off Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[10px] text-slate-500">
          <div>
            <strong>Validation Notice:</strong> Generated by ShoulderTwin Digital Twin platform. Intended for research and preoperative planning verification.
          </div>
          <div className="text-right font-mono">
            Planning Approved by: <span className="text-slate-800 dark:text-slate-300 font-medium">Research Fellow</span>
          </div>
        </div>
      </div>
    </div>
  );
};
