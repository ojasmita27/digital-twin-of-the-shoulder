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
}

export interface ImplantPlanningConfig {
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
}

export interface MeshArtifact {
  id: string;
  structure: 'scapula' | 'humerus' | 'clavicle' | 'implant_glenoid' | 'implant_humerus';
  filename: string;
  format: 'stl' | 'obj' | 'ply' | 'vtk';
  vertexCount: number;
  faceCount: number;
  surfaceAreaMm2?: number;
  volumeMm3?: number;
  isDemoMesh: boolean;
  provenance: string;
  localBlobUrl?: string;
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
  reports: ClinicalReport[];
}
