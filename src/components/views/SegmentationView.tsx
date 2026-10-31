/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ResearchCase, SegmentationJob } from '../../types/case';
import { ANATOMY_IMAGES } from '../../assets/anatomyImages';
import {
  Cpu,
  Layers,
  CheckCircle2,
  AlertCircle,
  FileCode2,
  HardDrive,
  Info,
  Server,
  Box,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface SegmentationViewProps {
  activeCase: ResearchCase | null;
  onUpdateJob?: (job: SegmentationJob) => void;
  onNavigateToAnatomy?: () => void;
}

export const SegmentationView: React.FC<SegmentationViewProps> = ({
  activeCase,
  onNavigateToAnatomy,
}) => {
  const [selectedModel, setSelectedModel] = useState('TotalSegmentator-Shoulder-CT');
  const [selectedStructures, setSelectedStructures] = useState<('scapula' | 'humerus' | 'clavicle')[]>([
    'scapula',
    'humerus',
  ]);

  const toggleStructure = (struct: 'scapula' | 'humerus' | 'clavicle') => {
    setSelectedStructures((prev) =>
      prev.includes(struct) ? prev.filter((s) => s !== struct) : [...prev, struct]
    );
  };

  const imaging = activeCase?.imaging;

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-teal-700 dark:text-cyan-400 font-semibold">
              Volumetric Semantic Segmentation
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {activeCase ? activeCase.id : 'No Active Case Selected'}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Anatomical Bone Segmentation
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Extraction of scapular cortical surfaces and proximal humeral boundaries from volumetric CT data.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-md shadow-xs">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span className="text-slate-500 dark:text-slate-400">Status:</span>
          <span className="text-amber-700 dark:text-amber-300 font-medium">Model Integration Pending</span>
        </div>
      </div>

      {/* Honest Scientific Status Banner */}
      <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-900 dark:text-amber-200/95 space-y-2 shadow-xs">
        <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
          <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>GPU Deep-Learning Inference Pipeline in Development</span>
        </div>
        <p className="text-[11px] text-amber-800/85 dark:text-amber-200/80 leading-relaxed">
          Automated multi-organ deep learning segmentation (TotalSegmentator / 3D V-Net) requires dedicated GPU acceleration (e.g. NVIDIA A10G / T4) which is not hosted on the basic lightweight FastAPI tier.
          For research evaluation, you can import pre-segmented high-fidelity <strong>STL meshes (.stl)</strong> directly into the <strong>3D Reconstruction</strong> workspace or inspect the synthetic reference shoulder template.
        </p>
        {onNavigateToAnatomy && (
          <div className="pt-1">
            <button
              onClick={onNavigateToAnatomy}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 dark:bg-amber-500/20 hover:bg-amber-200 dark:hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-500/40 rounded transition-colors text-xs font-mono"
            >
              <span>Switch to 3D Reconstruction & STL Loader</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Configuration & Pipeline Architecture Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Model Configuration & Target Selection */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 shadow-xs transition-colors">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Pipeline Configuration
            </h2>

            {/* Model Architecture Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Segmentation Architecture
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden font-mono"
              >
                <option value="TotalSegmentator-Shoulder-CT">TotalSegmentator v2 (nnU-Net 3D)</option>
                <option value="VNet-Glenoid-Vault">V-Net Anatomical Vault Resampler</option>
                <option value="MONAI-DynUNet-Bones">MONAI DynUNet (Isotropic 1.0mm)</option>
              </select>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Trained on 1,200+ multi-scanner musculoskeletal CT datasets.
              </p>
            </div>

            {/* Target Anatomical Structures */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Target Anatomical Structures
              </label>
              <div className="space-y-2">
                {[
                  { id: 'scapula', label: 'Scapula & Glenoid Vault', desc: 'Cortical vault, acromion, coracoid' },
                  { id: 'humerus', label: 'Proximal Humerus', desc: 'Humeral head, anatomical neck, diaphysis' },
                  { id: 'clavicle', label: 'Distal Clavicle', desc: 'Acromioclavicular articulation' },
                ].map((item) => {
                  const isChecked = selectedStructures.includes(item.id as any);
                  return (
                    <label
                      key={item.id}
                      onClick={() => toggleStructure(item.id as any)}
                      className={`flex items-start gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-teal-50 dark:bg-slate-950 border-teal-200 dark:border-cyan-500/40 text-slate-900 dark:text-slate-200'
                          : 'bg-slate-50/70 dark:bg-slate-950/60 border-slate-200/80 dark:border-slate-800/80 text-slate-500 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-teal-600 dark:text-cyan-500 focus:ring-0"
                      />
                      <div className="text-xs">
                        <div className="font-semibold text-slate-900 dark:text-slate-200">{item.label}</div>
                        <div className="text-[11px] text-slate-500">{item.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Preprocessing Specifications */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Voxel Resampling:</span>
                <span className="text-slate-800 dark:text-slate-200 font-medium">1.0mm Isotropic</span>
              </div>
              <div className="flex justify-between">
                <span>Window Clamp:</span>
                <span className="text-slate-800 dark:text-slate-200 font-medium">-100 to +1500 HU</span>
              </div>
              <div className="flex justify-between">
                <span>Surface Extraction:</span>
                <span className="text-slate-800 dark:text-slate-200 font-medium">Marching Cubes (Iso=300)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right 2 Columns: Input Series Readiness & Specification Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Active Case CT Series Context */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-xs transition-colors">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-3">
              Input Volume Characteristics
            </h2>

            {imaging ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-0.5">
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase">Modality</span>
                    <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{imaging.modality || 'CT'}</div>
                  </div>
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-0.5">
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase">Slice Count</span>
                    <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{imaging.sliceCount} slices</div>
                  </div>
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-0.5">
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase">Slice Spacing</span>
                    <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{imaging.sliceThicknessMm} mm</div>
                  </div>
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-0.5">
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase">Matrix</span>
                    <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{imaging.rows} × {imaging.columns} px</div>
                  </div>
                </div>

                <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                    <span>Series Instance UID:</span>
                    <span className="truncate max-w-xs text-slate-800 dark:text-slate-300">{imaging.seriesInstanceUid || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                    <span>Reconstruction Kernel:</span>
                    <span className="text-slate-800 dark:text-slate-300">{imaging.reconstructionKernel || 'BONE'}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                    <span>3D Feasibility:</span>
                    <span className={imaging.isVolumetricSeries ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-amber-700 dark:text-amber-400'}>
                      {imaging.reconstructionReadiness || (imaging.sliceCount > 1 ? 'VOLUMETRIC' : 'SINGLE SLICE')}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800/80 space-y-2">
                <img
                  src={ANATOMY_IMAGES.emptyState}
                  alt="No CT volume"
                  className="w-16 h-16 mx-auto rounded-full object-cover opacity-60"
                />
                <p>No CT volume loaded for the active case. Please import a DICOM CT series in the CT Imaging module.</p>
              </div>
            )}
          </div>

          {/* Model Specification & Validation Protocol */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 shadow-xs transition-colors">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Evaluation & Benchmarking Methodology
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              When models are integrated with an active GPU inference worker, segmentation quality will be validated against manual clinical expert annotations using the following standardized morphometric criteria:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 space-y-1">
                <span className="text-teal-700 dark:text-cyan-400 font-mono font-semibold">Dice Similarity (DSC)</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Volumetric overlap of the scapular body, acromion, and proximal humerus relative to manual ground truth.
                </p>
              </div>

              <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 space-y-1">
                <span className="text-teal-700 dark:text-cyan-400 font-mono font-semibold">Hausdorff Distance (95%)</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Maximum surface contour boundary distance error (target threshold &lt; 1.5mm on the glenoid articular surface).
                </p>
              </div>

              <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 space-y-1">
                <span className="text-teal-700 dark:text-cyan-400 font-mono font-semibold">Average Surface Error</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Mean Euclidean distance between reconstructed cortical surface mesh and reference CT bone threshold.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
