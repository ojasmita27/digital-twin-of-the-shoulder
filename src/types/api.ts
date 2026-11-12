/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BackendHealthResponse {
  status: 'healthy' | 'degraded' | 'unreachable';
  service: string;
  version: string;
  timestamp: string;
  gpuAvailable: boolean;
  cudaDevice?: string;
  torchVersion?: string;
  monaiVersion?: string;
  simpleItkVersion?: string;
  activeJobsCount: number;
}

export interface ApiContractDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  summary: string;
  description: string;
  requestBodySchema?: string;
  responseSchema: string;
  status: 'implemented_client_ready' | 'pending_fastapi_backend';
}

export interface BackendConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  useMockFallbackForReview: boolean;
}

export interface SliceInfo {
  filename: string;
  instanceNumber: number;
  sliceLocation?: number;
  sliceThicknessMm: number;
  pixelSpacingMm: [number, number];
  rows: number;
  columns: number;
  hasPixelData: boolean;
  previewDataUrl?: string;
  physicalPositionMm?: number;
}

export interface DicomUploadResponse {
  success: boolean;
  message?: string;
  caseId?: string;
  fileCount: number;
  totalSizeBytes: number;
  modality: string;
  seriesInstanceUid: string;
  studyInstanceUid: string;
  sliceCount: number;
  sliceThicknessMm: number;
  sliceSpacingMm?: number;
  zCoverageMm?: number;
  volumeDimensionsMm?: [number, number, number];
  duplicateCount?: number;
  hasGaps?: boolean;
  gapWarnings?: string[];
  pixelSpacingMm: [number, number];
  rows: number;
  columns: number;
  windowCenter: number;
  windowWidth: number;
  reconstructionKernel: string;
  acquisitionDate: string;
  isVolumetricSeries: boolean;
  reconstructionReadiness: string;
  reconstructionMessage: string;
  slices: SliceInfo[];
  primaryPreviewUrl?: string;
  sourceFiles?: string[];
  processingStatus?: string;
  orientationValidation?: {
    valid: boolean;
    imageOrientationPatient: number[];
    patientCoordinateSystem: string;
  };
  spacingValidation?: {
    valid: boolean;
    pixelSpacingMm: number[];
    sliceSpacingMm: number;
    sliceThicknessMm: number;
  };
  coordinateSystem?: string;
  originMm?: [number, number, number];
  orientationPatient?: [number, number, number, number, number, number];
  dimensionsVoxels?: [number, number, number];
}

export interface ResearchAnalytics {
  caseCount: number;
  processedCaseCount: number;
  availableImagingStudies: number;
  segmentationStatus: { completed: number; pending: number };
  modelStatus: { casesWithModels: number; modelCount: number };
  measurementRecordCount: number;
  implantPlanningVersionCount: number;
  processingStatistics: { volumetricSeries: number; reconstructionReady: number };
}
