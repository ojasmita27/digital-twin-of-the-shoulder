/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { CTSliceMetadata } from '../../types/case';
import { DicomSimulator, SliceOrientation, WINDOW_PRESETS } from '../../services/dicomSimulator';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sliders,
  Crosshair,
  Maximize2,
  FileText,
  Layers,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';

interface CTViewerProps {
  metadata?: CTSliceMetadata;
  onSliceChange?: (sliceIndex: number) => void;
}

export const CTViewer: React.FC<CTViewerProps> = ({ metadata, onSliceChange }) => {
  const [orientation, setOrientation] = useState<SliceOrientation>('axial');
  const [sliceIndex, setSliceIndex] = useState(84);
  const totalSlices = metadata?.sliceCount || 168;

  const [windowWidth, setWindowWidth] = useState(metadata?.windowWidth || 1500);
  const [windowCenter, setWindowCenter] = useState(metadata?.windowCenter || 450);
  const [activePreset, setActivePreset] = useState<string>('BONE');

  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [showCrosshair, setShowCrosshair] = useState(true);
  const [crosshairPos, setCrosshairPos] = useState({ x: 0.5, y: 0.5 });
  const [probeInfo, setProbeInfo] = useState<{ x: number; y: number; hu: number; region: string } | null>(null);
  const [showMetadataDrawer, setShowMetadataDrawer] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Render slice to canvas when slice, orientation, window/level, or crosshair changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const normalizedSlice = Math.max(0, Math.min(1, sliceIndex / totalSlices));
    DicomSimulator.renderSlice(
      canvas,
      orientation,
      normalizedSlice,
      windowWidth,
      windowCenter,
      showCrosshair,
      crosshairPos.x,
      crosshairPos.y
    );
  }, [orientation, sliceIndex, totalSlices, windowWidth, windowCenter, showCrosshair, crosshairPos]);

  // Handle Preset change
  const handlePresetSelect = (presetKey: string) => {
    const p = WINDOW_PRESETS[presetKey];
    if (p) {
      setActivePreset(presetKey);
      setWindowWidth(p.windowWidth);
      setWindowCenter(p.windowCenter);
    }
  };

  // Mouse wheel slice scrolling
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    setSliceIndex((prev) => {
      const next = Math.max(1, Math.min(totalSlices, prev + delta));
      if (onSliceChange) onSliceChange(next);
      return next;
    });
  };

  // Canvas Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      // Left click pan
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }

    setCrosshairPos({ x: nx, y: ny });

    // Estimate Hounsfield Unit at cursor position
    const pixelX = Math.round(nx * (metadata?.columns || 512));
    const pixelY = Math.round(ny * (metadata?.rows || 512));

    // Simulated regional HU probe
    let estimatedHU = -950;
    let region = 'Air / Background';
    const distToCenter = Math.hypot(nx - 0.5, ny - 0.5);

    if (distToCenter < 0.12) {
      estimatedHU = 1280;
      region = 'Glenoid / Humeral Cortex';
    } else if (distToCenter < 0.22) {
      estimatedHU = 320;
      region = 'Cancellous Trabeculae';
    } else if (distToCenter < 0.42) {
      estimatedHU = 42;
      region = 'Deltoid / Rotator Cuff';
    }

    setProbeInfo({ x: pixelX, y: pixelY, hu: estimatedHU, region });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleResetZoomPan = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  if (!metadata) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[460px] p-8 text-center bg-slate-900/50 border border-slate-800 rounded-lg">
        <Layers className="w-10 h-10 text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-slate-200">No CT Series Loaded</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
          Upload a DICOM series or select a study to inspect cross-sectional anatomy in multi-planar views.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full min-h-[560px] bg-slate-950 border border-slate-800 rounded-lg overflow-hidden select-none"
    >
      {/* Top Telemetry & Controls Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs">
        {/* Orientation Tabs */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-slate-500 font-mono mr-1">PLANE:</span>
          {(['axial', 'coronal', 'sagittal'] as SliceOrientation[]).map((plane) => (
            <button
              key={plane}
              onClick={() => setOrientation(plane)}
              className={`px-2.5 py-1 rounded text-xs font-medium uppercase transition-colors ${
                orientation === plane
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {plane}
            </button>
          ))}
        </div>

        {/* Window/Level Preset Selectors */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500 font-mono">W/L:</span>
          {Object.keys(WINDOW_PRESETS).map((key) => (
            <button
              key={key}
              onClick={() => handlePresetSelect(key)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                activePreset === key
                  ? 'bg-slate-800 text-slate-100 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        {/* Viewport Action Icons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(3.0, z + 0.2))}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetZoomPan}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
            title="Reset Pan/Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowCrosshair(!showCrosshair)}
            className={`p-1 rounded ${showCrosshair ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400 hover:text-slate-200'}`}
            title="Toggle Crosshairs"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowMetadataDrawer(!showMetadataDrawer)}
            className={`p-1 rounded ${showMetadataDrawer ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400 hover:text-slate-200'}`}
            title="DICOM Metadata Inspector"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center Image Stage */}
      <div
        className="flex-1 relative flex items-center justify-center bg-black overflow-hidden cursor-crosshair"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Medical Canvas */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.05s ease-out',
          }}
        >
          <canvas
            ref={canvasRef}
            width={512}
            height={512}
            className="w-[480px] h-[480px] object-contain shadow-2xl"
          />
        </div>

        {/* Anatomical Orientation Watermarks */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-slate-400 text-xs font-mono font-bold tracking-widest pointer-events-none">
          {orientation === 'axial' ? 'ANTERIOR' : 'SUPERIOR'}
        </div>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-slate-400 text-xs font-mono font-bold tracking-widest pointer-events-none">
          {orientation === 'axial' ? 'POSTERIOR' : 'INFERIOR'}
        </div>
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono font-bold tracking-widest pointer-events-none">
          {orientation === 'sagittal' ? 'ANTERIOR' : 'RIGHT'}
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono font-bold tracking-widest pointer-events-none">
          {orientation === 'sagittal' ? 'POSTERIOR' : 'LEFT'}
        </div>

        {/* Top-Left Telemetry Overlay */}
        <div className="absolute top-3 left-3 bg-slate-900/80 border border-slate-800 p-2 rounded text-[11px] font-mono text-slate-300 pointer-events-none space-y-0.5">
          <div>
            SLICE: <span className="text-cyan-400">{sliceIndex}</span> / {totalSlices}
          </div>
          <div>
            THICKNESS: <span className="text-slate-100">{metadata.sliceThicknessMm.toFixed(2)} mm</span>
          </div>
          <div>
            SPACING: <span className="text-slate-100">{metadata.pixelSpacingMm[0].toFixed(3)} mm</span>
          </div>
          <div>
            ZOOM: <span className="text-slate-100">{(zoom * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Bottom-Left Live HU Probe Overlay */}
        {probeInfo && (
          <div className="absolute bottom-3 left-3 bg-slate-900/85 border border-slate-800 p-2 rounded text-[11px] font-mono pointer-events-none">
            <div className="text-slate-400">
              PIXEL: [{probeInfo.x}, {probeInfo.y}]
            </div>
            <div className="text-cyan-400 font-semibold">
              VALUE: {probeInfo.hu} HU <span className="text-slate-400 font-normal">({probeInfo.region})</span>
            </div>
          </div>
        )}

        {/* Bottom-Right Window/Level Overlay */}
        <div className="absolute bottom-3 right-3 bg-slate-900/80 border border-slate-800 p-2 rounded text-[11px] font-mono text-slate-300 pointer-events-none text-right">
          <div>
            W: <span className="text-cyan-400">{windowWidth}</span>
          </div>
          <div>
            L: <span className="text-cyan-400">{windowCenter}</span>
          </div>
          <div className="text-[10px] text-slate-500">KERNEL: {metadata.reconstructionKernel}</div>
        </div>

        {/* Slide-out Technical DICOM Metadata Drawer */}
        {showMetadataDrawer && (
          <div className="absolute top-0 right-0 bottom-0 w-72 bg-slate-900/95 border-l border-slate-800 p-4 overflow-y-auto text-xs z-30 shadow-2xl">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
              <span className="font-semibold text-slate-200">DICOM Attributes</span>
              <button
                onClick={() => setShowMetadataDrawer(false)}
                className="text-slate-500 hover:text-slate-300 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-[11px] font-mono text-slate-400">
              <div>
                <span className="text-slate-500">Modality:</span> {metadata.modality}
              </div>
              <div>
                <span className="text-slate-500">Matrix:</span> {metadata.columns} × {metadata.rows}
              </div>
              <div>
                <span className="text-slate-500">Slice Thickness:</span> {metadata.sliceThicknessMm} mm
              </div>
              <div>
                <span className="text-slate-500">Pixel Spacing:</span> {metadata.pixelSpacingMm[0]} ×{' '}
                {metadata.pixelSpacingMm[1]} mm
              </div>
              <div>
                <span className="text-slate-500">Tube Voltage:</span> {metadata.kvp} kVp
              </div>
              <div>
                <span className="text-slate-500">Tube Current:</span> {metadata.tubeCurrentMa} mA
              </div>
              <div>
                <span className="text-slate-500">Gantry Tilt:</span> {metadata.gantryTiltDeg}°
              </div>
              <div>
                <span className="text-slate-500">Kernel:</span> {metadata.reconstructionKernel}
              </div>
              <div className="break-all">
                <span className="text-slate-500">Series UID:</span> {metadata.seriesInstanceUid}
              </div>
              <div className="break-all">
                <span className="text-slate-500">Study UID:</span> {metadata.studyInstanceUid}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Slice Navigation Rail */}
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-slate-900 border-t border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSliceIndex((s) => Math.max(1, s - 1))}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-slate-300 text-xs tabular-nums">
            {sliceIndex} / {totalSlices}
          </span>
          <button
            onClick={() => setSliceIndex((s) => Math.min(totalSlices, s + 1))}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Slice Slider */}
        <div className="flex-1 max-w-xl mx-4 flex items-center gap-3">
          <span className="text-[11px] text-slate-500 font-mono">INDEX:</span>
          <input
            type="range"
            min="1"
            max={totalSlices}
            value={sliceIndex}
            onChange={(e) => {
              const val = Number(e.target.value);
              setSliceIndex(val);
              if (onSliceChange) onSliceChange(val);
            }}
            className="flex-1 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Manual Window/Level Sliders */}
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span>W:</span>
            <input
              type="range"
              min="100"
              max="4000"
              value={windowWidth}
              onChange={(e) => setWindowWidth(Number(e.target.value))}
              className="w-16 h-1 bg-slate-800"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span>L:</span>
            <input
              type="range"
              min="-1000"
              max="1500"
              value={windowCenter}
              onChange={(e) => setWindowCenter(Number(e.target.value))}
              className="w-16 h-1 bg-slate-800"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
