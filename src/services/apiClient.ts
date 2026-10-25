/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackendHealthResponse, ApiContractDefinition, BackendConfig } from '../types/api';
import { ResearchCase } from '../types/case';

function resolveDefaultBaseUrl(): string {
  // 1. Check for explicit environment variable configuration
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_BACKEND_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim();
  }

  // 2. Default to empty string: in hosted previews, we do not assume localhost:8001 exists.
  return '';
}

const DEFAULT_CONFIG: BackendConfig = {
  baseUrl: resolveDefaultBaseUrl(),
  apiKey: '',
  timeoutMs: 5000,
  useMockFallbackForReview: false,
};

const STORAGE_KEY = 'dts_backend_config';

export function isHostedPreview(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]';
}

export function getBackendConfig(): BackendConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // In hosted environments (e.g., Google AI Studio preview), localhost:8001 points to the
      // visitor's local machine, not the backend, and fails with Mixed Content / Failed to fetch.
      // Automatically reset stale localhost settings to prevent persistent connection errors.
      if (isHostedPreview() && typeof parsed.baseUrl === 'string' && (
        parsed.baseUrl.startsWith('http://localhost') ||
        parsed.baseUrl.startsWith('http://127.0.0.1')
      )) {
        parsed.baseUrl = resolveDefaultBaseUrl();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {
    // fallback
  }
  return DEFAULT_CONFIG;
}

export function saveBackendConfig(config: BackendConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export interface ApiCallResult<T> {
  data: T | null;
  error: string | null;
  status: number | null;
  durationMs: number;
}

export class ApiClient {
  private config: BackendConfig;

  constructor() {
    this.config = getBackendConfig();
  }

  public updateConfig(newConfig: Partial<BackendConfig>) {
    this.config = { ...this.config, ...newConfig };
    saveBackendConfig(this.config);
  }

  public getConfig(): BackendConfig {
    return { ...this.config };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiCallResult<T>> {
    const start = performance.now();
    const rawBase = (this.config.baseUrl || '').trim().replace(/\/+$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = rawBase ? `${rawBase}${cleanEndpoint}` : cleanEndpoint;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}),
      ...(options.headers as Record<string, string> || {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const durationMs = Math.round(performance.now() - start);

      if (!response.ok) {
        const errorDetail = !this.config.baseUrl
          ? `Backend unreachable (HTTP ${response.status}). In hosted previews, deploy the FastAPI backend and set its URL in Settings.`
          : `HTTP ${response.status}: ${response.statusText}`;
        return {
          data: null,
          error: errorDetail,
          status: response.status,
          durationMs,
        };
      }

      const json = await response.json();
      return {
        data: json as T,
        error: null,
        status: response.status,
        durationMs,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      const durationMs = Math.round(performance.now() - start);
      const errorMessage = err instanceof Error ? err.message : 'Unknown network failure';
      const targetLabel = this.config.baseUrl ? this.config.baseUrl : 'No Backend URL Configured';

      let guidance = errorMessage;
      if (!this.config.baseUrl) {
        guidance = 'FastAPI backend is disconnected. To connect live SQLite cases, deploy the FastAPI service and set its URL in Settings (or run the app locally on your machine).';
      } else if (isHostedPreview() && (this.config.baseUrl.startsWith('http://localhost') || this.config.baseUrl.startsWith('http://127.0.0.1'))) {
        guidance = 'Cannot reach localhost from a remote hosted preview. Deploy the FastAPI backend and enter its public HTTPS URL in Settings.';
      }

      return {
        data: null,
        error: `FastAPI Connection Error (${targetLabel}): ${guidance}`,
        status: null,
        durationMs,
      };
    }
  }

  /**
   * Genuine Health Check against FastAPI backend
   */
  public async checkHealth(): Promise<ApiCallResult<BackendHealthResponse>> {
    return this.request<BackendHealthResponse>('/api/health', { method: 'GET' });
  }

  public async getCases(): Promise<ApiCallResult<ResearchCase[]>> {
    return this.request<ResearchCase[]>('/api/cases', { method: 'GET' });
  }

  public async getCaseById(caseId: string): Promise<ApiCallResult<ResearchCase>> {
    return this.request<ResearchCase>(`/api/cases/${encodeURIComponent(caseId)}`, { method: 'GET' });
  }

  public async createCase(caseData: Partial<ResearchCase>): Promise<ApiCallResult<ResearchCase>> {
    return this.request<ResearchCase>('/api/cases', {
      method: 'POST',
      body: JSON.stringify(caseData),
    });
  }

  public async deleteCase(caseId: string): Promise<ApiCallResult<void>> {
    return this.request<void>(`/api/cases/${encodeURIComponent(caseId)}`, {
      method: 'DELETE',
    });
  }

  public async triggerSegmentation(caseId: string, model: string, structures: string[]): Promise<ApiCallResult<{ jobId: string }>> {
    return this.request<{ jobId: string }>(`/api/cases/${encodeURIComponent(caseId)}/segmentation/jobs`, {
      method: 'POST',
      body: JSON.stringify({ model, structures }),
    });
  }
}

export const apiClient = new ApiClient();

export const API_CONTRACTS: ApiContractDefinition[] = [
  {
    method: 'GET',
    endpoint: '/api/health',
    summary: 'System & Worker Health',
    description: 'Returns health status of the FastAPI backend, PyTorch CUDA capability, SimpleITK version, and current job queue depth.',
    responseSchema: `{ "status": "healthy", "service": "dts-fastapi-core", "gpuAvailable": true, "torchVersion": "2.4.0", "monaiVersion": "1.3.2" }`,
    status: 'implemented_client_ready',
  },
  {
    method: 'GET',
    endpoint: '/api/cases',
    summary: 'List Research Cases',
    description: 'Retrieves non-identifying research cases with status, timestamps, and demographic metadata.',
    responseSchema: `[ { "id": "SHL-2026-0042", "status": "models_generated", "demographics": { ... } } ]`,
    status: 'implemented_client_ready',
  },
  {
    method: 'POST',
    endpoint: '/api/cases',
    summary: 'Create New Research Case',
    description: 'Creates a new case record. Returns the generated unique identifier.',
    requestBodySchema: `{ "name": "Subject 084", "demographics": { "ageBand": "61-75", "affectedSide": "right", ... } }`,
    responseSchema: `{ "id": "SHL-2026-0091", "createdAt": "2026-10-15T08:00:00Z" }`,
    status: 'implemented_client_ready',
  },
  {
    method: 'GET',
    endpoint: '/api/cases/{case_id}',
    summary: 'Get Case Details',
    description: 'Retrieves full case details including linked imaging series, segmentation jobs, meshes, and morphometric measurements.',
    responseSchema: `{ "id": "SHL-2026-0042", "imaging": { ... }, "meshes": [ ... ], "measurements": { ... } }`,
    status: 'implemented_client_ready',
  },
  {
    method: 'POST',
    endpoint: '/api/cases/{case_id}/imaging/upload',
    summary: 'Upload DICOM Series',
    description: 'Accepts multipart/form-data containing DICOM slices or compressed ZIP archives. Validates CT slice spacing and orientation.',
    requestBodySchema: `multipart/form-data (files: File[])`,
    responseSchema: `{ "seriesInstanceUid": "1.2.840.113619.2.55...", "sliceCount": 184, "pixelSpacing": [0.72, 0.72] }`,
    status: 'pending_fastapi_backend',
  },
  {
    method: 'GET',
    endpoint: '/api/cases/{case_id}/imaging/series',
    summary: 'Get Series Metadata & Slices',
    description: 'Returns axial, coronal, and sagittal slice indices, Hounsfield Unit windows, and orientation vectors.',
    responseSchema: `{ "seriesUid": "...", "sliceThicknessMm": 0.8, "windowCenter": 450, "windowWidth": 1500 }`,
    status: 'implemented_client_ready',
  },
  {
    method: 'POST',
    endpoint: '/api/cases/{case_id}/segmentation/jobs',
    summary: 'Trigger Segmentation Job',
    description: 'Submits a GPU segmentation task using MONAI/nnU-Net for scapula and humerus extraction.',
    requestBodySchema: `{ "model": "TotalSegmentator-Shoulder-v2", "targetStructures": ["scapula", "humerus"] }`,
    responseSchema: `{ "jobId": "job-seg-9148", "status": "queued", "estimatedDurationSeconds": 45 }`,
    status: 'implemented_client_ready',
  },
  {
    method: 'GET',
    endpoint: '/api/jobs/{job_id}',
    summary: 'Poll Job Progress',
    description: 'Streams or polls segmentation progress, logs, and Dice score validation metrics.',
    responseSchema: `{ "jobId": "job-seg-9148", "status": "processing", "progressPercent": 68, "log": "Running inference..." }`,
    status: 'implemented_client_ready',
  },
  {
    method: 'GET',
    endpoint: '/api/cases/{case_id}/meshes',
    summary: 'Retrieve 3D Anatomical Meshes',
    description: 'Downloads or streams STL/VTK polydata for segmented scapula, humerus, or planned implant components.',
    responseSchema: `[ { "structure": "scapula", "vertexCount": 42100, "downloadUrl": "/api/meshes/scapula.stl" } ]`,
    status: 'implemented_client_ready',
  },
  {
    method: 'GET',
    endpoint: '/api/cases/{case_id}/measurements',
    summary: 'Compute Morphometric Measurements',
    description: 'Calculates glenoid version, inclination, humeral head diameter, and neck-shaft angle according to ISB standards.',
    responseSchema: `{ "glenoidVersionDeg": -8.4, "glenoidInclinationDeg": 6.2, "algorithm": "Friedman-Maurer-2024" }`,
    status: 'implemented_client_ready',
  },
  {
    method: 'POST',
    endpoint: '/api/cases/{case_id}/reports',
    summary: 'Generate Surgical Plan Report',
    description: 'Compiles validated morphometric measurements, implant specifications, and 3D views into a structured PDF document.',
    requestBodySchema: `{ "includeImages": true, "format": "pdf" }`,
    responseSchema: `{ "reportId": "rep-2026-0042", "reportUrl": "/api/reports/rep-2026-0042.pdf" }`,
    status: 'pending_fastapi_backend',
  },
];
