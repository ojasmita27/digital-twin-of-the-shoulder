/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ResearchCase, AnatomicalLandmark } from '../../types/case';
import { ShoulderScene } from '../three/ShoulderScene';
import { LoadedMeshResult } from '../three/STLLoaderUtil';
import {
  Box,
  MapPin,
  Layers,
  Upload,
  Info,
  Maximize2,
  FileCheck,
  CheckCircle2,
  Eye,
  Sliders,
} from 'lucide-react';

interface Anatomy3DViewProps {
  activeCase: ResearchCase | null;
  onUpdateCaseLandmarks?: (landmarks: AnatomicalLandmark[]) => void;
}

export const Anatomy3DView: React.FC<Anatomy3DViewProps> = ({
  activeCase,
  onUpdateCaseLandmarks,
}) => {
  const [selectedLandmark, setSelectedLandmark] = useState<AnatomicalLandmark | null>(null);
  const [customMeshInfo, setCustomMeshInfo] = useState<LoadedMeshResult | null>(null);
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'landmarks' | 'mesh_info'>('hierarchy');

  const landmarks = activeCase?.landmarks || [];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] min-h-[620px] pb-4">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-slate-100">
              Interactive 3D Shoulder Reconstruction
            </h1>
            <span className="text-slate-600">·</span>
            <span className="text-xs font-mono text-cyan-400">
              {activeCase ? activeCase.id : 'No Active Case'}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Patient-specific polygonal surface rendering with anatomical coordinate frame and landmark references.
          </p>
        </div>

        {activeCase?.isDemo && (
          <div className="px-2.5 py-1 bg-amber-950/40 border border-amber-900/60 rounded text-[11px] font-mono text-amber-300">
            DEMO MODEL · Synthetic TotalSegmentator Reconstruction
          </div>
        )}
      </div>

      {/* Main Split Console: Left Hierarchy & Landmarks + Center/Right 3D Viewport */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 overflow-hidden">
        {/* Left Side: Scientific Anatomy & Landmark Inspector (1 Col) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center border-b border-slate-800 bg-slate-950 text-xs">
            <button
              onClick={() => setActiveTab('hierarchy')}
              className={`flex-1 py-2 font-medium transition-colors ${
                activeTab === 'hierarchy'
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Anatomy
            </button>
            <button
              onClick={() => setActiveTab('landmarks')}
              className={`flex-1 py-2 font-medium transition-colors ${
                activeTab === 'landmarks'
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Landmarks ({landmarks.length})
            </button>
            <button
              onClick={() => setActiveTab('mesh_info')}
              className={`flex-1 py-2 font-medium transition-colors ${
                activeTab === 'mesh_info'
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Geometry
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 text-xs space-y-3">
            {activeTab === 'hierarchy' && (
              <div className="space-y-3">
                <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                  Segmented Anatomical Structures
                </div>

                <div className="space-y-2">
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span>Scapula Cortex</span>
                      <span className="text-[10px] font-mono text-cyan-400">38.4k Vertices</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Glenoid cavity, subscapular fossa, supraspinatus fossa, spine & acromial arch.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span>Proximal Humerus</span>
                      <span className="text-[10px] font-mono text-cyan-400">29.8k Vertices</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Humeral head sphere, greater/lesser tuberosity, bicipital sulcus, shaft diaphysis.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span>Glenohumeral Articulation</span>
                      <span className="text-[10px] font-mono text-sky-400">Joint Space ~3.2mm</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Articular cartilage simulation overlaying glenoid and humeral surfaces.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded text-[11px] text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-300">Surface Model Provenance</div>
                  <div>Marching Cubes threshold: +250 HU</div>
                  <div>Taubin non-shrinking Laplacian smoothing (10 iterations)</div>
                  <div>Coordinate frame: ISB standard scapular plane</div>
                </div>
              </div>
            )}

            {activeTab === 'landmarks' && (
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-2">
                  Anatomical Fiducial Points
                </div>

                {landmarks.map((lm) => (
                  <div
                    key={lm.id}
                    onClick={() => setSelectedLandmark(lm)}
                    className={`p-2.5 rounded border cursor-pointer transition-colors ${
                      selectedLandmark?.id === lm.id
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-200'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span>{lm.name}</span>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">
                        {lm.structure}
                      </span>
                    </div>

                    <div className="font-mono text-[11px] text-cyan-400 mt-1">
                      [{lm.coordinatesMm[0].toFixed(1)}, {lm.coordinatesMm[1].toFixed(1)},{' '}
                      {lm.coordinatesMm[2].toFixed(1)}] mm
                    </div>

                    {lm.validationNotes && (
                      <div className="text-[10px] text-slate-400 mt-1 leading-tight">
                        {lm.validationNotes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'mesh_info' && (
              <div className="space-y-3 font-mono text-[11px]">
                <div className="text-slate-500 uppercase tracking-wider">
                  Geometric Bounding Box
                </div>

                {customMeshInfo ? (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-2">
                    <div className="text-cyan-400 font-semibold">Uploaded Patient STL</div>
                    <div>Vertices: {customMeshInfo.vertexCount.toLocaleString()}</div>
                    <div>Triangles: {customMeshInfo.faceCount.toLocaleString()}</div>
                    <div>
                      Dimensions (X, Y, Z):
                      <div className="text-slate-200 mt-0.5">
                        {customMeshInfo.boundingBox.dimensions[0].toFixed(1)} ×{' '}
                        {customMeshInfo.boundingBox.dimensions[1].toFixed(1)} ×{' '}
                        {customMeshInfo.boundingBox.dimensions[2].toFixed(1)} mm
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-2 text-slate-400">
                    <div className="text-slate-200 font-semibold">Synthetic Baseline Mesh</div>
                    <div>Scapula Vertex Count: 38,450</div>
                    <div>Humerus Vertex Count: 29,810</div>
                    <div>Glenoid Ellipse Aspect: 1.38</div>
                    <div>Bounding Span: 184 × 165 × 95 mm</div>
                  </div>
                )}

                <div className="p-3 bg-slate-950 border border-slate-800 rounded text-slate-400 space-y-1">
                  <div className="text-slate-300 font-sans font-medium">Coordinate System</div>
                  <div className="text-[10px]">
                    X-axis: Medial (-) to Lateral (+)<br />
                    Y-axis: Inferior (-) to Superior (+)<br />
                    Z-axis: Posterior (-) to Anterior (+)
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center & Right: 3D Three.js Viewport (3 Cols) */}
        <div className="lg:col-span-3 h-full">
          <ShoulderScene
            landmarks={landmarks}
            activeLandmarkId={selectedLandmark?.id}
            onSelectLandmark={setSelectedLandmark}
            onMeshLoaded={(info) => {
              setCustomMeshInfo(info);
              setActiveTab('mesh_info');
            }}
          />
        </div>
      </div>
    </div>
  );
};
