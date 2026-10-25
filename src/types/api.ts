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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
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
