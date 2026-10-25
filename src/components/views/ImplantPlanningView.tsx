/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ResearchCase, ImplantPlanningConfig } from '../../types/case';
import { ShoulderScene } from '../three/ShoulderScene';
import {
  Compass,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Box,
  RotateCcw,
  Info,
  ShieldAlert,
} from 'lucide-react';

interface ImplantPlanningViewProps {
  activeCase: ResearchCase | null;
  onUpdatePlan?: (plan: ImplantPlanningConfig) => void;
}

export const ImplantPlanningView: React.FC<ImplantPlanningViewProps> = ({
  activeCase,
  onUpdatePlan,
}) => {
  const existingPlan = activeCase?.implantPlan;

  const [procedureType, setProcedureType] = useState<ImplantPlanningConfig['procedureType']>(
    existingPlan?.procedureType || 'reverse_tsa'
  );
  const [glenosphereSize, setGlenosphereSize] = useState<number>(
    existingPlan?.glenoidComponent.sizeMm || 39
  );
  const [lateralizationMm, setLateralizationMm] = useState<number>(
    existingPlan?.glenoidComponent.lateralizationMm || 4
  );
  const [inferiorTiltDeg, setInferiorTiltDeg] = useState<number>(
    existingPlan?.glenoidComponent.inferiorTiltDeg || 5
  );
  const [stemInclination, setStemInclination] = useState<number>(
    existingPlan?.humeralComponent.stemInclinationDeg || 145
  );
  const [humeralTrayLat, setHumeralTrayLat] = useState<number>(
    existingPlan?.humeralComponent.humeralTrayLateralizationMm || 2
  );
  const [surgeonNotes, setSurgeonNotes] = useState<string>(
    existingPlan?.notes || 'Baseplate positioned with 4mm lateralization to reduce inferior scapular notching in Walch B2 morphology.'
  );

  const handleSavePlan = () => {
    if (!onUpdatePlan) return;
    const updatedPlan: ImplantPlanningConfig = {
      procedureType,
      glenoidComponent: {
        system: 'Orthopedic Research Modular System (RMS)',
        type: 'baseplate_glenosphere',
        sizeMm: glenosphereSize,
        lateralizationMm,
        inferiorTiltDeg,
        versionCorrectionDeg: 6,
        implantOffsetMm: [14.2, -8.6, 22.4],
      },
      humeralComponent: {
        system: 'Orthopedic Research Modular System (RMS)',
        stemSize: 'Size 3 (10mm x 120mm)',
        stemInclinationDeg: stemInclination,
        humeralTrayLateralizationMm: humeralTrayLat,
        humeralInsertThicknessMm: 6,
      },
      notes: surgeonNotes,
      planningApprovedBy: 'Research Fellow',
    };
    onUpdatePlan(updatedPlan);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-slate-100">
              Virtual Arthroplasty Preoperative Planning
            </h1>
            <span className="text-slate-600">·</span>
            <span className="text-xs font-mono text-cyan-400">
              {activeCase ? activeCase.id : 'No Case Selected'}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Simulated implant positioning, baseplate lateralization, and glenosphere inferior tilt planning.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span className="text-slate-400">Status:</span>
          <span className="text-amber-300">Geometric Simulation Only</span>
        </div>
      </div>

      {/* Main Grid: Parameters Control Column (Left) + Interactive 3D Implant Viewport (Right 2 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Surgical Parameters */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">
            Arthroplasty Specification
          </h3>

          {/* Procedure Type */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Surgical Reconstruction
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setProcedureType('reverse_tsa')}
                className={`py-2 px-2.5 rounded text-center font-medium transition-colors ${
                  procedureType === 'reverse_tsa'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                Reverse TSA (rTSA)
              </button>
              <button
                type="button"
                onClick={() => setProcedureType('anatomic_tsa')}
                className={`py-2 px-2.5 rounded text-center font-medium transition-colors ${
                  procedureType === 'anatomic_tsa'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                Anatomic TSA (aTSA)
              </button>
            </div>
          </div>

          {/* Glenoid Component Configuration */}
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <span className="text-[11px] font-mono text-cyan-400 font-semibold uppercase block">
              Glenoid Baseplate & Glenosphere
            </span>

            {/* Glenosphere Diameter */}
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Glenosphere Diameter</span>
                <span className="font-mono text-cyan-400">{glenosphereSize} mm</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[36, 39, 42].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setGlenosphereSize(size)}
                    className={`py-1 rounded text-xs font-mono transition-colors ${
                      glenosphereSize === size
                        ? 'bg-slate-800 text-slate-100 border border-cyan-500/40'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {size} mm
                  </button>
                ))}
              </div>
            </div>

            {/* Baseplate Lateralization */}
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Baseplate Lateralization</span>
                <span className="font-mono text-cyan-400">{lateralizationMm} mm</span>
              </div>
              <input
                type="range"
                min="0"
                max="8"
                step="1"
                value={lateralizationMm}
                onChange={(e) => setLateralizationMm(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-0.5">
                <span>0 mm (Standard)</span>
                <span>+4 mm (BIO-RSA)</span>
                <span>+8 mm</span>
              </div>
            </div>

            {/* Inferior Tilt */}
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Inferior Tilt Angle</span>
                <span className="font-mono text-cyan-400">{inferiorTiltDeg}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={inferiorTiltDeg}
                onChange={(e) => setInferiorTiltDeg(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Recommended 5° inferior tilt to minimize scapular notching.
              </span>
            </div>
          </div>

          {/* Humeral Component Configuration */}
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <span className="text-[11px] font-mono text-cyan-400 font-semibold uppercase block">
              Humeral Stem & Socket
            </span>

            {/* Stem Neck-Shaft Angle */}
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Neck-Shaft Inclination</span>
                <span className="font-mono text-cyan-400">{stemInclination}°</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[135, 145, 155].map((angle) => (
                  <button
                    key={angle}
                    type="button"
                    onClick={() => setStemInclination(angle)}
                    className={`py-1 rounded text-xs font-mono transition-colors ${
                      stemInclination === angle
                        ? 'bg-slate-800 text-slate-100 border border-cyan-500/40'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {angle}°
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="border-t border-slate-800 pt-3">
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Planning Rational & Observations
            </label>
            <textarea
              rows={2}
              value={surgeonNotes}
              onChange={(e) => setSurgeonNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-hidden focus:border-cyan-500"
            />
          </div>

          <button
            onClick={handleSavePlan}
            className="w-full py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-xs rounded transition-colors"
          >
            Update & Save Virtual Plan
          </button>
        </div>

        {/* Right 2 Columns: 3D Viewport with Implants Enabled */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="h-[480px]">
            <ShoulderScene
              landmarks={activeCase?.landmarks}
              showImplants={true}
            />
          </div>

          {/* Clinical Simulation Disclaimer */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded text-xs text-slate-400 space-y-1">
            <div className="text-slate-200 font-semibold flex items-center gap-1.5">
              <Info className="w-4 h-4 text-cyan-400" />
              <span>Biomechanical Range of Motion & Impingement Analysis</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Virtual implant components rendered above are geometric models for spatial layout. Dynamic impingement collision detection and bone-screw trajectory calculations are scheduled for Phase 6.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
