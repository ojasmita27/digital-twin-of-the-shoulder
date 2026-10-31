/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { ResearchCase, ImplantPlanningConfig, MeshArtifact, ImplantAsset, ImplantReferencePoint, PlanningMeasurement } from '../../types/case';
import { SceneMeasurementOverlay, ShoulderScene } from '../three/ShoulderScene';
import { apiClient } from '../../services/apiClient';
import { caseStorage } from '../../services/caseStorage';
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
  const patientModel = [...(activeCase?.meshes || [])].reverse().find((mesh) => !mesh.isDemoMesh) as MeshArtifact | undefined;
  const [patientBuffer, setPatientBuffer] = useState<ArrayBuffer | null>(null);
  const [implantBuffer, setImplantBuffer] = useState<ArrayBuffer | null>(null);
  const [implantAsset, setImplantAsset] = useState<ImplantAsset | null>(null);
  const [showBone, setShowBone] = useState(true);
  const [showImplant, setShowImplant] = useState(true);
  const [translation, setTranslation] = useState<[number, number, number]>(existingPlan?.implantTransform?.translation || [0, 0, 0]);
  const [rotationDeg, setRotationDeg] = useState<[number, number, number]>(existingPlan?.implantTransform?.rotationDeg || [0, 0, 0]);
  const [savedTransform, setSavedTransform] = useState({
    translation: existingPlan?.implantTransform?.translation || [0, 0, 0] as [number, number, number],
    rotationDeg: existingPlan?.implantTransform?.rotationDeg || [0, 0, 0] as [number, number, number],
  });
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate');
  const [gizmoEnabled, setGizmoEnabled] = useState(false);
  const [referencePoints, setReferencePoints] = useState<ImplantReferencePoint[]>(activeCase?.implantReferencePoints || []);
  const [selectedReferencePointId, setSelectedReferencePointId] = useState<string | null>(null);
  const [referencePointMode, setReferencePointMode] = useState(false);
  const [showReferencePoints, setShowReferencePoints] = useState(true);
  const [planningMeasurements, setPlanningMeasurements] = useState<PlanningMeasurement[]>([]);
  const [measurementType, setMeasurementType] = useState<'point_to_point' | 'angle'>('point_to_point');
  const [measurementPoints, setMeasurementPoints] = useState<string[]>(['', '']);
  const [measurementName, setMeasurementName] = useState('');
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [showMeasurementOverlays, setShowMeasurementOverlays] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(null);
  const validLandmarks = (activeCase?.landmarks || []).filter((landmark) => (
    patientModel && landmark.modelId === patientModel.id && landmark.modelVersion === (patientModel.version || 1)
  ));
  const selectedLandmark = validLandmarks.find((landmark) => landmark.id === selectedLandmarkId);
  const implantDistance = selectedLandmark
    ? Math.sqrt(selectedLandmark.coordinatesMm.reduce((sum, value, index) => {
      const delta = value - translation[index];
      return sum + delta * delta;
    }, 0))
    : null;

  useEffect(() => {
    const nextTranslation = existingPlan?.implantTransform?.translation || [0, 0, 0] as [number, number, number];
    const nextRotation = existingPlan?.implantTransform?.rotationDeg || [0, 0, 0] as [number, number, number];
    setTranslation(nextTranslation);
    setRotationDeg(nextRotation);
    setSavedTransform({ translation: nextTranslation, rotationDeg: nextRotation });
    setReferencePoints(activeCase?.implantReferencePoints || []);
    setSelectedReferencePointId(null);
    setDirty(false);
  }, [activeCase?.id, existingPlan?.implantAssetId, existingPlan?.implantTransform?.translation, existingPlan?.implantTransform?.rotationDeg]);

  useEffect(() => {
    if (!activeCase) return;
    apiClient.listImplantReferencePoints(activeCase.id).then((result) => {
      if (result.data) setReferencePoints(result.data);
    });
  }, [activeCase?.id]);

  useEffect(() => {
    if (!activeCase) {
      setPlanningMeasurements([]);
      return;
    }
    apiClient.listPlanningMeasurements(activeCase.id).then((result) => {
      if (result.data) setPlanningMeasurements(result.data);
      else setError(result.error || 'Saved planning measurements could not be loaded.');
    });
  }, [activeCase?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!activeCase || !patientModel) {
      setPatientBuffer(null);
      return;
    }
    apiClient.downloadModel(activeCase.id, patientModel.id).then((result) => {
      if (!cancelled) {
        if (result.data) setPatientBuffer(result.data);
        else setError(result.error || 'The patient model could not be loaded.');
      }
    });
    return () => { cancelled = true; };
  }, [activeCase?.id, patientModel?.id]);

  useEffect(() => {
    let cancelled = false;
    const savedAsset = activeCase?.implantAssets?.find((asset) => asset.id === existingPlan?.implantAssetId) || null;
    setImplantAsset(savedAsset);
    if (!activeCase || !savedAsset) {
      setImplantBuffer(null);
      return;
    }
    apiClient.downloadImplant(activeCase.id, savedAsset.id).then((result) => {
      if (!cancelled) {
        if (result.data) setImplantBuffer(result.data);
        else setError(result.error || 'The saved implant asset could not be loaded.');
      }
    });
    return () => { cancelled = true; };
  }, [activeCase?.id, existingPlan?.implantAssetId]);

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
    existingPlan?.notes || ''
  );

  const handleSavePlan = async () => {
    if (!activeCase || !patientModel || !implantAsset) {
      setError('Load a saved patient model and implant asset before saving planning data.');
      return;
    }
    const updatedPlan: ImplantPlanningConfig = {
      patientModelId: patientModel.id,
      patientModelVersion: patientModel.version || 1,
      implantAssetId: implantAsset.id,
      implantAssetVersion: implantAsset.version,
      implantTransform: {
        translation,
        rotationDeg,
        coordinateUnit: patientModel.unit || 'unknown',
        unitVerified: Boolean(patientModel.unitVerified),
      },
      ...(selectedLandmark && implantDistance !== null ? {
        implantMeasurement: {
          landmarkId: selectedLandmark.id,
          reference: 'implant_origin' as const,
          distance: implantDistance,
          displayUnit: patientModel.unit || 'unknown',
        },
      } : {}),
      planningStatus: 'saved',
      procedureType,
      glenoidComponent: {
        system: 'Orthopedic Research Modular System (RMS)',
        type: 'baseplate_glenosphere',
        sizeMm: glenosphereSize,
        lateralizationMm,
        inferiorTiltDeg,
        versionCorrectionDeg: 6,
        implantOffsetMm: [0, 0, 0],
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
    const result = await apiClient.saveImplantPlanning(activeCase.id, updatedPlan as unknown as Record<string, unknown>);
    if (!result.data) {
      setError(result.error || 'Planning state could not be saved.');
      return;
    }
    onUpdatePlan?.(result.data);
    caseStorage.updateCase(activeCase.id, { implantPlan: result.data });
    setSavedTransform({ translation, rotationDeg });
    setDirty(false);
    setStatus('Planning state saved.');
  };

  const updateVector = (setter: React.Dispatch<React.SetStateAction<[number, number, number]>>, index: number, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setter((current) => current.map((item, itemIndex) => itemIndex === index ? parsed : item) as [number, number, number]);
    setDirty(true);
  };

  const resetTransform = () => {
    setTranslation([0, 0, 0]);
    setRotationDeg([0, 0, 0]);
    setDirty(true);
  };

  const cancelTransform = () => {
    setTranslation(savedTransform.translation);
    setRotationDeg(savedTransform.rotationDeg);
    setDirty(false);
    setStatus('Unsaved transform changes discarded.');
  };

  const worldToImplantLocal = (point: [number, number, number]): [number, number, number] => {
    let [x, y, z] = point.map((value, index) => value - translation[index]) as [number, number, number];
    const [rx, ry, rz] = rotationDeg.map((value) => value * Math.PI / 180);
    [x, y] = [x * Math.cos(rz) + y * Math.sin(rz), -x * Math.sin(rz) + y * Math.cos(rz)];
    [x, z] = [x * Math.cos(ry) - z * Math.sin(ry), x * Math.sin(ry) + z * Math.cos(ry)];
    [y, z] = [y * Math.cos(rx) + z * Math.sin(rx), -y * Math.sin(rx) + z * Math.cos(rx)];
    return [x, y, z];
  };

  const localToWorld = (point: [number, number, number]): [number, number, number] => {
    const vector = new THREE.Vector3(...point);
    vector.applyEuler(new THREE.Euler(...rotationDeg.map((value) => value * Math.PI / 180) as [number, number, number]));
    vector.add(new THREE.Vector3(...translation));
    return vector.toArray() as [number, number, number];
  };

  const pointOptions = [
    ...validLandmarks.map((landmark) => ({ value: `landmark:${landmark.id}`, label: `Landmark · ${landmark.name}` })),
    ...referencePoints.filter((point) => point.implantAssetId === implantAsset?.id).map((point) => ({ value: `implant_reference:${point.id}`, label: `Implant · ${point.name}` })),
  ];

  const resolvePoint = (value: string): [number, number, number] | null => {
    const [kind, id] = value.split(':');
    if (kind === 'landmark') {
      return validLandmarks.find((landmark) => landmark.id === id)?.coordinatesMm || null;
    }
    if (kind === 'implant_reference') {
      const point = referencePoints.find((item) => item.id === id);
      return point ? localToWorld(point.coordinatesLocal) : null;
    }
    return null;
  };

  const measurementUnitFactor = (from: string, to: string): number => {
    const toMm: Record<string, number> = { unknown: 1, mm: 1, cm: 10, in: 25.4 };
    return (toMm[from] || 1) / (toMm[to] || 1);
  };

  const measurementGeometry = (points: [number, number, number][]) => {
    const first = new THREE.Vector3(...points[0]);
    const second = new THREE.Vector3(...points[1]);
    const distance = first.distanceTo(second);
    if (points.length !== 3) return { value: distance, unit: patientModel?.unit || 'unknown' as const };
    const third = new THREE.Vector3(...points[2]);
    const ba = first.clone().sub(second).normalize();
    const bc = third.clone().sub(second).normalize();
    return {
      value: THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, ba.dot(bc))))),
      unit: 'unknown' as const,
    };
  };

  const isMeasurementStale = (measurement: PlanningMeasurement): boolean => (
    measurement.modelId !== patientModel?.id ||
    measurement.modelVersion !== (patientModel?.version || 1) ||
    measurement.pointRefs?.some((ref) => ref.kind === 'landmark' && !validLandmarks.some((landmark) => landmark.id === ref.id)) ||
    measurement.pointRefs?.some((ref) => ref.kind === 'implant_reference' && !referencePoints.some((point) => point.id === ref.id))
  );

  const measurementOverlays: SceneMeasurementOverlay[] = planningMeasurements.flatMap((measurement) => {
    if (!measurement.pointRefs) return [];
    const points = measurement.pointRefs.map((ref) => resolvePoint(`${ref.kind}:${ref.id}`));
    if (points.some((point) => !point)) return [];
    const geometry = measurementGeometry(points as [number, number, number][]);
    const currentValue = measurement.type === 'angle'
      ? geometry.value
      : geometry.value * measurementUnitFactor(patientModel?.unit || 'unknown', measurement.displayUnit);
    return [{
      id: measurement.id,
      points: points as [number, number, number][],
      label: measurement.label || measurement.type,
      value: currentValue,
      unit: measurement.displayUnit,
      selected: measurement.id === selectedMeasurementId,
    }];
  });

  const createPlanningMeasurement = async () => {
    if (!activeCase || !patientModel) return;
    const expectedCount = measurementType === 'angle' ? 3 : 2;
    if (measurementPoints.length !== expectedCount || measurementPoints.some((point) => !point)) {
      setError(`${measurementType === 'angle' ? 'Angle' : 'Distance'} requires ${expectedCount} valid point selections.`);
      return;
    }
    const pointRefs = measurementPoints.map((value) => {
      const separator = value.indexOf(':');
      return { kind: value.slice(0, separator) as 'landmark' | 'implant_reference', id: value.slice(separator + 1) };
    });
    const result = await apiClient.createPlanningMeasurement(activeCase.id, {
      type: measurementType,
      modelId: patientModel.id,
      modelVersion: patientModel.version || 1,
      pointRefs,
      implantAssetId: pointRefs.some((ref) => ref.kind === 'implant_reference') ? implantAsset?.id : undefined,
      displayUnit: patientModel.unit || 'unknown',
      label: measurementName.trim() || undefined,
    });
    if (!result.data) {
      setError(result.error || 'The planning measurement could not be saved.');
      return;
    }
    setPlanningMeasurements((items) => [...items, result.data as PlanningMeasurement]);
    setSelectedMeasurementId(result.data.id);
    setMeasurementPoints(Array(expectedCount).fill(''));
    setMeasurementName('');
    setStatus('Planning measurement saved.');
  };

  const handleImplantReferencePoint = async (worldPoint: [number, number, number]) => {
    if (!activeCase || !implantAsset) return;
    const name = window.prompt('Name this implant reference point');
    if (!name?.trim()) return;
    const result = await apiClient.createImplantReferencePoint(activeCase.id, {
      implantAssetId: implantAsset.id,
      implantAssetVersion: implantAsset.version,
      name: name.trim(),
      coordinatesLocal: worldToImplantLocal(worldPoint),
      coordinateUnit: patientModel?.unit || 'unknown',
      unitVerified: Boolean(patientModel?.unitVerified),
    });
    if (!result.data) {
      setError(result.error || 'The implant reference point could not be saved.');
      return;
    }
    setReferencePoints((points) => [...points, result.data as ImplantReferencePoint]);
    setReferencePointMode(false);
    setStatus('Implant reference point saved.');
  };

  const deleteReferencePoint = async () => {
    if (!activeCase || !selectedReferencePointId) return;
    const result = await apiClient.deleteImplantReferencePoint(activeCase.id, selectedReferencePointId);
    if (!result.data) {
      setError(result.error || 'The implant reference point could not be deleted.');
      return;
    }
    setReferencePoints((points) => points.filter((point) => point.id !== selectedReferencePointId));
    setSelectedReferencePointId(null);
  };

  const renameReferencePoint = async () => {
    if (!activeCase || !selectedReferencePointId) return;
    const current = referencePoints.find((point) => point.id === selectedReferencePointId);
    const name = window.prompt('Rename implant reference point', current?.name || '');
    if (!name?.trim()) return;
    const result = await apiClient.updateImplantReferencePoint(activeCase.id, selectedReferencePointId, { name: name.trim() });
    if (!result.data) {
      setError(result.error || 'The implant reference point could not be renamed.');
      return;
    }
    setReferencePoints((points) => points.map((point) => point.id === result.data?.id ? result.data : point));
  };

  const handleImplantImport = async (file: File) => {
    if (!activeCase) return;
    setError(null);
    const result = await apiClient.uploadImplant(activeCase.id, file, { unit: patientModel?.unit || 'unknown', unitVerified: false });
    if (!result.data) {
      setError(result.error || 'The implant could not be uploaded.');
      return;
    }
    setImplantAsset(result.data.implant);
    setImplantBuffer(await file.arrayBuffer());
    caseStorage.updateCase(activeCase.id, { implantAssets: [...(activeCase.implantAssets || []), result.data.implant] });
    setStatus('Implant asset loaded. Position is unsaved.');
    setDirty(true);
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-teal-700 dark:text-cyan-400 font-semibold">
              Prosthetic Virtual Placement
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {activeCase ? activeCase.id : 'No Case Selected'}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Arthroplasty Preoperative Planning
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Simulated implant positioning, baseplate lateralization, and glenosphere inferior tilt planning.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-md shadow-xs">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span className="text-slate-500 dark:text-slate-400">Status:</span>
          <span className="text-amber-700 dark:text-amber-300 font-medium">Geometric Simulation Only</span>
        </div>
      </div>

      {/* Main Grid: Parameters Control Column (Left) + Interactive 3D Implant Viewport (Right 2 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Surgical Parameters */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 shadow-xs transition-colors">
          <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
            Arthroplasty Specification
          </h3>

          {!patientModel && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              A saved patient-specific model is required. The procedural demo model is not used for planning.
            </div>
          )}
          {existingPlan?.patientModelId && patientModel && (
            existingPlan.patientModelId !== patientModel.id || existingPlan.patientModelVersion !== (patientModel.version || 1)
          ) && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Saved planning data is stale because the patient model changed.
            </div>
          )}

          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <span className="text-[11px] font-mono text-teal-700 dark:text-cyan-400 font-semibold uppercase block">
              Patient Mesh & Implant Asset
            </span>
            <div className="text-[11px] text-slate-500">
              Patient model: {patientModel ? `${patientModel.filename} · v${patientModel.version || 1} · ${patientModel.unit || 'unknown'}` : 'not loaded'}
            </div>
            <input
              type="file"
              accept=".stl,.obj,.ply"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImplantImport(file);
                event.currentTarget.value = '';
              }}
              className="w-full text-xs"
            />
            <div className="text-[11px] text-slate-500">
              Implant: {implantAsset ? `${implantAsset.filename} · ${implantAsset.unit}` : 'not loaded'}
            </div>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => setShowBone((value) => !value)} className="rounded border px-2 py-1">
                {showBone ? 'Hide bone' : 'Show bone'}
              </button>
              <button type="button" onClick={() => setShowImplant((value) => !value)} className="rounded border px-2 py-1">
                {showImplant ? 'Hide implant' : 'Show implant'}
              </button>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <span className="text-[11px] font-mono text-teal-700 dark:text-cyan-400 font-semibold uppercase block">
              Implant Transform · patient coordinates
            </span>
            {(['Translation', 'Rotation (deg)'] as const).map((label, vectorIndex) => {
              const values = vectorIndex === 0 ? translation : rotationDeg;
              const setter = vectorIndex === 0 ? setTranslation : setRotationDeg;
              return (
                <div key={label}>
                  <div className="text-[11px] text-slate-500 mb-1">{label}</div>
                  <div className="grid grid-cols-3 gap-1">
                    {values.map((value, index) => (
                      <input
                        key={`${label}-${index}`}
                        type="number"
                        step="0.1"
                        value={value}
                        onChange={(event) => updateVector(setter, index, event.target.value)}
                        className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
                        aria-label={`${label} ${['X', 'Y', 'Z'][index]}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="flex gap-2">
              <button type="button" onClick={resetTransform} className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700">Reset transform</button>
              <button type="button" onClick={() => setStatus('Draft transform applied to the viewport. Save to persist it.')} className="rounded border border-teal-300 px-2 py-1 text-xs text-teal-700">Apply</button>
              <button type="button" onClick={cancelTransform} disabled={!dirty} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Cancel</button>
              {dirty && <span className="text-[11px] text-amber-700 self-center">Unsaved changes</span>}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" onClick={() => setTransformMode('translate')} className={`rounded border px-2 py-1 ${transformMode === 'translate' ? 'bg-teal-100 text-teal-800' : ''}`}>Translate gizmo</button>
              <button type="button" onClick={() => setTransformMode('rotate')} className={`rounded border px-2 py-1 ${transformMode === 'rotate' ? 'bg-teal-100 text-teal-800' : ''}`}>Rotate gizmo</button>
              <button type="button" onClick={() => setGizmoEnabled((value) => !value)} className="rounded border px-2 py-1">{gizmoEnabled ? 'Hide gizmo' : 'Show gizmo'}</button>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <span className="text-[11px] font-mono text-teal-700 dark:text-cyan-400 font-semibold uppercase block">
              Landmark reference inspection
            </span>
            <select
              value={selectedLandmarkId || ''}
              onChange={(event) => setSelectedLandmarkId(event.target.value || null)}
              className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
            >
              <option value="">Select a valid landmark</option>
              {validLandmarks.map((landmark) => <option key={landmark.id} value={landmark.id}>{landmark.name}</option>)}
            </select>
            {implantDistance !== null && (
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                Implant origin to {selectedLandmark?.name}: <strong>{implantDistance.toFixed(3)} {patientModel?.unit || 'unknown'}</strong>
                <div className="text-[10px] text-slate-500">Geometric inspection only; implant origin is the imported mesh local origin transformed into patient coordinates.</div>
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                <span className="text-[11px] font-mono text-purple-700 dark:text-purple-300 font-semibold uppercase block">
                  Implant reference points · local implant coordinates
                </span>
                <div className="flex gap-2">
                  <button type="button" disabled={!implantAsset} onClick={() => setReferencePointMode((value) => !value)} className="rounded border px-2 py-1 text-xs disabled:opacity-40">
                    {referencePointMode ? 'Click implant surface…' : 'Add reference point'}
                  </button>
                  <button type="button" onClick={() => setShowReferencePoints((value) => !value)} className="rounded border px-2 py-1 text-xs">
                    {showReferencePoints ? 'Hide points' : 'Show points'}
                  </button>
                  <button type="button" disabled={!selectedReferencePointId} onClick={() => void renameReferencePoint()} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Rename</button>
                  <button type="button" disabled={!selectedReferencePointId} onClick={() => void deleteReferencePoint()} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-40">Delete</button>
                </div>
                <select value={selectedReferencePointId || ''} onChange={(event) => setSelectedReferencePointId(event.target.value || null)} className="w-full rounded border px-2 py-1 text-xs">
                  <option value="">Select a reference point</option>
                  {referencePoints.filter((point) => point.implantAssetId === implantAsset?.id).map((point) => (
                    <option key={point.id} value={point.id}>{point.name}</option>
                  ))}
                </select>
                <div className="text-[10px] text-slate-500">Points are manually selected on the imported implant surface. They have no automatic clinical meaning.                </div>
              </div>

              <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                <span className="text-[11px] font-mono text-teal-700 dark:text-cyan-400 font-semibold uppercase block">
                  Spatial measurements
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={measurementType}
                    onChange={(event) => {
                      const next = event.target.value as 'point_to_point' | 'angle';
                      setMeasurementType(next);
                      setMeasurementPoints(Array(next === 'angle' ? 3 : 2).fill(''));
                    }}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    <option value="point_to_point">Distance</option>
                    <option value="angle">Angle (A-B-C)</option>
                  </select>
                  <input
                    value={measurementName}
                    onChange={(event) => setMeasurementName(event.target.value)}
                    placeholder="Measurement name"
                    className="rounded border px-2 py-1 text-xs"
                  />
                </div>
                {measurementPoints.map((point, index) => (
                  <select
                    key={`${measurementType}-${index}`}
                    value={point}
                    onChange={(event) => setMeasurementPoints((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                    className="w-full rounded border px-2 py-1 text-xs"
                  >
                    <option value="">{measurementType === 'angle' ? `Point ${String.fromCharCode(65 + index)}` : `Point ${index + 1}`}</option>
                    {pointOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ))}
                <div className="flex gap-2">
                  <button type="button" onClick={() => void createPlanningMeasurement()} className="rounded border border-teal-300 px-2 py-1 text-xs text-teal-700">Calculate & save</button>
                  <button type="button" onClick={() => setShowMeasurementOverlays((value) => !value)} className="rounded border px-2 py-1 text-xs">
                    {showMeasurementOverlays ? 'Hide overlays' : 'Show overlays'}
                  </button>
                </div>
                <select
                  value={selectedMeasurementId || ''}
                  onChange={(event) => setSelectedMeasurementId(event.target.value || null)}
                  className="w-full rounded border px-2 py-1 text-xs"
                >
                  <option value="">Select saved measurement</option>
                  {planningMeasurements.map((measurement) => (
                    <option key={measurement.id} value={measurement.id}>
                      {isMeasurementStale(measurement) ? '[stale] ' : ''}{measurement.label || measurement.type} · {measurement.type === 'angle' ? `${(measurement.angleDegrees || 0).toFixed(2)}°` : `${(measurement.displayDistance || measurement.rawDistance).toFixed(2)} ${measurement.displayUnit}`}
                    </option>
                  ))}
                </select>
                {planningMeasurements.some(isMeasurementStale) && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300">
                    Some saved measurements are stale because their patient model or referenced point changed. They are not shown as valid overlays.
                  </div>
                )}
                {selectedMeasurementId && measurementOverlays.find((measurement) => measurement.id === selectedMeasurementId) && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    {(() => {
                      const selected = measurementOverlays.find((measurement) => measurement.id === selectedMeasurementId);
                      return selected ? `${selected.label}: ${selected.value.toFixed(3)} ${selected.unit === 'unknown' ? 'unverified units' : selected.unit}${selected.points.length === 3 ? ' (angle)' : ''}` : null;
                    })()}
                    <div>Selected overlay is highlighted in the viewport. Values are geometric and not clinically validated.</div>
                  </div>
                )}
              </div>

              {/* Procedure Type */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Surgical Reconstruction
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setProcedureType('reverse_tsa')}
                className={`py-2 px-2.5 rounded-md text-center font-medium transition-colors ${
                  procedureType === 'reverse_tsa'
                    ? 'bg-teal-50 dark:bg-cyan-500/20 text-teal-800 dark:text-cyan-300 border border-teal-200 dark:border-cyan-500/50 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Reverse TSA (rTSA)
              </button>
              <button
                type="button"
                onClick={() => setProcedureType('anatomic_tsa')}
                className={`py-2 px-2.5 rounded-md text-center font-medium transition-colors ${
                  procedureType === 'anatomic_tsa'
                    ? 'bg-teal-50 dark:bg-cyan-500/20 text-teal-800 dark:text-cyan-300 border border-teal-200 dark:border-cyan-500/50 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Anatomic TSA (aTSA)
              </button>
            </div>
          </div>

          {/* Glenoid Component Configuration */}
          <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
            <span className="text-[11px] font-mono text-teal-700 dark:text-cyan-400 font-semibold uppercase block">
              Glenoid Baseplate & Glenosphere
            </span>

            {/* Glenosphere Diameter */}
            <div>
              <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 mb-1">
                <span>Glenosphere Diameter</span>
                <span className="font-mono text-teal-700 dark:text-cyan-400 font-semibold">{glenosphereSize} mm</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[36, 39, 42].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setGlenosphereSize(size)}
                    className={`py-1 rounded text-xs font-mono transition-colors ${
                      glenosphereSize === size
                        ? 'bg-teal-50 dark:bg-slate-800 text-teal-900 dark:text-slate-100 border border-teal-300 dark:border-cyan-500/40'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {size} mm
                  </button>
                ))}
              </div>
            </div>

            {/* Baseplate Lateralization */}
            <div>
              <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 mb-1">
                <span>Baseplate Lateralization</span>
                <span className="font-mono text-teal-700 dark:text-cyan-400 font-semibold">{lateralizationMm} mm</span>
              </div>
              <input
                type="range"
                min="0"
                max="8"
                step="1"
                value={lateralizationMm}
                onChange={(e) => setLateralizationMm(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                <span>0 mm (Standard)</span>
                <span>+4 mm (BIO-RSA)</span>
                <span>+8 mm</span>
              </div>
            </div>

            {/* Inferior Tilt */}
            <div>
              <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 mb-1">
                <span>Inferior Tilt Angle</span>
                <span className="font-mono text-teal-700 dark:text-cyan-400 font-semibold">{inferiorTiltDeg}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={inferiorTiltDeg}
                onChange={(e) => setInferiorTiltDeg(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Recommended 5° inferior tilt to minimize scapular notching.
              </span>
            </div>
          </div>

          {/* Humeral Component Configuration */}
          <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
            <span className="text-[11px] font-mono text-teal-700 dark:text-cyan-400 font-semibold uppercase block">
              Humeral Stem & Socket
            </span>

            {/* Stem Neck-Shaft Angle */}
            <div>
              <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 mb-1">
                <span>Neck-Shaft Inclination</span>
                <span className="font-mono text-teal-700 dark:text-cyan-400 font-semibold">{stemInclination}°</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[135, 145, 155].map((angle) => (
                  <button
                    key={angle}
                    type="button"
                    onClick={() => setStemInclination(angle)}
                    className={`py-1 rounded text-xs font-mono transition-colors ${
                      stemInclination === angle
                        ? 'bg-teal-50 dark:bg-slate-800 text-teal-900 dark:text-slate-100 border border-teal-300 dark:border-cyan-500/40'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {angle}°
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Planning Rationale & Observations
            </label>
            <textarea
              rows={2}
              value={surgeonNotes}
              onChange={(e) => setSurgeonNotes(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded p-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-teal-500 dark:focus:border-cyan-500"
            />
          </div>

          <button
            onClick={handleSavePlan}
            className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white dark:bg-cyan-400 dark:hover:bg-cyan-300 dark:text-slate-950 font-semibold text-xs rounded-md shadow-xs transition-colors"
          >
            Update & Save Virtual Plan
          </button>
        </div>

        {/* Right 2 Columns: 3D Viewport with Implants Enabled */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="h-[480px]">
            <ShoulderScene
              customStlBuffer={patientBuffer}
              customModelName={patientModel?.filename || 'patient-model.stl'}
              landmarks={activeCase?.landmarks}
              implantBuffer={implantBuffer}
              implantModelName={implantAsset?.filename || 'implant.stl'}
              implantTransform={{ translation, rotationDeg }}
              implantTransformMode={transformMode}
              implantGizmoEnabled={gizmoEnabled}
              onImplantTransformChange={(next) => {
                setTranslation(next.translation);
                setRotationDeg(next.rotationDeg);
                setDirty(true);
              }}
              implantReferenceMode={referencePointMode}
              onImplantReferencePoint={(point) => void handleImplantReferencePoint(point)}
              implantReferencePoints={referencePoints}
              selectedImplantReferencePointId={selectedReferencePointId}
              showImplantReferencePoints={showReferencePoints}
              onSelectImplantReferencePoint={(point) => setSelectedReferencePointId(point?.id || null)}
              measurementOverlays={measurementOverlays}
              showMeasurementOverlays={showMeasurementOverlays}
              showBone={showBone}
              showImplant={showImplant}
              onImplantError={setError}
            />
          </div>
          {(error || status) && (
            <div className={`rounded border p-2 text-xs ${error ? 'border-rose-300 text-rose-700' : 'border-emerald-300 text-emerald-700'}`}>
              {error || status}
            </div>
          )}

          {/* Clinical Simulation Disclaimer */}
          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-400 space-y-1 shadow-xs transition-colors">
            <div className="text-slate-900 dark:text-slate-200 font-semibold flex items-center gap-1.5">
              <Info className="w-4 h-4 text-teal-600 dark:text-cyan-400" />
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
