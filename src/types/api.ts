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
}
