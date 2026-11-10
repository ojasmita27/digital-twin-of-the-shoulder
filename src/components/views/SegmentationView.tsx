/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ResearchCase, SegmentationJob } from '../../types/case';
import { apiClient } from '../../services/apiClient';
import { caseStorage } from '../../services/caseStorage';
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
  onUpdateJob,
  onNavigateToAnatomy,
}) => {
  const [selectedModel, setSelectedModel] = useState('threshold-hu');
  const [selectedStructures, setSelectedStructures] = useState<('scapula' | 'humerus' | 'glenoid' | 'clavicle')[]>([
    'scapula',
    'humerus',
    'glenoid',
  ]);
  const [thresholdHu, setThresholdHu] = useState(300);
  const [maxThresholdHu, setMaxThresholdHu] = useState<number | undefined>(undefined);
  const [processing, setProcessing] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [editSlice, setEditSlice] = useState(0);
  const [brushRadius, setBrushRadius] = useState(4);
  const [editMode, setEditMode] = useState<'add' | 'remove'>('add');
  const [editStructure, setEditStructure] = useState<'combined' | 'scapula' | 'humerus' | 'glenoid'>('combined');
  const [pendingOperations, setPendingOperations] = useState<Array<{ x: number; y: number; radius: number; add: boolean }>>([]);
  const [redoOperations, setRedoOperations] = useState<Array<{ x: number; y: number; radius: number; add: boolean }>>([]);
  const [preview, setPreview] = useState<{ ctPreviewUrl: string; maskPreviewUrl?: string | null } | null>(null);
  const editorRef = useRef<HTMLCanvasElement>(null);

  const toggleStructure = (struct: 'scapula' | 'humerus' | 'glenoid' | 'clavicle') => {
    setSelectedStructures((prev) =>
      prev.includes(struct) ? prev.filter((s) => s !== struct) : [...prev, struct]
    );
  };

  const imaging = activeCase?.imaging;

  const runSegmentation = async () => {
    if (!activeCase || activeCase.isDemo || !imaging?.sourceFiles?.length) return;
    setProcessing(true);
    setResultMessage(null);
    if (maxThresholdHu !== undefined && thresholdHu >= maxThresholdHu) {
      setResultMessage('Minimum threshold must be lower than maximum threshold.');
      setProcessing(false);
      return;
    }
    const result = await apiClient.segmentCase(
      activeCase.id,
      thresholdHu,
      maxThresholdHu,
      selectedModel,
      selectedStructures,
    );
    if (!result.data) {
      setResultMessage(result.error || 'Segmentation failed.');
      setProcessing(false);
      return;
    }
    const job = result.data as unknown as SegmentationJob;
    onUpdateJob?.(job);
    setResultMessage('Threshold segmentation mask saved from the uploaded CT. Inspect or correct it before rebuilding the patient mesh.');
    setProcessing(false);
  };

  const rebuildModel = async () => {
    if (!activeCase) return;
    setProcessing(true);
    const result = await apiClient.reconstructCase(activeCase.id, thresholdHu);
    if (result.data && activeCase.segmentationJob) {
      onUpdateJob?.({ ...activeCase.segmentationJob, reconstructionStatus: 'completed' });
      const refreshedCase = await apiClient.getCaseById(activeCase.id);
      if (refreshedCase.data) caseStorage.addOrUpdateCase(refreshedCase.data);
    }
    setResultMessage(result.data
      ? 'Patient mesh rebuilt from the saved segmentation mask.'
      : result.error || 'Reconstruction failed.');
    setProcessing(false);
  };

  useEffect(() => {
    let cancelled = false;
    if (!activeCase || !activeCase.segmentationJob || !activeCase.imaging?.sourceFiles?.length) {
      setPreview(null);
      return;
    }
    apiClient.getSegmentationPreview(activeCase.id, 'axial', editSlice, undefined, undefined, editStructure).then((response) => {
      if (!cancelled) setPreview(response.data || null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeCase?.id, activeCase?.segmentationJob?.version, activeCase?.imaging?.sourceFiles, editSlice, editStructure]);

  useEffect(() => {
    const canvas = editorRef.current;
    if (!canvas || !preview) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ct = new Image();
    const mask = new Image();
    let loaded = 0;
    const draw = () => {
      loaded += 1;
      if (loaded < 2) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(ct, 0, 0, canvas.width, canvas.height);
      if (preview.maskPreviewUrl) {
        ctx.globalAlpha = 0.45;
        ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      }
      pendingOperations.forEach((operation) => {
        ctx.fillStyle = operation.add ? 'rgba(34, 197, 94, 0.55)' : 'rgba(239, 68, 68, 0.55)';
        ctx.beginPath();
        const columns = activeCase?.imaging?.columns || 512;
        const rows = activeCase?.imaging?.rows || 512;
        ctx.arc(
          operation.x * 512 / columns,
          operation.y * 512 / rows,
          operation.radius * 512 / columns,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      });
    };
    ct.onload = draw;
    mask.onload = draw;
    ct.src = preview.ctPreviewUrl;
    mask.src = preview.maskPreviewUrl || preview.ctPreviewUrl;
  }, [preview, pendingOperations]);

  const applyBrush = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = editorRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const operation = {
      x: Math.round(((event.clientX - rect.left) / rect.width) * (activeCase?.imaging?.columns || 512)),
      y: Math.round(((event.clientY - rect.top) / rect.height) * (activeCase?.imaging?.rows || 512)),
      radius: Math.max(1, Math.round(brushRadius * (activeCase?.imaging?.columns || 512) / 512)),
      add: editMode === 'add',
    };
    setPendingOperations((operations) => [...operations, operation]);
    setRedoOperations([]);
  };

  const saveCorrections = async () => {
    if (!activeCase || pendingOperations.length === 0) return;
    const result = await apiClient.correctSegmentation(activeCase.id, editSlice, pendingOperations, editStructure);
    if (result.data) {
      onUpdateJob?.(result.data as unknown as SegmentationJob);
      setPendingOperations([]);
      setRedoOperations([]);
      setResultMessage('Corrected segmentation saved. Any previous mesh is now outdated.');
    } else {
      setResultMessage(result.error || 'Corrected segmentation could not be saved.');
    }
  };

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
          <span className="text-amber-700 dark:text-amber-300 font-medium">Threshold Prototype</span>
        </div>
      </div>

      {/* Honest Scientific Status Banner */}
      <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-900 dark:text-amber-200/95 space-y-2 shadow-xs">
        <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
          <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>GPU Deep-Learning Inference Pipeline in Development</span>
        </div>
        <p className="text-[11px] text-amber-800/85 dark:text-amber-200/80 leading-relaxed">
          This workflow currently uses a transparent HU threshold and marching-cubes surface extraction on the uploaded CT volume. It is not a pretrained model, does not identify anatomical structures separately, and requires inspection/correction before research use.
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
            <button
              type="button"
              disabled={processing || !activeCase?.segmentationJob}
              onClick={rebuildModel}
              className="w-full rounded border border-cyan-600 px-3 py-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing ? 'Rebuilding patient mesh...' : 'Rebuild mesh from saved mask'}
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
                <option value="threshold-hu">HU threshold segmentation (prototype)</option>
              </select>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Uses uploaded CT voxel values; no AI model weights are installed.
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
                  { id: 'glenoid', label: 'Glenoid Region', desc: 'CT-derived glenoid-facing subregion; manual review required' },
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
              <div className="flex items-center justify-between gap-2 pt-2">
                <label htmlFor="threshold-hu">Bone threshold (HU)</label>
                <input
                  id="threshold-hu"
                  type="number"
                  value={thresholdHu}
                  onChange={(event) => setThresholdHu(Number(event.target.value))}
                  className="w-24 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-right"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="max-threshold-hu">Maximum threshold (HU)</label>
                <input
                  id="max-threshold-hu"
                  type="number"
                  placeholder="optional"
                  value={maxThresholdHu ?? ''}
                  onChange={(event) => setMaxThresholdHu(event.target.value ? Number(event.target.value) : undefined)}
                  className="w-24 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-right"
                />
              </div>
              <button
                type="button"
                disabled={processing || !activeCase || activeCase.isDemo || !imaging?.sourceFiles?.length}
                onClick={runSegmentation}
                className="w-full rounded bg-teal-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processing ? 'Processing CT volume...' : 'Segment and reconstruct uploaded CT'}
              </button>
              {resultMessage && <p className="text-[11px] text-slate-600 dark:text-slate-400">{resultMessage}</p>}
              {activeCase?.segmentationJob && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2 text-[11px]">
                  <div className="flex justify-between"><span>Mask version</span><span>{activeCase.segmentationJob.version || 1}</span></div>
                  <div className="flex justify-between">
                    <span>Source</span>
                    <span className={activeCase.segmentationJob.isManuallyCorrected ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}>
                      {activeCase.segmentationJob.isManuallyCorrected ? 'Manually Corrected' : 'Automatic'}
                    </span>
                  </div>
                  {activeCase.segmentationJob.separationStatus && (
                    <div className="flex justify-between">
                      <span>Separation</span>
                      <span className={activeCase.segmentationJob.separationStatus === 'manual_review_required' ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}>
                        {activeCase.segmentationJob.separationStatus === 'manual_review_required' ? 'Manual Review Required' : 'Verified'}
                        {activeCase.segmentationJob.separationConfidence != null ? ` (${Math.round(activeCase.segmentationJob.separationConfidence * 100)}%)` : ''}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between"><span>Total voxels</span><span>{activeCase.segmentationJob.voxelCount ?? 'unknown'}</span></div>
                  {activeCase.segmentationJob.scapulaVoxelCount !== undefined && (
                    <div className="flex justify-between"><span>Scapula voxels</span><span>{activeCase.segmentationJob.scapulaVoxelCount}</span></div>
                  )}
                  {activeCase.segmentationJob.humerusVoxelCount !== undefined && (
                    <div className="flex justify-between"><span>Humerus voxels</span><span>{activeCase.segmentationJob.humerusVoxelCount}</span></div>
                  )}
                  {activeCase.segmentationJob.glenoidVoxelCount !== undefined && (
                    <div className="flex justify-between"><span>Glenoid-region voxels</span><span>{activeCase.segmentationJob.glenoidVoxelCount}</span></div>
                  )}
                  {activeCase.segmentationJob.glenoidStatus && (
                    <div className="flex justify-between gap-3">
                      <span>Glenoid region</span>
                      <span className="text-right text-amber-600 dark:text-amber-400 font-semibold">
                        Manual review required
                      </span>
                    </div>
                  )}
                  {typeof activeCase.segmentationJob.overlapVoxelCount === 'number' && activeCase.segmentationJob.overlapVoxelCount > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>Overlap voxels</span>
                      <span>{activeCase.segmentationJob.overlapVoxelCount}</span>
                    </div>
                  )}
                  <div className="flex justify-between"><span>Volume</span><span>{activeCase.segmentationJob.segmentationVolumeMm3 ?? 'unknown'} mm³</span></div>
                  <div className="flex justify-between"><span>Mask status</span><span>{activeCase.segmentationJob.reconstructionStatus === 'outdated' ? 'Mesh outdated' : 'Saved'}</span></div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-mono text-slate-300">AXIAL MASK CORRECTION · 2D SLICE PROTOTYPE</div>
                <div className="flex flex-wrap gap-2">
                  {(['combined', 'scapula', 'humerus'] as const).map((struct) => (
                    <button
                      key={struct}
                      type="button"
                      onClick={() => {
                        setEditStructure(struct);
                        setPendingOperations([]);
                        setRedoOperations([]);
                      }}
                      className={`px-2 py-1 text-[11px] rounded capitalize ${
                        editStructure === struct ? 'bg-teal-600 text-white font-semibold' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {struct}
                    </button>
                  ))}
                  <button type="button" onClick={() => setEditMode('add')} className={`px-2 py-1 text-[11px] rounded ${editMode === 'add' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'}`}>ADD</button>
                  <button type="button" onClick={() => setEditMode('remove')} className={`px-2 py-1 text-[11px] rounded ${editMode === 'remove' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'}`}>REMOVE</button>
                </div>
              </div>
              {activeCase?.segmentationJob && preview ? (
                <>
                  <canvas ref={editorRef} width={512} height={512} onPointerDown={applyBrush} className="w-full max-w-[512px] mx-auto border border-slate-700 cursor-crosshair touch-none" />
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
                    <label>Slice <input type="number" min="0" max={(activeCase.imaging?.sliceCount || 1) - 1} value={editSlice} onChange={(event) => setEditSlice(Number(event.target.value))} className="w-14 bg-slate-900 border border-slate-700 px-1" /></label>
                    <label>Brush <input type="range" min="1" max="32" value={brushRadius} onChange={(event) => setBrushRadius(Number(event.target.value))} /></label>
                    <button type="button" onClick={() => setPendingOperations((operations) => { if (!operations.length) return operations; const next = [...operations]; const last = next.pop(); if (last) setRedoOperations((redo) => [...redo, last]); return next; })} disabled={!pendingOperations.length} className="px-2 py-1 bg-slate-800 rounded disabled:opacity-40">UNDO</button>
                    <button type="button" onClick={() => setRedoOperations((redo) => { if (!redo.length) return redo; const next = [...redo]; const last = next.pop(); if (last) setPendingOperations((operations) => [...operations, last]); return next; })} disabled={!redoOperations.length} className="px-2 py-1 bg-slate-800 rounded disabled:opacity-40">REDO</button>
                    <button type="button" onClick={() => { setPendingOperations([]); setRedoOperations([]); }} className="px-2 py-1 bg-slate-800 rounded">CLEAR</button>
                    <button type="button" onClick={() => setResultMessage('Local correction changes applied to the editing session. Save to persist them.')} className="px-2 py-1 bg-cyan-700 rounded">APPLY CHANGES</button>
                    <button type="button" onClick={saveCorrections} disabled={!pendingOperations.length} className="px-2 py-1 bg-emerald-700 rounded disabled:opacity-40">SAVE CORRECTED MASK</button>
                    <button type="button" onClick={() => { setPendingOperations([]); setRedoOperations([]); }} className="px-2 py-1 bg-amber-700 rounded">CANCEL</button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500">Run segmentation on a real uploaded CT volume to enable correction. Original DICOM pixels remain unchanged.</p>
              )}
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
