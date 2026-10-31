/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BackendHealthResponse,
  ApiContractDefinition,
  BackendConfig,
  DicomUploadResponse,
} from '../types/api';
import { AnatomicalLandmark, MeshArtifact, ResearchCase, SavedMeasurement } from '../types/case';

export const PRODUCTION_RENDER_BACKEND = 'https://digital-twin-of-the-shoulder.onrender.com';

function resolveDefaultBaseUrl(): string {
  // 1. Check for explicit environment variable configuration
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_BACKEND_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim();
  }

  // 2. Default to active deployed Render backend
  return PRODUCTION_RENDER_BACKEND;
}

const DEFAULT_CONFIG: BackendConfig = {
  baseUrl: resolveDefaultBaseUrl(),
  apiKey: '',
  timeoutMs: 15000,
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
      // Automatically redirect explicit localhost:8001 to Render backend.
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

export interface BackendHealthState {
  status: 'checking' | 'connected' | 'unreachable';
  error?: string;
  details?: BackendHealthResponse | null;
  baseUrl: string;
  lastCheckedAt?: number;
}

export class ApiClient {
  private config: BackendConfig;
  private healthState: BackendHealthState;
  private healthListeners: Set<(state: BackendHealthState) => void> = new Set();
  private unauthorizedHandler: (() => void) | null = null;

  constructor() {
    this.config = getBackendConfig();
    this.healthState = {
      status: 'checking',
      baseUrl: this.config.baseUrl,
    };
  }

  public subscribeHealth(listener: (state: BackendHealthState) => void): () => void {
    this.healthListeners.add(listener);
    listener(this.healthState);
    return () => {
      this.healthListeners.delete(listener);
    };
  }

  public getHealthState(): BackendHealthState {
    return { ...this.healthState };
  }

  private notifyHealth(update: Partial<BackendHealthState>) {
    this.healthState = {
      ...this.healthState,
      ...update,
      baseUrl: this.config.baseUrl,
    };
    this.healthListeners.forEach((fn) => {
      try {
        fn(this.healthState);
      } catch (err) {
        console.error('Error in health listener', err);
      }
    });
  }

  public updateConfig(newConfig: Partial<BackendConfig>) {
    this.config = { ...this.config, ...newConfig };
    saveBackendConfig(this.config);
    this.notifyHealth({ baseUrl: this.config.baseUrl, status: 'checking' });
    this.checkHealth();
  }

  public getConfig(): BackendConfig {
    return { ...this.config };
  }

  public setUnauthorizedHandler(handler: (() => void) | null): void {
    this.unauthorizedHandler = handler;
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
      if (response.status === 401) {
        this.unauthorizedHandler?.();
      }

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

      if (response.status === 204) {
        return {
          data: { success: true } as T,
          error: null,
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
   * Genuine Health Check against FastAPI backend.
   * Broadcasts the status to all subscribed components (TopBar, SettingsView, etc.).
   */
  public async checkHealth(): Promise<ApiCallResult<BackendHealthResponse>> {
    this.notifyHealth({ status: 'checking' });
    const res = await this.request<BackendHealthResponse>('/api/health', { method: 'GET' });
    if (res.data) {
      this.notifyHealth({
        status: 'connected',
        details: res.data,
        error: undefined,
        lastCheckedAt: Date.now(),
      });
    } else {
      this.notifyHealth({
        status: 'unreachable',
        error: res.error || 'Connection failed',
        details: null,
        lastCheckedAt: Date.now(),
      });
    }
    return res;
  }

  public async getCases(): Promise<ApiCallResult<ResearchCase[]>> {
    return this.request<ResearchCase[]>('/api/cases', { method: 'GET' });
  }

  public async getCaseById(caseId: string): Promise<ApiCallResult<ResearchCase>> {
    return this.request<ResearchCase>(`/api/cases/${encodeURIComponent(caseId)}`, { method: 'GET' });
  }

  public async updateCase(caseId: string, updates: Partial<ResearchCase>): Promise<ApiCallResult<ResearchCase>> {
    return this.request<ResearchCase>(`/api/cases/${encodeURIComponent(caseId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  public async createCase(payload: {
    name: string;
    demographics: ResearchCase['demographics'];
    isDemo?: boolean;
  }): Promise<ApiCallResult<ResearchCase>> {
    return this.request<ResearchCase>('/api/cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async deleteCase(caseId: string): Promise<ApiCallResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>(`/api/cases/${encodeURIComponent(caseId)}`, {
      method: 'DELETE',
    });
  }

  public async uploadModel(caseId: string, file: File, metadata: Record<string, unknown>): Promise<ApiCallResult<{ model: MeshArtifact }>> {
    const rawBase = (this.config.baseUrl || '').trim().replace(/\/+$/, '');
    const endpoint = `/api/cases/${encodeURIComponent(caseId)}/models`;
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('metadata', JSON.stringify(metadata));
    try {
      const response = await fetch(`${rawBase}${endpoint}`, {
        method: 'POST',
        body: formData,
        headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 401) this.unauthorizedHandler?.();
      if (!response.ok) {
        return { data: null, error: `HTTP ${response.status}: ${json.detail || response.statusText}`, status: response.status, durationMs: 0 };
      }
      return { data: json as { model: MeshArtifact }, error: null, status: response.status, durationMs: 0 };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error.message : 'Model upload failed.', status: null, durationMs: 0 };
    }
  }

  public async downloadModel(caseId: string, modelId: string): Promise<ApiCallResult<ArrayBuffer>> {
    const rawBase = (this.config.baseUrl || '').trim().replace(/\/+$/, '');
    const endpoint = `/api/cases/${encodeURIComponent(caseId)}/models/${encodeURIComponent(modelId)}/file`;
    try {
      const response = await fetch(`${rawBase}${endpoint}`, {
        headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
      });
      if (response.status === 401) this.unauthorizedHandler?.();
      if (!response.ok) return { data: null, error: `HTTP ${response.status}: ${response.statusText}`, status: response.status, durationMs: 0 };
      return { data: await response.arrayBuffer(), error: null, status: response.status, durationMs: 0 };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error.message : 'Model download failed.', status: null, durationMs: 0 };
    }
  }

  public async deleteModel(caseId: string, modelId: string): Promise<ApiCallResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>(
      `/api/cases/${encodeURIComponent(caseId)}/models/${encodeURIComponent(modelId)}`,
      { method: 'DELETE' },
    );
  }

  public async createLandmark(caseId: string, landmark: {
    name: string;
    structure: string;
    coordinatesMm: [number, number, number];
    provenance: 'manual_annotated' | 'ai_inferred_prototype';
    modelId: string;
    modelVersion: number;
    coordinateUnit: string;
    unitVerified: boolean;
    validationNotes?: string;
  }): Promise<ApiCallResult<AnatomicalLandmark>> {
    return this.request<AnatomicalLandmark>(`/api/cases/${encodeURIComponent(caseId)}/landmarks`, {
      method: 'POST',
      body: JSON.stringify(landmark),
    });
  }

  public async updateLandmark(caseId: string, landmarkId: string, updates: Partial<AnatomicalLandmark>): Promise<ApiCallResult<AnatomicalLandmark>> {
    return this.request<AnatomicalLandmark>(
      `/api/cases/${encodeURIComponent(caseId)}/landmarks/${encodeURIComponent(landmarkId)}`,
      { method: 'PATCH', body: JSON.stringify(updates) },
    );
  }

  public async deleteLandmark(caseId: string, landmarkId: string): Promise<ApiCallResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>(
      `/api/cases/${encodeURIComponent(caseId)}/landmarks/${encodeURIComponent(landmarkId)}`,
      { method: 'DELETE' },
    );
  }

  public async createMeasurement(caseId: string, measurement: Record<string, unknown>): Promise<ApiCallResult<SavedMeasurement>> {
    return this.request<SavedMeasurement>(`/api/cases/${encodeURIComponent(caseId)}/measurements`, {
      method: 'POST',
      body: JSON.stringify(measurement),
    });
  }

  public async listMeasurements(caseId: string): Promise<ApiCallResult<SavedMeasurement[]>> {
    return this.request<SavedMeasurement[]>(`/api/cases/${encodeURIComponent(caseId)}/measurements`);
  }

  /**
   * Upload real DICOM (.dcm) files to the FastAPI backend.
   */
  public async uploadDicomFiles(
    caseId: string | null,
    files: File[]
  ): Promise<ApiCallResult<DicomUploadResponse>> {
    const start = performance.now();
    const rawBase = (this.config.baseUrl || '').trim().replace(/\/+$/, '');
    const endpoint = caseId
      ? `/api/cases/${encodeURIComponent(caseId)}/imaging/upload`
      : `/api/imaging/upload`;
    const url = rawBase ? `${rawBase}${endpoint}` : endpoint;

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file, file.name);
    });

    const controller = new AbortController();
    // Allow up to 60 seconds for multiple slices
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: {
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
      });
      clearTimeout(timeout);
      const durationMs = Math.round(performance.now() - start);
      if (response.status === 401) {
        this.unauthorizedHandler?.();
      }

      if (!response.ok) {
        let detailText = '';
        try {
          const errData = await response.json();
          if (errData.detail) {
            detailText = typeof errData.detail === 'string'
              ? errData.detail
              : JSON.stringify(errData.detail);
          }
        } catch {
          // fallback
        }

        let formattedError = `HTTP ${response.status} (${response.statusText || 'Error'}) on ${endpoint}`;
        if (response.status === 404) {
          if (detailText === 'Not Found' || !detailText) {
            formattedError = `HTTP 404 Not Found: The endpoint '${endpoint}' does not exist on ${rawBase || 'the active server'}. The deployed Render backend is currently running an older commit that lacks the new DICOM imaging router. Push your workspace files to GitHub (ojasmita27/digital-twin-of-the-shoulder) to trigger a Render redeployment.`;
          } else {
            formattedError = `HTTP 404: ${detailText}`;
          }
        } else if (detailText) {
          formattedError = `HTTP ${response.status}: ${detailText}`;
        } else {
          formattedError = `HTTP ${response.status}: ${response.statusText || 'Upload failed'}`;
        }

        return {
          data: null,
          error: formattedError,
          status: response.status,
          durationMs,
        };
      }

      const json = await response.json();
      return {
        data: json as DicomUploadResponse,
        error: null,
        status: response.status,
        durationMs,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      const durationMs = Math.round(performance.now() - start);
      const msg = err instanceof Error ? err.message : 'Upload connection failed';
      return {
        data: null,
        error: `DICOM Upload Network Error: ${msg}`,
        status: null,
        durationMs,
      };
    }
  }

  public async triggerSegmentation(
    caseId: string,
    modelName: string,
    structures: string[]
  ): Promise<ApiCallResult<{ jobId: string; status: string }>> {
    return this.request<{ jobId: string; status: string }>(
      `/api/cases/${encodeURIComponent(caseId)}/segmentation/jobs`,
      {
        method: 'POST',
        body: JSON.stringify({ model: modelName, targetStructures: structures }),
      }
    );
  }

  public async segmentCase(caseId: string, thresholdHu = 300, maxThresholdHu?: number): Promise<ApiCallResult<Record<string, unknown>>> {
    const maxQuery = maxThresholdHu === undefined ? '' : `&maxThresholdHu=${maxThresholdHu}`;
    return this.request<Record<string, unknown>>(
      `/api/cases/${encodeURIComponent(caseId)}/imaging/segmentation?thresholdHu=${thresholdHu}${maxQuery}`,
      { method: 'POST' },
    );
  }

  public async reconstructCase(caseId: string, thresholdHu = 300): Promise<ApiCallResult<Record<string, unknown>>> {
    return this.request<Record<string, unknown>>(
      `/api/cases/${encodeURIComponent(caseId)}/imaging/reconstruct?thresholdHu=${thresholdHu}`,
      { method: 'POST' },
    );
  }

  public async getSegmentationPreview(
    caseId: string,
    orientation: 'axial' | 'coronal' | 'sagittal',
    sliceIndex: number,
    windowCenter?: number,
    windowWidth?: number,
  ): Promise<ApiCallResult<{
    ctPreviewUrl: string;
    maskPreviewUrl?: string | null;
    orientation: string;
    sliceIndex: number;
    dimensions: number[];
    spacingMm: number[];
    segmentationVersion?: number;
  }>> {
    return this.request(
      `/api/cases/${encodeURIComponent(caseId)}/imaging/segmentation/preview?orientation=${orientation}&sliceIndex=${sliceIndex}&windowCenter=${windowCenter ?? 450}&windowWidth=${windowWidth ?? 1500}`,
      { method: 'GET' },
    );
  }

  public async correctSegmentation(
    caseId: string,
    sliceIndex: number,
    operations: Array<{ x: number; y: number; radius: number; add: boolean }>,
  ): Promise<ApiCallResult<Record<string, unknown>>> {
    return this.request<Record<string, unknown>>(
      `/api/cases/${encodeURIComponent(caseId)}/imaging/segmentation/corrections`,
      {
        method: 'POST',
        body: JSON.stringify({ sliceIndex, operations }),
      },
    );
  }
}

// Global Singleton Export
export const apiClient = new ApiClient();

export const API_CONTRACTS: ApiContractDefinition[] = [
  {
    method: 'GET',
    endpoint: '/api/health',
    summary: 'System & GPU Health Status',
    description: 'Inspects CUDA/PyTorch availability and active segmentation job worker count.',
    responseSchema: `{ "status": "healthy", "service": "...", "gpuAvailable": false, "activeJobsCount": 0 }`,
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
    description: 'Accepts multipart/form-data containing genuine DICOM (.dcm) slices. Validates DICOM structure, extracts non-identifying geometry, and renders slice pixels.',
    requestBodySchema: `multipart/form-data (files: File[])`,
    responseSchema: `{ "seriesInstanceUid": "1.2.840...", "sliceCount": 1, "isVolumetricSeries": false, "reconstructionReadiness": "single_slice_preview_only" }`,
    status: 'implemented_client_ready',
  },
  {
    method: 'GET',
    endpoint: '/api/cases/{case_id}/imaging',
    summary: 'Get Series Metadata & Slices',
    description: 'Returns axial slice metadata, Hounsfield Unit windows, slice coordinates, and orientation vectors.',
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
