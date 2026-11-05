/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ResearchCase, AnatomicalLandmark, SavedMeasurement, MeshArtifact, ViewerPreferences } from '../../types/case';
import { ShoulderScene } from '../three/ShoulderScene';
import { LoadedMeshResult } from '../three/STLLoaderUtil';
import { apiClient } from '../../services/apiClient';
import { caseStorage } from '../../services/caseStorage';
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
  onUpdateCaseLandmarks,
}) => {
  const [selectedLandmark, setSelectedLandmark] = useState<AnatomicalLandmark | null>(null);
  const [customMeshInfo, setCustomMeshInfo] = useState<LoadedMeshResult | null>(null);
  const [customMeshFile, setCustomMeshFile] = useState<{ name: string; size: number } | null>(null);
  const [meshError, setMeshError] = useState<string | null>(null);
  const [customMeshBuffer, setCustomMeshBuffer] = useState<ArrayBuffer | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [landmarkMode, setLandmarkMode] = useState(false);
  const [landmarkMoveMode, setLandmarkMoveMode] = useState(false);
  const [landmarkName, setLandmarkName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [measurementSelection, setMeasurementSelection] = useState<string[]>([]);
  const [measurementError, setMeasurementError] = useState<string | null>(null);
  const restoringModel = useRef(false);
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'landmarks' | 'geometry'>('hierarchy');
  const [geometryExpanded, setGeometryExpanded] = useState(false);
  const [viewerPreferences, setViewerPreferences] = useState<ViewerPreferences>(() => ({
    scapulaVisible: activeCase?.viewerPreferences?.scapulaVisible ?? true,
    humerusVisible: activeCase?.viewerPreferences?.humerusVisible ?? true,
    landmarksVisible: activeCase?.viewerPreferences?.landmarksVisible ?? true,
    selectedModelId: activeCase?.viewerPreferences?.selectedModelId,
    selectedSliceIndex: activeCase?.viewerPreferences?.selectedSliceIndex,
  }));

  const patientMeshes = (activeCase?.meshes || []).filter((mesh) => !mesh.isDemoMesh);
  const savedModel = (
    patientMeshes.find((mesh) => mesh.id === viewerPreferences.selectedModelId) || patientMeshes[patientMeshes.length - 1]
  ) as MeshArtifact | undefined;
  const hasSeparatePatientBones = patientMeshes.some((mesh) => mesh.structure === 'scapula')
    && patientMeshes.some((mesh) => mesh.structure === 'humerus');
  const landmarks = (activeCase?.landmarks || []).filter((landmark) => (
    !savedModel || (landmark.modelId === savedModel.id && landmark.modelVersion === (savedModel.version || 1))
  ));
  const isProceduralTemplate = !customMeshInfo && (!activeCase?.meshes || activeCase.meshes.length === 0);
  const staleLandmarkCount = (activeCase?.landmarks || []).length - landmarks.length;

  useEffect(() => {
    setViewerPreferences({
      scapulaVisible: activeCase?.viewerPreferences?.scapulaVisible ?? true,
      humerusVisible: activeCase?.viewerPreferences?.humerusVisible ?? true,
      landmarksVisible: activeCase?.viewerPreferences?.landmarksVisible ?? true,
      selectedModelId: activeCase?.viewerPreferences?.selectedModelId,
      selectedSliceIndex: activeCase?.viewerPreferences?.selectedSliceIndex,
    });
  }, [activeCase?.id, activeCase?.viewerPreferences]);

  const persistViewerPreferences = (next: ViewerPreferences) => {
    setViewerPreferences(next);
    if (activeCase && !activeCase.isDemo) {
      persistCase({ viewerPreferences: next });
    }
  };

  const updateLandmark = async (landmarkId: string, updates: Partial<AnatomicalLandmark>) => {
    if (!activeCase || !savedModel) return;
    const landmark = landmarks.find((item) => item.id === landmarkId);
    if (!landmark || landmark.modelId !== savedModel.id || landmark.modelVersion !== (savedModel.version || 1)) {
      setMeshError('This landmark is stale and cannot be edited on the current model.');
      return;
    }
    const result = await apiClient.updateLandmark(activeCase.id, landmarkId, updates);
    if (!result.data) {
      setMeshError(result.error || 'The landmark could not be updated.');
      return;
    }
    const next = (activeCase.landmarks || []).map((item) => item.id === landmarkId ? result.data as AnatomicalLandmark : item);
    onUpdateCaseLandmarks?.(next);
    caseStorage.updateCase(activeCase.id, { landmarks: next });
    setSelectedLandmark(result.data);
  };

  const saveMeasurement = async (type: 'point_to_point' | 'angle') => {
    if (!activeCase || !savedModel) return;
    const required = type === 'angle' ? 3 : 2;
    if (measurementSelection.length < required) {
      setMeasurementError(`${type === 'angle' ? 'Angle' : 'Distance'} requires ${required} selected landmarks.`);
      return;
    }
    const selected = measurementSelection.slice(0, required)
      .map((id) => landmarks.find((landmark) => landmark.id === id))
      .filter((landmark): landmark is AnatomicalLandmark => Boolean(landmark));
    if (selected.length !== required) {
      setMeasurementError('One or more selected landmarks are missing or stale.');
      return;
    }
    const result = await apiClient.createMeasurement(activeCase.id, {
      type,
      modelId: savedModel.id,
      modelVersion: savedModel.version || 1,
      landmarkIds: selected.map((landmark) => landmark.id),
      pointA: selected[0].coordinatesMm,
      pointB: selected[1].coordinatesMm,
      pointC: selected[2]?.coordinatesMm,
      displayUnit: savedModel.unit || 'unknown',
    });
    if (!result.data) {
      setMeasurementError(result.error || 'The measurement could not be saved.');
      return;
    }
    const existing = activeCase.measurements?.manualMeasurements || [];
    await persistCase({
      measurements: {
        ...(activeCase.measurements || {}),
        manualMeasurements: [...existing, result.data],
      } as ResearchCase['measurements'],
    });
    setMeasurementError(null);
    setMeasurementSelection([]);
  };

  useEffect(() => {
    if (savedModel && saveStatus === 'idle') setSaveStatus('saved');
  }, [savedModel, saveStatus]);

  useEffect(() => {
    let cancelled = false;
    if (!activeCase || !savedModel?.id) {
      setCustomMeshBuffer(null);
      return;
    }
    restoringModel.current = true;
    apiClient.downloadModel(activeCase.id, savedModel.id).then((result) => {
      if (cancelled) return;
      if (result.data) {
        setCustomMeshBuffer(result.data);
      } else {
        restoringModel.current = false;
        setMeshError(result.error || 'Saved model file could not be restored.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeCase?.id, savedModel?.id]);

  const persistCase = async (updates: Partial<ResearchCase>) => {
    if (!activeCase || activeCase.isDemo) return;
    setSaveStatus('saving');
    const result = await apiClient.updateCase(activeCase.id, updates);
    if (result.data) {
      caseStorage.updateCase(activeCase.id, updates);
      setSaveStatus('saved');
    } else {
      setSaveStatus('failed');
      setMeshError(result.error || 'Changes could not be saved.');
    }
  };

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
          {savedModel && (
            <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              Model v{savedModel.version || 1} · {savedModel.filename} · Units: {savedModel.unit || 'unknown'}
              {savedModel.unitVerified ? ' (verified)' : ' (unverified)'}
            </div>
          )}
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
            <span>PATIENT-SPECIFIC MESH LOADED · {saveStatus === 'saving' ? 'SAVING' : saveStatus === 'failed' ? 'SAVE FAILED' : saveStatus === 'saved' ? 'SAVED' : 'UNSAVED'}</span>
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
                  {staleLandmarkCount > 0 && (
                    <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                      {staleLandmarkCount} landmark(s) belong to another mesh version and are hidden until that model is reopened.
                    </div>
                  )}
                  <div className="rounded border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                    <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                      <span>Patient model structures</span>
                      <span className={`text-[10px] font-mono ${hasSeparatePatientBones ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {hasSeparatePatientBones ? 'SEPARATE MESHES' : 'COMBINED / UNSUPPORTED'}
                      </span>
                    </div>
                    {!hasSeparatePatientBones && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        The saved reconstruction does not contain independently labeled scapula and humerus meshes. Structure toggles remain available for the procedural template only; no anatomy is fabricated.
                      </p>
                    )}
                    {patientMeshes.length > 0 && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {patientMeshes.length} saved version{patientMeshes.length === 1 ? '' : 's'} · current v{savedModel?.version || 1}
                      </div>
                    )}
                  </div>

                  {patientMeshes.length > 1 && (
                    <div className="rounded border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">Model comparison</div>
                      {patientMeshes.slice(-2).map((mesh, index, recent) => (
                        <button
                          key={mesh.id}
                          type="button"
                          onClick={() => persistViewerPreferences({ ...viewerPreferences, selectedModelId: mesh.id })}
                          className={`w-full flex items-center justify-between text-[11px] text-left rounded px-1 ${mesh.id === savedModel?.id ? 'bg-teal-50 dark:bg-cyan-950/30' : ''}`}
                        >
                          <span>v{mesh.version || 1} · {mesh.structure} · {mesh.filename}</span>
                          <span className={index === recent.length - 1 ? 'text-emerald-600' : 'text-amber-600'}>
                            {mesh.id === savedModel?.id ? 'SELECTED' : index === recent.length - 1 ? 'CURRENT' : 'OUTDATED'}
                          </span>
                        </button>
                      ))}
                      {patientMeshes.length >= 2 && (() => {
                        const previous = patientMeshes[patientMeshes.length - 2];
                        const current = patientMeshes[patientMeshes.length - 1];
                        const vertexDelta = (current.vertexCount || 0) - (previous.vertexCount || 0);
                        const faceDelta = (current.faceCount || current.triangleCount || 0) - (previous.faceCount || previous.triangleCount || 0);
                        return (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            Stored geometry delta: vertices {vertexDelta >= 0 ? '+' : ''}{vertexDelta}, faces {faceDelta >= 0 ? '+' : ''}{faceDelta}
                          </div>
                        );
                      })()}
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Geometry comparison is limited to stored mesh metadata; a voxel/mesh registration difference is not computed by this client.
                      </p>
                    </div>
                  )}
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
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 font-semibold">
                    Manual Landmarks
                  </div>
                  {selectedLandmark && savedModel && (
                    <div className="space-y-2 rounded border border-teal-200 dark:border-cyan-800/50 p-2">
                      <div className="text-[11px] font-semibold text-teal-800 dark:text-cyan-200">
                        Selected: {selectedLandmark.name}
                      </div>
                      <input
                        value={renameValue || selectedLandmark.name}
                        onChange={(event) => setRenameValue(event.target.value)}
                        className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                        aria-label="Rename selected landmark"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-[10px] px-2 py-1 rounded border border-teal-300 text-teal-700 dark:text-cyan-300"
                          onClick={() => {
                            const name = renameValue.trim();
                            if (!name) {
                              setMeshError('Landmark name cannot be empty.');
                              return;
                            }
                            updateLandmark(selectedLandmark.id, { name });
                            setRenameValue('');
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className={`text-[10px] px-2 py-1 rounded border ${landmarkMoveMode ? 'bg-amber-100 border-amber-400 text-amber-800' : 'border-amber-300 text-amber-700'}`}
                          onClick={() => setLandmarkMoveMode((active) => !active)}
                        >
                          {landmarkMoveMode ? 'Click mesh…' : 'Move selected'}
                        </button>
                      </div>
                    </div>
                  )}
                  {savedModel && (
                    <button
                      onClick={() => setLandmarkMode((active) => !active)}
                      className="text-[10px] px-2 py-1 rounded border border-teal-300 text-teal-700 dark:text-cyan-300"
                    >
                      {landmarkMode ? 'Click mesh…' : 'Place point'}
                    </button>
                  )}
                </div>
                {savedModel && landmarkMode && (
                  <input
                    value={landmarkName}
                    onChange={(event) => setLandmarkName(event.target.value)}
                    placeholder="Landmark name"
                    className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                )}

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
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          className={`text-[10px] ${measurementSelection.includes(lm.id) ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500'}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setMeasurementSelection((current) => current.includes(lm.id)
                              ? current.filter((id) => id !== lm.id)
                              : [...current, lm.id]);
                          }}
                        >
                          {measurementSelection.includes(lm.id) ? 'Selected for measurement' : 'Use in measurement'}
                        </button>
                        <button
                          type="button"
                          className="text-[10px] text-rose-700 dark:text-rose-300"
                          onClick={async (event) => {
                            event.stopPropagation();
                            if (!activeCase) return;
                            const result = await apiClient.deleteLandmark(activeCase.id, lm.id);
                            if (result.status === 204) {
                              const next = (activeCase.landmarks || []).filter((item) => item.id !== lm.id);
                              onUpdateCaseLandmarks?.(next);
                              caseStorage.updateCase(activeCase.id, { landmarks: next });
                              if (selectedLandmark?.id === lm.id) setSelectedLandmark(null);
                            } else {
                              setMeshError(result.error || 'The landmark could not be deleted.');
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>

                      {lm.validationNotes && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                          {lm.validationNotes}
                        </div>
                      )}
                    </div>
                  ))
                )}
                {measurementSelection.length > 0 && (
                  <div className="rounded border border-slate-200 dark:border-slate-700 p-2 space-y-2">
                    <div className="text-[10px] text-slate-500">Selected landmarks: {measurementSelection.length}</div>
                    <div className="flex gap-2">
                      <button type="button" className="text-[10px] px-2 py-1 rounded border border-teal-300 text-teal-700 dark:text-cyan-300" onClick={() => saveMeasurement('point_to_point')}>
                        Save distance
                      </button>
                      <button type="button" className="text-[10px] px-2 py-1 rounded border border-teal-300 text-teal-700 dark:text-cyan-300" onClick={() => saveMeasurement('angle')}>
                        Save angle
                      </button>
                    </div>
                    {measurementError && <div className="text-[10px] text-rose-700 dark:text-rose-300">{measurementError}</div>}
                  </div>
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
                    <div className="text-teal-700 dark:text-cyan-400 font-semibold font-sans">Imported STL Surface</div>
                    {customMeshFile && (
                      <div className="text-slate-600 dark:text-slate-400 font-sans">
                        {customMeshFile.name} · {(customMeshFile.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    )}
                    <div>Vertices: {customMeshInfo.vertexCount.toLocaleString()}</div>
                    <div>Faces (Triangles): {customMeshInfo.faceCount.toLocaleString()}</div>
                    <div>
                      Bounding Dimensions (X, Y, Z):
                      <div className="text-slate-800 dark:text-slate-200 mt-0.5">
                        {customMeshInfo.boundingBox.dimensions[0].toFixed(1)} ×{' '}
                        {customMeshInfo.boundingBox.dimensions[1].toFixed(1)} ×{' '}
                        {customMeshInfo.boundingBox.dimensions[2].toFixed(1)} (units unverified)
                      </div>
                    </div>
                    <div>Surface area: {customMeshInfo.surfaceArea.toFixed(2)} (units², unverified)</div>
                    <div>Watertightness: {customMeshInfo.isWatertight === null ? 'Not evaluated' : customMeshInfo.isWatertight ? 'Yes' : 'No'}</div>
                    <div>Connected components: {customMeshInfo.connectedComponentCount}</div>
                    <div>Boundary edges: {customMeshInfo.boundaryEdgeCount}</div>
                    <div>Non-manifold edges: {customMeshInfo.nonManifoldEdgeCount}</div>
                    <div>Degenerate triangles: {customMeshInfo.degenerateTriangleCount}</div>
                    <div>Duplicate triangles: {customMeshInfo.duplicateTriangleCount}</div>
                    <div>Normals: {customMeshInfo.normalsConsistent === null ? 'Not assessed' : customMeshInfo.normalsConsistent ? 'Consistent' : 'Inconsistent'}</div>
                    <div className={customMeshInfo.validationStatus === 'valid' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-300'}>
                      Validation: {customMeshInfo.validationStatus === 'valid' ? 'Pass (technical mesh checks)' : 'Fail (degenerate triangles detected)'}
                    </div>
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-2 mt-2 space-y-1.5 font-sans">
                      <div className="font-semibold text-slate-700 dark:text-slate-300">Quality assessment</div>
                      {customMeshInfo.qualityChecks.map((check) => (
                        <div key={check.name} className="flex items-start justify-between gap-2">
                          <span>{check.name}</span>
                          <span className={
                            check.status === 'pass'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : check.status === 'fail'
                                ? 'text-rose-700 dark:text-rose-300'
                                : check.status === 'warning'
                                  ? 'text-amber-700 dark:text-amber-300'
                                  : 'text-slate-500'
                          }>
                            {check.status.replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                    {customMeshInfo.connectedComponentCount > 1 && (
                      <div className="text-amber-700 dark:text-amber-300 font-sans">
                        Warning: this STL contains disconnected surface components. Anatomy is not independently identified.
                      </div>
                    )}
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
                {meshError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-md text-rose-700 dark:text-rose-300 font-sans">
                    {meshError}
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
            customStlBuffer={customMeshBuffer}
            customModelName={savedModel?.filename || 'restored-model.stl'}
            unitScale={savedModel?.unit || 'unknown'}
            scapulaVisible={viewerPreferences.scapulaVisible}
            humerusVisible={viewerPreferences.humerusVisible}
            showLandmarks={viewerPreferences.landmarksVisible}
            onVisibilityChange={(visibility) => persistViewerPreferences({
              ...viewerPreferences,
              ...visibility,
            })}
            activeLandmarkId={selectedLandmark?.id}
            onSelectLandmark={setSelectedLandmark}
            landmarkMode={landmarkMode}
            landmarkMoveMode={landmarkMoveMode}
            onLandmarkMove={(landmarkId, point) => {
              setLandmarkMoveMode(false);
              updateLandmark(landmarkId, { coordinatesMm: point });
            }}
            onLandmarkPoint={(point) => {
              if (!activeCase || !savedModel || !landmarkName.trim()) {
                setMeshError('Enter a landmark name before selecting a surface point.');
                return;
              }
              const landmarkPayload = {
                name: landmarkName.trim(),
                structure: 'scapula',
                coordinatesMm: point,
                provenance: 'manual_annotated' as const,
                modelId: savedModel.id,
                modelVersion: savedModel.version || 1,
                coordinateUnit: savedModel.unit || 'unknown',
                unitVerified: Boolean(savedModel.unitVerified),
                verificationStatus: 'unverified',
                validationNotes: 'Manually placed point; anatomical identity is unverified.',
              };
              apiClient.createLandmark(activeCase.id, landmarkPayload).then((result) => {
                if (!result.data) {
                  setMeshError(result.error || 'The landmark could not be saved.');
                  return;
                }
                const next = [...(activeCase.landmarks || []), result.data];
                onUpdateCaseLandmarks?.(next);
                caseStorage.updateCase(activeCase.id, { landmarks: next });
                setLandmarkMode(false);
                setLandmarkName('');
              });
            }}
            onUnitScaleChange={(unit) => {
              if (!savedModel) return;
              persistCase({
                meshes: activeCase?.meshes.map((mesh) => mesh.id === savedModel.id
                  ? { ...mesh, unit, unitVerified: unit !== 'unknown' }
                  : mesh) || [],
              });
            }}
            onMeasurement={(points) => {
              if (!savedModel || !activeCase) return;
              const measurement: SavedMeasurement = {
                id: crypto.randomUUID(),
                caseId: activeCase.id,
                modelId: savedModel.id,
                modelVersion: savedModel.version || 1,
                pointA: points.pointA,
                pointB: points.pointB,
                rawDistance: points.distance,
                displayUnit: savedModel.unit || 'unknown',
                scaleVerified: Boolean(savedModel.unitVerified),
                type: 'point_to_point',
                provenance: 'manual',
                createdAt: new Date().toISOString(),
              };
              apiClient.createMeasurement(activeCase.id, {
                type: 'point_to_point',
                modelId: measurement.modelId,
                modelVersion: measurement.modelVersion,
                pointA: measurement.pointA,
                pointB: measurement.pointB,
                displayUnit: measurement.displayUnit,
              }).then((result) => {
                if (!result.data) {
                  setMeshError(result.error || 'The measurement could not be saved.');
                  return;
                }
                const existing = activeCase.measurements?.manualMeasurements || [];
                persistCase({ measurements: { ...(activeCase.measurements || {}), manualMeasurements: [...existing, result.data] } as ResearchCase['measurements'] });
              });
            }}
            onMeshLoaded={async (info, file) => {
              setCustomMeshInfo(info);
              setCustomMeshFile(file);
              setMeshError(null);
              setActiveTab('geometry');
              if (restoringModel.current) {
                restoringModel.current = false;
                return;
              }
              if (!activeCase || activeCase.isDemo) {
                setMeshError('Select a saved patient case before importing a model.');
                return;
              }
              const upload = await apiClient.uploadModel(activeCase.id, file.file, {
                vertexCount: info.vertexCount,
                triangleCount: info.faceCount,
                boundingBox: { x: info.boundingBox.dimensions[0], y: info.boundingBox.dimensions[1], z: info.boundingBox.dimensions[2] },
                surfaceArea: info.surfaceArea,
                qualityChecks: info.qualityChecks,
                validationStatus: info.validationStatus,
              });
              if (upload.data) {
                const nextPreferences = {
                  ...viewerPreferences,
                  selectedModelId: upload.data.model.id,
                };
                const preferenceSave = await apiClient.updateCase(activeCase.id, {
                  viewerPreferences: nextPreferences,
                });
                if (!preferenceSave.data) {
                  setSaveStatus('failed');
                  setMeshError(preferenceSave.error || 'The selected model could not be persisted.');
                  return;
                }
                setViewerPreferences(nextPreferences);
                caseStorage.updateCase(activeCase.id, {
                  meshes: [...(activeCase.meshes || []), upload.data.model],
                  viewerPreferences: nextPreferences,
                });
                setSaveStatus('saved');
              } else {
                setSaveStatus('failed');
                setMeshError(upload.error || 'The model could not be saved.');
              }
            }}
            onMeshError={setMeshError}
            onMeshRemoved={() => {
              setCustomMeshInfo(null);
              setCustomMeshFile(null);
              setCustomMeshBuffer(null);
              if (activeCase && savedModel) {
                apiClient.deleteModel(activeCase.id, savedModel.id).then((result) => {
                  if (result.status === 204) {
                    caseStorage.updateCase(activeCase.id, {
                      meshes: activeCase.meshes.filter((mesh) => mesh.id !== savedModel.id),
                      landmarks: activeCase.landmarks.filter((landmark) => landmark.modelId !== savedModel.id),
                      measurements: activeCase.measurements
                        ? {
                            ...activeCase.measurements,
                            manualMeasurements: activeCase.measurements.manualMeasurements?.filter(
                              (measurement) => measurement.modelId !== savedModel.id,
                            ),
                          }
                        : activeCase.measurements,
                    });
                    setSaveStatus('saved');
                  } else {
                    setSaveStatus('failed');
                    setMeshError(result.error || 'The model could not be removed from the case.');
                  }
                });
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};
