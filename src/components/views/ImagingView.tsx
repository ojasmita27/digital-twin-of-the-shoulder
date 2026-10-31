/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ResearchCase, CTSliceMetadata } from '../../types/case';
import { CTViewer } from '../imaging/CTViewer';
import { apiClient } from '../../services/apiClient';
import { DicomUploadResponse } from '../../types/api';
import { ANATOMY_IMAGES } from '../../assets/anatomyImages';
import {
  Upload,
  Layers,
  FileCheck,
  HardDrive,
  Info,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Box,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ImagingViewProps {
  activeCase: ResearchCase | null;
  onUpdateImaging?: (metadata: CTSliceMetadata) => void;
  onNavigateToAnatomy?: () => void;
}

export const ImagingView: React.FC<ImagingViewProps> = ({
  activeCase,
  onUpdateImaging,
  onNavigateToAnatomy,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [lastUploadedSummary, setLastUploadedSummary] = useState<{
    fileNames: string[];
    totalSizeBytes: number;
    response?: DicomUploadResponse;
  } | null>(null);
  const [showAdvancedMetadata, setShowAdvancedMetadata] = useState(false);

  const imaging = activeCase?.imaging;

  // Handle genuine DICOM file upload to FastAPI backend
  const handleDicomFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setLastUploadedSummary({
      fileNames: files.map((f) => f.name),
      totalSizeBytes: totalBytes,
    });

    try {
      const caseId = activeCase && !activeCase.isDemo ? activeCase.id : null;
      const res = await apiClient.uploadDicomFiles(caseId, files);

      if (res.data && res.data.success) {
        const metadata: CTSliceMetadata = {
          modality: res.data.modality,
          seriesInstanceUid: res.data.seriesInstanceUid,
          studyInstanceUid: res.data.studyInstanceUid,
          sliceThicknessMm: res.data.sliceThicknessMm,
          pixelSpacingMm: res.data.pixelSpacingMm,
          rows: res.data.rows,
          columns: res.data.columns,
          sliceCount: res.data.sliceCount,
          windowCenter: res.data.windowCenter,
          windowWidth: res.data.windowWidth,
          reconstructionKernel: res.data.reconstructionKernel,
          acquisitionDate: res.data.acquisitionDate,
          primaryPreviewUrl: res.data.primaryPreviewUrl,
          isVolumetricSeries: res.data.isVolumetricSeries,
          reconstructionReadiness: res.data.reconstructionReadiness,
          reconstructionMessage: res.data.reconstructionMessage,
        };

        setUploadSuccess(
          res.data.message || `Successfully parsed ${files.length} DICOM slice(s).`
        );
        setLastUploadedSummary({
          fileNames: files.map((f) => f.name),
          totalSizeBytes: totalBytes,
          response: res.data,
        });

        if (onUpdateImaging) {
          onUpdateImaging(metadata);
        }
      } else {
        setUploadError(res.error || res.data?.message || 'Failed to parse DICOM metadata.');
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Network error during DICOM upload';
      setUploadError(
        `DICOM Upload failed: ${errorMessage}. If using the remote Render backend, please allow a few seconds for instance spin-up.`
      );
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-teal-700 dark:text-cyan-400 font-semibold">
              Cross-Sectional Radiography
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {activeCase ? activeCase.id : 'No Case Selected'}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            CT Imaging & Multi-Planar Viewer
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Multi-slice DICOM series parsing, Hounsfield Unit attenuation windowing, and 3D volumetric reconstruction readiness validation.
          </p>
        </div>

        {/* Upload Action Button */}
        <div className="flex items-center gap-2 shrink-0">
          <label
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors shadow-sm ${
              isUploading
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-500 text-white dark:bg-cyan-400 dark:hover:bg-cyan-300 dark:text-slate-950'
            }`}
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span>{isUploading ? 'Parsing DICOM Series...' : 'Upload DICOM (.dcm)'}</span>
            <input
              type="file"
              multiple
              accept=".dcm,.dicom,application/dicom"
              className="hidden"
              disabled={isUploading}
              onChange={handleDicomFileUpload}
            />
          </label>
        </div>
      </div>

      {/* SECTION A: Upload & Validation Status Banners */}
      {isUploading && (
        <div className="p-4 bg-teal-50 dark:bg-cyan-950/40 border border-teal-200 dark:border-cyan-800/60 rounded-lg text-xs text-teal-900 dark:text-cyan-300 flex items-center gap-2.5 shadow-xs">
          <Loader2 className="w-4 h-4 animate-spin text-teal-600 dark:text-cyan-400 shrink-0" />
          <div>
            <div className="font-semibold">Processing DICOM Transmission on Backend...</div>
            <div className="text-[11px] text-teal-700 dark:text-cyan-400/80 font-mono mt-0.5">
              Sorting slice geometry by normal vector projection, validating series uniformity, and rendering calibrated HU preview.
            </div>
          </div>
        </div>
      )}

      {uploadError && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-semibold text-rose-900 dark:text-rose-200">DICOM Processing Error</div>
            <div className="text-[11px] text-rose-700 dark:text-rose-200/90 leading-relaxed">{uploadError}</div>
          </div>
        </div>
      )}

      {uploadSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-semibold text-emerald-900 dark:text-emerald-200">{uploadSuccess}</div>
            {lastUploadedSummary && (
              <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-200/80">
                Uploaded {lastUploadedSummary.fileNames.length} file(s) ({formatFileSize(lastUploadedSummary.totalSizeBytes)})
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION B & C: Main Workspace Grid (Left Series Info + Right CT Viewer) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* SECTION C: Series Information Panel (Left Col) */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                Series Characteristics
              </span>
              <span className="text-[10px] font-mono text-teal-700 dark:text-cyan-400 font-semibold">
                {imaging?.modality || 'CT'}
              </span>
            </div>

            {imaging ? (
              <div className="space-y-3">
                <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono space-y-1.5 text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Slice Count:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-200">{imaging.sliceCount} slices</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Slice Thickness:</span>
                    <span>{imaging.sliceThicknessMm} mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pixel Spacing:</span>
                    <span>
                      {imaging.pixelSpacingMm?.[0]?.toFixed(2) || '0.72'} ×{' '}
                      {imaging.pixelSpacingMm?.[1]?.toFixed(2) || '0.72'} mm
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Matrix Size:</span>
                    <span>{imaging.rows} × {imaging.columns} px</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kernel:</span>
                    <span>{imaging.reconstructionKernel || 'BONE'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Acquisition:</span>
                    <span>{imaging.acquisitionDate || 'Unspecified'}</span>
                  </div>
                </div>

                {/* 3D Reconstruction Readiness Card */}
                <div
                  className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                    imaging.reconstructionReadiness === 'READY_FOR_3D_SURFACE'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200'
                      : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span>3D Surface Readiness:</span>
                    <span className="text-[10px] font-mono">
                      {imaging.reconstructionReadiness || (imaging.sliceCount > 1 ? 'VOLUMETRIC' : 'SINGLE SLICE')}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {imaging.reconstructionMessage ||
                      (imaging.sliceCount > 1
                        ? 'Series contains contiguous volumetric coverage suitable for bone surface extraction.'
                        : 'Single 2D CT slice loaded. 3D bone meshing requires multi-slice contiguous scan.')}
                  </p>

                  {(imaging.sliceCount <= 1 || imaging.isVolumetricSeries === false) && onNavigateToAnatomy && (
                    <button
                      onClick={onNavigateToAnatomy}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 hover:underline font-mono"
                    >
                      <span>Load 3D STL mesh directly instead →</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-center text-xs text-slate-500 space-y-2">
                <img
                  src={ANATOMY_IMAGES.emptyState}
                  alt="No CT volume"
                  className="w-16 h-16 mx-auto rounded-full object-cover opacity-60"
                />
                <p>No CT series loaded for this case. Upload a DICOM file (.dcm) above.</p>
              </div>
            )}
          </div>

          {/* Clinical Imaging Protocol Guidance */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-xs space-y-2 shadow-xs transition-colors">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
              Orthopedic CT Protocols
            </span>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 font-mono">
              <div>• Target FOV: 160 – 220 mm</div>
              <div>• Slice Thickness: ≤ 1.0 mm</div>
              <div>• Matrix: 512 × 512 pixels</div>
              <div>• Anatomical Bounds: Acromion to Humeral Shaft</div>
            </div>
          </div>
        </div>

        {/* SECTION B: Interactive CT Canvas Viewer (Right 3 Cols) */}
        <div className="lg:col-span-3">
          <CTViewer metadata={imaging} />
        </div>
      </div>

      {/* SECTION D: Collapsible Advanced DICOM Metadata Table */}
      {imaging && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-xs transition-colors">
          <button
            onClick={() => setShowAdvancedMetadata(!showAdvancedMetadata)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono">
              <FileCheck className="w-4 h-4 text-teal-600 dark:text-cyan-400" />
              <span>Advanced DICOM Attributes & Transfer Syntax</span>
            </div>
            {showAdvancedMetadata ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {showAdvancedMetadata && (
            <div className="p-5 pt-0 border-t border-slate-100 dark:border-slate-800/80 overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="text-[11px] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 pr-4">DICOM Tag</th>
                    <th className="py-2 pr-4">Attribute Name</th>
                    <th className="py-2">Extracted Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  <tr>
                    <td className="py-2 text-slate-400">(0008, 0060)</td>
                    <td className="py-2 text-slate-500">Modality</td>
                    <td className="py-2 text-teal-700 dark:text-cyan-300 font-semibold">{imaging.modality || 'CT'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-400">(0020, 000E)</td>
                    <td className="py-2 text-slate-500">SeriesInstanceUID</td>
                    <td className="py-2 truncate max-w-md">{imaging.seriesInstanceUid || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-400">(0020, 000D)</td>
                    <td className="py-2 text-slate-500">StudyInstanceUID</td>
                    <td className="py-2 truncate max-w-md">{imaging.studyInstanceUid || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-400">(0018, 0050)</td>
                    <td className="py-2 text-slate-500">SliceThickness</td>
                    <td className="py-2 text-teal-700 dark:text-cyan-300 font-semibold">{imaging.sliceThicknessMm} mm</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-400">(0028, 0030)</td>
                    <td className="py-2 text-slate-500">PixelSpacing</td>
                    <td className="py-2 text-teal-700 dark:text-cyan-300 font-semibold">
                      [{imaging.pixelSpacingMm?.[0]}, {imaging.pixelSpacingMm?.[1]}] mm
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-400">(0028, 1050)</td>
                    <td className="py-2 text-slate-500">WindowCenter</td>
                    <td className="py-2">{imaging.windowCenter || 350} HU</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-400">(0028, 1051)</td>
                    <td className="py-2 text-slate-500">WindowWidth</td>
                    <td className="py-2">{imaging.windowWidth || 1500} HU</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-400">(0018, 1210)</td>
                    <td className="py-2 text-slate-500">ConvolutionKernel</td>
                    <td className="py-2">{imaging.reconstructionKernel || 'BONE'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
