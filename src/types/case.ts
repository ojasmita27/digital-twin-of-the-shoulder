/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CaseStatus =
  | 'created'
  | 'imaging_imported'
  | 'imaging_validated'
  | 'segmentation_queued'
  | 'segmentation_completed'
  | 'models_generated'
  | 'measurements_computed'
  | 'planning_in_progress'
  | 'report_finalized';

export type AnatomicalSide = 'left' | 'right';

export interface PatientDemographics {
  // Non-identifying research metadata only
  researchSubjectId: string;
  ageBand: '18-40' | '41-60' | '61-75' | '75+';
  biologicalSex: 'female' | 'male' | 'undisclosed';
  indication: 'Primary Osteoarthritis' | 'Rotator Cuff Tear Arthropathy' | 'Proximal Humerus Fracture' | 'Avascular Necrosis' | 'Revision Arthroplasty' | 'Research Normative';
  affectedSide: AnatomicalSide;
}

export interface CTSliceMetadata {
  modality: 'CT' | string;
  seriesInstanceUid: string;
  studyInstanceUid: string;
  sliceThicknessMm: number;
  pixelSpacingMm: [number, number];
  rows: number;
  columns: number;
  sliceCount: number;
  kvp?: number;
  tubeCurrentMa?: number;
  gantryTiltDeg?: number;
  reconstructionKernel: string;
  windowCenter: number;
  windowWidth: number;
  acquisitionDate?: string;
  isVolumetricSeries?: boolean;
  reconstructionReadiness?: string;
  reconstructionMessage?: string;
  primaryPreviewUrl?: string;
  sourceFiles?: string[];
  slicePreviewUrls?: string[];
  processingStatus?: string;
  segmentationPreviewAvailable?: boolean;
  fileCount?: number;
  uploadedFiles?: string[];
  sliceLocation?: number;
  instanceNumber?: number;
}

export interface AnatomicalLandmark {
  id: string;
  name: string;
  structure: 'scapula' | 'humerus' | 'clavicle';
  coordinatesMm: [number, number, number]; // [X, Y, Z] in patient coordinate system
  provenance: 'computed_geometric' | 'manual_annotated' | 'ai_inferred_prototype';
  confidenceScore?: number; // 0.0 - 1.0
  validationNotes?: string;
  modelId?: string;
  modelVersion?: number;
  coordinateUnit?: 'unknown' | 'mm' | 'cm' | 'in';
  unitVerified?: boolean;
  verificationStatus?: 'unverified' | 'verified';
  createdAt?: string;
  updatedAt?: string;
}

export interface SavedMeasurement {
  id: string;
  caseId: string;
  modelId: string;
  modelVersion: number;
  pointA: [number, number, number];
  pointB: [number, number, number];
  rawDistance: number;
  displayDistance?: number;
  displayUnit: 'unknown' | 'mm' | 'cm' | 'in';
  scaleVerified: boolean;
  type: 'point_to_point' | 'angle';
  pointC?: [number, number, number];
  angleDegrees?: number;
  provenance: 'manual' | 'computed';
  label?: string;
  notes?: string;
  createdAt: string;
  pointRefs?: Array<{ kind: 'landmark' | 'implant_reference'; id: string }>;
  implantAssetId?: string;
  stale?: boolean;
}

export interface PlanningMeasurement extends SavedMeasurement {
  pointRefs: Array<{ kind: 'landmark' | 'implant_reference'; id: string }>;
  implantAssetId?: string;
}

export interface MorphometricMeasurements {
  // Glenoid Measurements
  glenoidVersionDeg: number; // Positive = anteversion, negative = retroversion (Friedman axis)
  glenoidInclinationDeg: number; // Beta angle relative to supraspinatus fossa line
  glenoidHeightMm: number; // Superior-Inferior diameter
  glenoidWidthMm: number; // Anterior-Posterior diameter
  glenoidSubchondralDepthMm: number;
  walchClassification?: 'A1' | 'A2' | 'B1' | 'B2' | 'B3' | 'C' | 'D';

  // Humerus Measurements
  humeralHeadDiameterMm: number;
  humeralNeckShaftAngleDeg: number; // Anatomical normal ~130-140 deg
  humeralRetroversionDeg: number;
  humeralHeadOffsetMm: number;

  calculationAlgorithm: string;
  validationStatus: 'provisional_unvalidated' | 'benchmark_verified' | 'peer_reviewed';
  manualMeasurements?: SavedMeasurement[];
}

export interface ImplantPlanningConfig {
  patientModelId?: string;
  patientModelVersion?: number;
  implantAssetId?: string;
  implantAssetVersion?: number;
  implantTransform?: {
    translation: [number, number, number];
    rotationDeg: [number, number, number];
    coordinateUnit: 'unknown' | 'mm' | 'cm' | 'in';
    unitVerified: boolean;
  };
  planningStatus?: 'unsaved' | 'saved' | 'stale';
  planName?: string;
  analysis?: ImplantSpatialAnalysis;
  implantMeasurement?: {
    landmarkId: string;
    reference: 'implant_origin';
    distance: number;
    displayUnit: 'unknown' | 'mm' | 'cm' | 'in';
  };
  updatedAt?: string;
  procedureType: 'anatomic_tsa' | 'reverse_tsa' | 'hemiarthroplasty';
  glenoidComponent: {
    system: string;
    type: 'baseplate_glenosphere' | 'pegged_polyethylene' | 'keeled_polyethylene';
    sizeMm: number; // e.g. 36mm, 39mm, 42mm
    lateralizationMm: number; // 0 - 6 mm
    inferiorTiltDeg: number; // 0 - 10 deg
    versionCorrectionDeg: number;
    implantOffsetMm: [number, number, number];
  };
  humeralComponent: {
    system: string;
    stemSize: string;
    stemInclinationDeg: number; // 135 deg vs 145 deg vs 155 deg
    humeralTrayLateralizationMm: number;
    humeralInsertThicknessMm: number;
  };
  notes?: string;
  planningApprovedBy?: string;
}

export interface PlanningVersion extends ImplantPlanningConfig {
  id: string;
  name: string;
  caseId: string;
  createdAt: string;
  updatedAt: string;
  analysis?: ImplantSpatialAnalysis;
}

export interface ImplantSpatialAnalysis {
  status: 'current' | 'invalid_geometry' | 'model_outdated';
  method: 'axis_aligned_bounding_box';
  implantBounds: { min: [number, number, number]; max: [number, number, number]; dimensions: [number, number, number] };
  boneBounds: { min: [number, number, number]; max: [number, number, number]; dimensions: [number, number, number] };
  intersects: boolean;
  implantOutsideBone: boolean;
  minimumAxisGap?: number;
  warnings: string[];
  patientModelId: string;
  patientModelVersion: number;
  implantAssetId: string;
  implantAssetVersion: number;
  computedAt: string;
}

export interface ImplantReferencePoint {
  id: string;
  caseId: string;
  implantAssetId: string;
  implantAssetVersion: number;
  name: string;
  coordinatesLocal: [number, number, number];
  coordinateUnit: 'unknown' | 'mm' | 'cm' | 'in';
  unitVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImplantAsset {
  id: string;
  caseId: string;
  filename: string;
  format: 'stl' | 'obj' | 'ply' | 'glb';
  storageName: string;
  version: number;
  fileSizeBytes: number;
  unit: 'unknown' | 'mm' | 'cm' | 'in';
  unitVerified: boolean;
  uploadedAt: string;
  isDemoAsset: boolean;
  category?: 'glenoid' | 'baseplate' | 'glenosphere' | 'humeral_stem' | 'humeral_cup' | 'other';
  displayName?: string;
  manufacturer?: string;
  metadata?: Record<string, unknown>;
}

export interface SegmentationJob {
  jobId: string;
  caseId: string;
  status: 'not_configured' | 'ready' | 'queued' | 'processing' | 'completed' | 'failed';
  modelName: string;
  modelVersion: string;
  targetStructures: ('scapula' | 'humerus' | 'clavicle')[];
  createdAt: string;
  completedAt?: string;
  progressPercent: number;
  logMessages: string[];
  diceScoreScapula?: number;
  diceScoreHumerus?: number;
  maxThresholdHu?: number;
  version?: number;
  inputDimensions?: number[];
  voxelSpacingMm?: number[];
  voxelCount?: number;
  segmentationVolumeMm3?: number;
  maskStorageName?: string;
  reconstructionStatus?: 'outdated' | 'completed' | 'failed';
  updatedAt?: string;
  processingError?: string | null;
  manualCorrections?: Array<Record<string, unknown>>;
  isManuallyCorrected?: boolean;
  separationMethod?: string;
  separationStatus?: 'verified' | 'manual_review_required';
  separationConfidence?: number | null;
  separationNotes?: string | null;
  overlapVoxelCount?: number;
  scapulaVoxelCount?: number;
  humerusVoxelCount?: number;
  scapulaVolumeMm3?: number;
  humerusVolumeMm3?: number;
}

export interface MeshArtifact {
  id: string;
  structure: 'combined' | 'scapula' | 'humerus' | 'clavicle' | 'implant_glenoid' | 'implant_humerus';
  filename: string;
  format: 'stl' | 'obj' | 'ply' | 'vtk';
  vertexCount: number;
  faceCount: number;
  surfaceAreaMm2?: number;
  volumeMm3?: number;
  isDemoMesh: boolean;
  provenance: string;
  localBlobUrl?: string;
  caseId?: string;
  version?: number;
  fileSizeBytes?: number;
  sha256?: string;
  uploadedAt?: string;
  unit?: 'unknown' | 'mm' | 'cm' | 'in';
  unitVerified?: boolean;
  boundingBox?: { x: number; y: number; z: number };
  triangleCount?: number;
  qualityChecks?: Record<string, unknown>;
  storageName?: string;
}

export interface ViewerPreferences {
  scapulaVisible: boolean;
  humerusVisible: boolean;
  landmarksVisible: boolean;
  selectedModelId?: string;
  selectedSliceIndex?: number;
}

export interface ClinicalReport {
  reportId: string;
  caseId: string;
  title: string;
  generatedAt: string;
  summary: string;
  imagingSummary: string;
  reconstructionSummary: string;
  keyFindings: string[];
  recommendationDisclaimer: string;
  validationWarnings: string[];
}

export interface ResearchCase {
  id: string; // e.g. "SHL-2026-0042"
  name: string;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
  status: CaseStatus;
  demographics: PatientDemographics;
  imaging?: CTSliceMetadata;
  segmentationJob?: SegmentationJob;
  meshes: MeshArtifact[];
  landmarks: AnatomicalLandmark[];
  measurements?: MorphometricMeasurements;
  implantPlan?: ImplantPlanningConfig;
  planningVersions?: PlanningVersion[];
  implantAssets?: ImplantAsset[];
  implantReferencePoints?: ImplantReferencePoint[];
  planningMeasurements?: PlanningMeasurement[];
  reports: ClinicalReport[];
  viewerPreferences?: ViewerPreferences;
  createdByUserId?: string;
}
