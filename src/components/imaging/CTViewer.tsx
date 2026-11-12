import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CTSliceMetadata } from '../../types/case';
import { apiClient } from '../../services/apiClient';
import { DicomSimulator, SliceOrientation, WINDOW_PRESETS } from '../../services/dicomSimulator';
import { ChevronLeft, ChevronRight, Crosshair, FileText, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

interface CTViewerProps {
  metadata?: CTSliceMetadata;
  caseId?: string;
  onSliceChange?: (sliceIndex: number) => void;
  onPatientPositionChange?: (position: [number, number, number] | null) => void;
  onNavigateToAnatomy?: () => void;
}

type Preview = { ctPreviewUrl: string; maskPreviewUrl?: string | null };
type Voxel = [number, number, number];

const orientations: SliceOrientation[] = ['axial', 'coronal', 'sagittal'];
const labels: Record<SliceOrientation, string> = { axial: 'AXIAL', coronal: 'CORONAL', sagittal: 'SAGITTAL' };

function crossProduct(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function patientPoint(voxel: Voxel, metadata: CTSliceMetadata): [number, number, number] | null {
  if (!metadata.originMm || !metadata.orientationPatient || !metadata.sliceSpacingMm) return null;
  const row = metadata.orientationPatient.slice(0, 3);
  const column = metadata.orientationPatient.slice(3, 6);
  const normal = crossProduct(row, column);
  const spacing = [metadata.sliceSpacingMm, metadata.pixelSpacingMm[0], metadata.pixelSpacingMm[1]];
  return [
    metadata.originMm[0] + normal[0] * voxel[0] * spacing[0] + row[0] * voxel[1] * spacing[1] + column[0] * voxel[2] * spacing[2],
    metadata.originMm[1] + normal[1] * voxel[0] * spacing[0] + row[1] * voxel[1] * spacing[1] + column[1] * voxel[2] * spacing[2],
    metadata.originMm[2] + normal[2] * voxel[0] * spacing[0] + row[2] * voxel[1] * spacing[1] + column[2] * voxel[2] * spacing[2],
  ];
}

function planeAspect(orientation: SliceOrientation, metadata: CTSliceMetadata): number {
  const dimensions = metadata.dimensionsVoxels || [metadata.sliceCount, metadata.rows, metadata.columns];
  const spacing = [metadata.sliceSpacingMm || metadata.sliceThicknessMm, metadata.pixelSpacingMm[0], metadata.pixelSpacingMm[1]];
  if (orientation === 'axial') return (dimensions[2] * spacing[2]) / (dimensions[1] * spacing[1]);
  if (orientation === 'coronal') return (dimensions[2] * spacing[2]) / (dimensions[0] * spacing[0]);
  return (dimensions[1] * spacing[1]) / (dimensions[0] * spacing[0]);
}

function planeCrosshair(orientation: SliceOrientation, voxel: Voxel, metadata: CTSliceMetadata): [number, number] {
  const dimensions = metadata.dimensionsVoxels || [metadata.sliceCount, metadata.rows, metadata.columns];
  const clamp = (value: number, size: number) => size <= 1 ? 0.5 : Math.max(0, Math.min(1, value / (size - 1)));
  if (orientation === 'axial') return [clamp(voxel[2], dimensions[2]), clamp(voxel[1], dimensions[1])];
  if (orientation === 'coronal') return [clamp(voxel[2], dimensions[2]), clamp(voxel[0], dimensions[0])];
  return [clamp(voxel[1], dimensions[1]), clamp(voxel[0], dimensions[0])];
}

export const CTViewer: React.FC<CTViewerProps> = ({ metadata, caseId, onSliceChange, onPatientPositionChange, onNavigateToAnatomy }) => {
  const isRealSeries = Boolean(metadata?.sourceFiles?.length && caseId);
  const dimensions = metadata?.dimensionsVoxels || [metadata?.sliceCount || 1, metadata?.rows || 1, metadata?.columns || 1];
  const [voxel, setVoxel] = useState<Voxel>([
    Math.floor(dimensions[0] / 2),
    Math.floor(dimensions[1] / 2),
    Math.floor(dimensions[2] / 2),
  ]);
  const [previews, setPreviews] = useState<Partial<Record<SliceOrientation, Preview>>>({});
  const [windowWidth, setWindowWidth] = useState(metadata?.windowWidth || 1500);
  const [windowCenter, setWindowCenter] = useState(metadata?.windowCenter || 450);
  const [activePreset, setActivePreset] = useState('BONE');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);
  const [maskOpacity, setMaskOpacity] = useState(0.45);
  const [showMask, setShowMask] = useState(true);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const canvasRefs = useRef<Partial<Record<SliceOrientation, HTMLCanvasElement>>>({});

  useEffect(() => {
    if (!metadata) return;
    const next: Voxel = [
      Math.max(0, Math.min(dimensions[0] - 1, voxel[0])),
      Math.max(0, Math.min(dimensions[1] - 1, voxel[1])),
      Math.max(0, Math.min(dimensions[2] - 1, voxel[2])),
    ];
    if (next.some((value, index) => value !== voxel[index])) setVoxel(next);
  }, [metadata?.seriesInstanceUid, dimensions[0], dimensions[1], dimensions[2]]);

  useEffect(() => {
    const position = metadata ? patientPoint(voxel, metadata) : null;
    onPatientPositionChange?.(position);
    onSliceChange?.(voxel[0] + 1);
  }, [voxel, metadata, onPatientPositionChange, onSliceChange]);

  useEffect(() => {
    let cancelled = false;
    if (!isRealSeries || !caseId) {
      setPreviews({});
      return;
    }
    Promise.all(orientations.map(async (orientation) => {
      const axis = orientation === 'axial' ? 0 : orientation === 'coronal' ? 1 : 2;
      const result = await apiClient.getSegmentationPreview(caseId, orientation, voxel[axis], windowCenter, windowWidth);
      return [orientation, result.data] as const;
    })).then((entries) => {
      if (!cancelled) setPreviews(Object.fromEntries(entries.filter((entry) => Boolean(entry[1]))) as Partial<Record<SliceOrientation, Preview>>);
    });
    return () => { cancelled = true; };
  }, [caseId, isRealSeries, voxel, windowCenter, windowWidth, metadata?.segmentationPreviewAvailable]);

  const drawPreview = (orientation: SliceOrientation) => {
    const canvas = canvasRefs.current[orientation];
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#020617';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const preview = previews[orientation]?.ctPreviewUrl;
    if (!isRealSeries && metadata) {
      DicomSimulator.renderSlice(canvas, orientation, voxel[orientation === 'axial' ? 0 : orientation === 'coronal' ? 1 : 2] / Math.max(1, dimensions[orientation === 'axial' ? 0 : orientation === 'coronal' ? 1 : 2] - 1), windowWidth, windowCenter, false, 0.5, 0.5);
      return;
    }
    if (!preview) {
      context.fillStyle = '#94a3b8';
      context.font = '13px monospace';
      context.textAlign = 'center';
      context.fillText('Loading patient CT...', 256, 256);
      return;
    }
    const image = new Image();
    image.onload = () => {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const maskUrl = previews[orientation]?.maskPreviewUrl;
      if (showMask && maskUrl) {
        const mask = new Image();
        mask.onload = () => {
          context.globalAlpha = maskOpacity;
          context.drawImage(mask, 0, 0, canvas.width, canvas.height);
          context.globalAlpha = 1;
        };
        mask.src = maskUrl;
      }
    };
    image.src = preview;
  };

  useEffect(() => {
    orientations.forEach(drawPreview);
  }, [previews, voxel, windowWidth, windowCenter, maskOpacity, showMask, isRealSeries, metadata?.seriesInstanceUid]);

  const updateVoxel = (orientation: SliceOrientation, delta: number) => {
    const axis = orientation === 'axial' ? 0 : orientation === 'coronal' ? 1 : 2;
    setVoxel((current) => {
      const next = [...current] as Voxel;
      next[axis] = Math.max(0, Math.min(dimensions[axis] - 1, next[axis] + delta));
      return next;
    });
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>, orientation: SliceOrientation) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const aspect = planeAspect(orientation, metadata!);
    const contentWidth = aspect >= 1 ? 1 : aspect;
    const contentHeight = aspect >= 1 ? 1 / aspect : 1;
    const left = (1 - contentWidth) / 2;
    const top = (1 - contentHeight) / 2;
    if (x < left || x > left + contentWidth || y < top || y > top + contentHeight) return;
    const px = (x - left) / contentWidth;
    const py = (y - top) / contentHeight;
    setVoxel((current) => {
      const next = [...current] as Voxel;
      if (orientation === 'axial') { next[2] = Math.round(px * (dimensions[2] - 1)); next[1] = Math.round(py * (dimensions[1] - 1)); }
      if (orientation === 'coronal') { next[2] = Math.round(px * (dimensions[2] - 1)); next[0] = Math.round(py * (dimensions[0] - 1)); }
      if (orientation === 'sagittal') { next[1] = Math.round(px * (dimensions[1] - 1)); next[0] = Math.round(py * (dimensions[0] - 1)); }
      return next;
    });
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setVoxel([Math.floor(dimensions[0] / 2), Math.floor(dimensions[1] / 2), Math.floor(dimensions[2] / 2)]);
  };

  const selectedPosition = metadata ? patientPoint(voxel, metadata) : null;
  const selectedText = selectedPosition ? selectedPosition.map((value) => value.toFixed(2)).join(', ') : 'Unavailable';

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex gap-1">
          {Object.entries(WINDOW_PRESETS).map(([key, preset]) => (
            <button key={key} type="button" onClick={() => { setActivePreset(key); setWindowWidth(preset.windowWidth); setWindowCenter(preset.windowCenter); }} className={`px-2 py-1 rounded ${activePreset === key ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{key}</button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-slate-500">W <input className="w-16 px-1 border rounded bg-transparent" type="number" value={windowWidth} onChange={(event) => { setActivePreset('CUSTOM'); setWindowWidth(Math.max(1, Number(event.target.value))); }} /></label>
        <label className="flex items-center gap-1 text-slate-500">L <input className="w-16 px-1 border rounded bg-transparent" type="number" value={windowCenter} onChange={(event) => { setActivePreset('CUSTOM'); setWindowCenter(Number(event.target.value)); }} /></label>
        <button type="button" onClick={() => setZoom((value) => Math.min(4, value + 0.25))} title="Zoom in"><ZoomIn className="w-4 h-4" /></button>
        <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} title="Zoom out"><ZoomOut className="w-4 h-4" /></button>
        <button type="button" onClick={resetView} title="Fit and reset"><RotateCcw className="w-4 h-4" /></button>
        <button type="button" onClick={() => setShowCrosshair((value) => !value)} className={showCrosshair ? 'text-cyan-600' : 'text-slate-400'} title="Toggle synchronized crosshair"><Crosshair className="w-4 h-4" /></button>
        <button type="button" onClick={() => setShowMetadata((value) => !value)} className="ml-auto" title="DICOM geometry"><FileText className="w-4 h-4" /></button>
      </div>
      <div className="px-3 py-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono text-slate-500 border-b border-slate-200 dark:border-slate-800">
        <span>Patient LPS: [{selectedText}]</span>
        <span>Voxel: [{voxel.join(', ')}] / [{dimensions.join(' × ')}]</span>
        <span>Spacing: {metadata?.sliceSpacingMm?.toFixed(2) || '—'} × {metadata?.pixelSpacingMm?.map((value) => value.toFixed(2)).join(' × ') || '—'} mm</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-slate-200 dark:bg-slate-800">
        {orientations.map((orientation) => {
          const axis = orientation === 'axial' ? 0 : orientation === 'coronal' ? 1 : 2;
          const [crossX, crossY] = metadata ? planeCrosshair(orientation, voxel, metadata) : [0.5, 0.5];
          const aspect = metadata ? planeAspect(orientation, metadata) : 1;
          const contentWidth = aspect >= 1 ? 1 : aspect;
          const contentHeight = aspect >= 1 ? 1 / aspect : 1;
          const displayCrossX = (1 - contentWidth) / 2 + crossX * contentWidth;
          const displayCrossY = (1 - contentHeight) / 2 + crossY * contentHeight;
          return (
            <div key={orientation} className="relative bg-black min-w-0">
              <div className="absolute z-10 top-2 left-2 right-2 flex justify-between text-[11px] font-mono text-slate-300 pointer-events-none">
                <span>{labels[orientation]}</span><span>{voxel[axis] + 1} / {dimensions[axis]}</span>
              </div>
              <canvas
                ref={(element) => { canvasRefs.current[orientation] = element || undefined; }}
                width={512}
                height={512}
                onClick={(event) => metadata && handleCanvasClick(event, orientation)}
                onWheel={(event) => { event.preventDefault(); updateVoxel(orientation, Math.sign(event.deltaY)); }}
                onMouseDown={(event) => setDrag({ x: event.clientX - pan.x, y: event.clientY - pan.y })}
                onMouseMove={(event) => { if (drag) setPan({ x: event.clientX - drag.x, y: event.clientY - drag.y }); }}
                onMouseUp={() => setDrag(null)}
                onMouseLeave={() => setDrag(null)}
                className="w-full aspect-square object-contain cursor-crosshair"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              />
              {showCrosshair && <div className="absolute pointer-events-none inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                <span className="absolute top-0 bottom-0 w-px bg-cyan-400/70" style={{ left: `${displayCrossX * 100}%` }} />
                <span className="absolute left-0 right-0 h-px bg-cyan-400/70" style={{ top: `${displayCrossY * 100}%` }} />
              </div>}
              <div className="absolute bottom-2 left-2 right-2 flex justify-between">
                <button type="button" onClick={() => updateVoxel(orientation, -1)} className="p-1 rounded bg-slate-900/80 text-white"><ChevronLeft className="w-4 h-4" /></button>
                <button type="button" onClick={() => updateVoxel(orientation, 1)} className="p-1 rounded bg-slate-900/80 text-white"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 p-3 text-xs text-slate-500">
        {isRealSeries && Object.values(previews).some((preview) => preview?.maskPreviewUrl) && <label className="flex items-center gap-2"><input type="checkbox" checked={showMask} onChange={(event) => setShowMask(event.target.checked)} /> Mask overlay <input type="range" min="0" max="1" step="0.05" value={maskOpacity} onChange={(event) => setMaskOpacity(Number(event.target.value))} /></label>}
        {onNavigateToAnatomy && <button type="button" onClick={onNavigateToAnatomy} className="ml-auto text-cyan-600 hover:underline">Open synchronized 3D workspace</button>}
      </div>
      {showMetadata && <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 space-y-1">
        <div>Coordinate system: {metadata?.coordinateSystem || 'Unavailable'}</div>
        <div>Origin: [{metadata?.originMm?.join(', ') || 'Unavailable'}] mm</div>
        <div>Direction cosines: [{metadata?.orientationPatient?.join(', ') || 'Unavailable'}]</div>
        <div>Window/Level: {windowWidth} / {windowCenter} HU</div>
        <div>Registration to 3D model: {metadata?.coordinateSystem === 'DICOM patient LPS' ? 'available when model provenance matches' : 'unavailable'}</div>
      </div>}
    </div>
  );
};
