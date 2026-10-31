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
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';

interface Anatomy3DViewProps {
  activeCase: ResearchCase | null;
  onUpdateCaseLandmarks?: (landmarks: AnatomicalLandmark[]) => void;
}

export const Anatomy3DView: React.FC<Anatomy3DViewProps> = ({
  activeCase,
}) => {
  const [selectedLandmark, setSelectedLandmark] = useState<AnatomicalLandmark | null>(null);
  const [customMeshInfo, setCustomMeshInfo] = useState<LoadedMeshResult | null>(null);
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'landmarks' | 'geometry'>('hierarchy');
  const [geometryExpanded, setGeometryExpanded] = useState(false);

  const landmarks = activeCase?.landmarks || [];
  const isProceduralTemplate = !customMeshInfo && (!activeCase?.meshes || activeCase.meshes.length === 0);

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] min-h-[640px] pb-3 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/80 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-teal-700 dark:text-cyan-400 font-semibold">
              Surface Kinematics
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {activeCase ? activeCase.id : 'No Active Case'}
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Interactive 3D Shoulder Reconstruction
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Polygonal surface rendering with standard ISB anatomical coordinate frame and interactive landmark inspection.
          </p>
        </div>

        {/* Provenance Badge */}
        {isProceduralTemplate ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-md text-xs font-mono text-amber-800 dark:text-amber-300 shadow-xs">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold">DEMO MODEL</span>
              <span className="text-[11px] text-amber-700 dark:text-amber-200/80 ml-1.5 hidden md:inline">
                (Mathematical template — load an STL to inspect patient geometry)
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-md text-xs font-mono text-emerald-800 dark:text-emerald-300 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>PATIENT-SPECIFIC MESH LOADED</span>
          </div>
        )}
      </div>

      {/* Main Split Console: Left Anatomy & Landmark Inspector + Center/Right 3D Viewport */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 overflow-hidden">
        {/* Left Side: Anatomical Inspector (1 Col) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col overflow-hidden shadow-xs transition-colors">
          {/* Navigation Tabs */}
          <div className="flex items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs">
            <button
              onClick={() => setActiveTab('hierarchy')}
              className={`flex-1 py-2.5 font-medium transition-colors ${
                activeTab === 'hierarchy'
                  ? 'text-teal-700 dark:text-cyan-400 border-b-2 border-teal-600 dark:border-cyan-400 bg-white dark:bg-slate-900 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Structures
            </button>
            <button
              onClick={() => setActiveTab('landmarks')}
              className={`flex-1 py-2.5 font-medium transition-colors ${
                activeTab === 'landmarks'
                  ? 'text-teal-700 dark:text-cyan-400 border-b-2 border-teal-600 dark:border-cyan-400 bg-white dark:bg-slate-900 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Landmarks ({landmarks.length})
            </button>
            <button
              onClick={() => setActiveTab('geometry')}
              className={`flex-1 py-2.5 font-medium transition-colors ${
                activeTab === 'geometry'
                  ? 'text-teal-700 dark:text-cyan-400 border-b-2 border-teal-600 dark:border-cyan-400 bg-white dark:bg-slate-900 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Geometry
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 text-xs space-y-3">
            {activeTab === 'hierarchy' && (
              <div className="space-y-3">
                <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">
                  Rendered Anatomical Layers
                </div>

                <div className="space-y-2">
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                      <span>Scapular Cortical Body</span>
                      <span className="text-[10px] font-mono text-teal-700 dark:text-cyan-400">Cortical Shell</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Glenoid vault, acromion, coracoid process, and subscapular body.
                    </p>
                  </div>

                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                      <span>Proximal Humerus</span>
                      <span className="text-[10px] font-mono text-teal-700 dark:text-cyan-400">Epiphysis</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Humeral articular sphere, greater/lesser tuberosities, and anatomical neck.
                    </p>
                  </div>

                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 space-y-1">
                    <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                      <span>Joint Space Distance</span>
                      <span className="text-[10px] font-mono text-teal-700 dark:text-cyan-400">Distraction Control</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Use the distraction slider in the viewport dock to separate glenohumeral surfaces for en-face glenoid inspection.
                    </p>
                  </div>
                </div>

                {/* Coordinate Frame Info */}
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-800 dark:text-slate-300">ISB Coordinate System</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-mono">
                    X-axis: Medial (-) to Lateral (+)<br />
                    Y-axis: Inferior (-) to Superior (+)<br />
                    Z-axis: Posterior (-) to Anterior (+)
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'landmarks' && (
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 font-semibold">
                  Anatomical Fiducial Landmarks
                </div>

                {landmarks.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs">
                    No landmarks registered for this case.
                  </div>
                ) : (
                  landmarks.map((lm) => (
                    <div
                      key={lm.id}
                      onClick={() => setSelectedLandmark(lm)}
                      className={`p-2.5 rounded-md border cursor-pointer transition-colors ${
                        selectedLandmark?.id === lm.id
                          ? 'bg-teal-50 dark:bg-cyan-500/10 border-teal-300 dark:border-cyan-500/50 text-teal-900 dark:text-cyan-200 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>{lm.name}</span>
                        <span className="text-[10px] font-mono text-slate-400 uppercase">
                          {lm.structure}
                        </span>
                      </div>

                      <div className="font-mono text-[11px] text-teal-700 dark:text-cyan-400 mt-1">
                        [{lm.coordinatesMm[0].toFixed(1)}, {lm.coordinatesMm[1].toFixed(1)},{' '}
                        {lm.coordinatesMm[2].toFixed(1)}] mm
                      </div>

                      {lm.validationNotes && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                          {lm.validationNotes}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'geometry' && (
              <div className="space-y-3 font-mono text-[11px]">
                <div className="text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">
                  Mesh Geometry & Polydata
                </div>

                {customMeshInfo ? (
                  <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md space-y-2">
                    <div className="text-teal-700 dark:text-cyan-400 font-semibold font-sans">Uploaded Patient Surface</div>
                    <div>Vertices: {customMeshInfo.vertexCount.toLocaleString()}</div>
                    <div>Faces (Triangles): {customMeshInfo.faceCount.toLocaleString()}</div>
                    <div>
                      Bounding Dimensions (X, Y, Z):
                      <div className="text-slate-800 dark:text-slate-200 mt-0.5">
                        {customMeshInfo.boundingBox.dimensions[0].toFixed(1)} ×{' '}
                        {customMeshInfo.boundingBox.dimensions[1].toFixed(1)} ×{' '}
                        {customMeshInfo.boundingBox.dimensions[2].toFixed(1)} mm
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md space-y-2 text-slate-600 dark:text-slate-400">
                    <div className="text-amber-700 dark:text-amber-300 font-semibold font-sans">Synthetic Baseline Template</div>
                    <div>Scapula Vertex Count: 38,450</div>
                    <div>Humerus Vertex Count: 29,810</div>
                    <div>Glenoid Ellipse Aspect: 1.38</div>
                    <div>Bounding Span: 184 × 165 × 95 mm</div>
                  </div>
                )}

                {/* Collapsible Advanced Properties */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-md bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans">
                  <button
                    onClick={() => setGeometryExpanded(!geometryExpanded)}
                    className="w-full p-2.5 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    <span>Surface Properties & Filters</span>
                    {geometryExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>
                  {geometryExpanded && (
                    <div className="p-3 pt-0 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1.5 font-mono">
                      <div>Normals: Per-vertex smoothed</div>
                      <div>Smoothing: Taubin non-shrinking (10 iter)</div>
                      <div>Winding: Counter-clockwise (CCW)</div>
                      <div>Supported: Binary & ASCII STL</div>
                    </div>
                  )}
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
              setActiveTab('geometry');
            }}
          />
        </div>
      </div>
    </div>
  );
};
