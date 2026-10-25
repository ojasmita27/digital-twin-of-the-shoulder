/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ResearchCase, CTSliceMetadata } from '../../types/case';
import { CTViewer } from '../imaging/CTViewer';
import {
  Upload,
  Layers,
  FileCheck,
  HardDrive,
  Info,
  Calendar,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

interface ImagingViewProps {
  activeCase: ResearchCase | null;
  onUpdateImaging?: (metadata: CTSliceMetadata) => void;
}

export const ImagingView: React.FC<ImagingViewProps> = ({
  activeCase,
  onUpdateImaging,
}) => {
  const [selectedSeriesUid, setSelectedSeriesUid] = useState<string | null>(
    activeCase?.imaging?.seriesInstanceUid || null
  );

  const imaging = activeCase?.imaging;

  // Handle local simulated DICOM file upload
  const handleLocalDicomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newMetadata: CTSliceMetadata = {
      modality: 'CT',
      seriesInstanceUid: `1.2.840.113619.custom.${Date.now()}`,
      studyInstanceUid: `1.2.840.113619.study.${Date.now()}`,
      sliceThicknessMm: 0.8,
      pixelSpacingMm: [0.72, 0.72],
      rows: 512,
      columns: 512,
      sliceCount: 140,
      kvp: 120,
      tubeCurrentMa: 240,
      gantryTiltDeg: 0,
      reconstructionKernel: 'BONE_SHARP',
      windowCenter: 450,
      windowWidth: 1500,
      acquisitionDate: new Date().toISOString().split('T')[0],
    };

    if (onUpdateImaging) {
      onUpdateImaging(newMetadata);
    }
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-slate-100">
              CT Imaging & Multi-Planar Reconstruction
            </h1>
            <span className="text-slate-600">·</span>
            <span className="text-xs font-mono text-cyan-400">
              {activeCase ? activeCase.id : 'No Case Selected'}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Multi-planar reconstruction (Axial, Coronal, Sagittal) with Hounsfield Unit calibrated attenuation windows.
          </p>
        </div>

        {/* Upload Action */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-cyan-400 text-slate-950 hover:bg-cyan-300 rounded cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload DICOM Series</span>
            <input
              type="file"
              multiple
              accept=".dcm,.zip,image/*"
              className="hidden"
              onChange={handleLocalDicomUpload}
            />
          </label>
        </div>
      </div>

      {/* Main Grid: Left Series Browser & Right CT Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left Column: Studies & Series Browser */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 block mb-2">
              Acquisition Series
            </span>

            {imaging ? (
              <div className="space-y-2">
                <div className="p-3 rounded bg-slate-950 border border-cyan-500/30 text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-semibold text-slate-200">
                    <span className="truncate">Series 1: Shoulder Axials</span>
                    <span className="text-[10px] font-mono text-cyan-400">Bone CT</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 space-y-0.5">
                    <div>Slices: {imaging.sliceCount}</div>
                    <div>Thickness: {imaging.sliceThicknessMm} mm</div>
                    <div>Kernel: {imaging.reconstructionKernel}</div>
                    <div>Date: {imaging.acquisitionDate || '2026-09-28'}</div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono mt-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Validated Isotropic</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded text-center text-xs text-slate-500">
                No CT series imported for this subject.
              </div>
            )}
          </div>

          {/* Imaging Protocol Specs */}
          <div className="border-t border-slate-800 pt-3 text-xs space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
              Protocol Requirements
            </span>
            <div className="text-[11px] text-slate-400 space-y-1 font-mono">
              <div>• FOV: 160 - 220 mm</div>
              <div>• Slice Thickness: ≤ 1.0 mm</div>
              <div>• Matrix: 512 × 512 px</div>
              <div>• Extent: Acromion to Humeral Diaphysis (mid-shaft)</div>
            </div>
          </div>

          {/* Research Storage Notice */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-400 space-y-1">
            <div className="text-slate-300 font-semibold flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              <span>Storage Layer</span>
            </div>
            <p className="text-[10px] text-slate-500">
              DICOM pixel buffers stored in local research cache. Fast volumetric slicing rendered via HTML5 Canvas.
            </p>
          </div>
        </div>

        {/* Right 3 Cols: Multi-Planar CT Viewport */}
        <div className="lg:col-span-3">
          <CTViewer metadata={imaging} />
        </div>
      </div>
    </div>
  );
};
