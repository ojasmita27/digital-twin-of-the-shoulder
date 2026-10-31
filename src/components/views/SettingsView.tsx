/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  apiClient,
  API_CONTRACTS,
  getBackendConfig,
  PRODUCTION_RENDER_BACKEND,
  BackendHealthState,
} from '../../services/apiClient';
import { BackendConfig, BackendHealthResponse } from '../../types/api';
import {
  Server,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Database,
  Trash2,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Terminal,
} from 'lucide-react';

interface SettingsViewProps {
  onResetDemo: () => void;
  onClearAll: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onResetDemo,
  onClearAll,
}) => {
  const [config, setConfig] = useState<BackendConfig>(getBackendConfig());
  const [testResult, setTestResult] = useState<{
    status: 'idle' | 'testing' | 'success' | 'error';
    message?: string;
    details?: BackendHealthResponse | null;
    durationMs?: number;
  }>({ status: 'idle' });

  const [expandedContract, setExpandedContract] = useState<string | null>(API_CONTRACTS[0]?.endpoint || null);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    apiClient.updateConfig(config);
  };

  const handleTestConnection = async () => {
    setTestResult({ status: 'testing' });
    const res = await apiClient.checkHealth();
    if (res.data) {
      setTestResult({
        status: 'success',
        details: res.data,
        durationMs: res.durationMs,
        message: `FastAPI responded in ${res.durationMs}ms`,
      });
    } else {
      setTestResult({
        status: 'error',
        message: res.error || 'Connection failed',
        durationMs: res.durationMs,
        details: null,
      });
    }
  };

  useEffect(() => {
    const unsubscribe = apiClient.subscribeHealth((state: BackendHealthState) => {
      if (state.status === 'connected') {
        setTestResult({
          status: 'success',
          details: state.details,
          message: `Connected to ${state.baseUrl}`,
        });
      } else if (state.status === 'unreachable') {
        setTestResult({
          status: 'error',
          message: state.error || 'Connection failed',
          details: null,
        });
      }
    });
    apiClient.checkHealth();
    return unsubscribe;
  }, []);

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          FastAPI Backend Architecture & Environment Settings
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Configure connection endpoints, review typed API contracts, and inspect system telemetry.
        </p>
      </div>

      {/* Architecture Honesty Banner */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex items-start gap-3 text-xs shadow-xs transition-colors">
        <Server className="w-4 h-4 text-teal-600 dark:text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-slate-900 dark:text-slate-200">
            Phase 1 Integration Architecture & Backend Separation
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
            In accordance with medical software best practices, heavy imaging tasks (Pydicom parsing, SimpleITK volume resampling, PyTorch/MONAI inference, Marching Cubes meshing) run on a dedicated Python FastAPI service. The client layer establishes typed contracts, timeouts, and error handling. If your Python server is not reachable, the status indicator will honestly report "Backend Unavailable" without fabricating results.
          </p>
        </div>
      </div>

      {/* Backend Connection Settings Form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 shadow-xs transition-colors">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
          FastAPI Server Endpoint
        </h2>

        <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-700 dark:text-slate-300 font-medium">
                  Backend Base URL
                </label>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                  {config.baseUrl ? config.baseUrl : 'Disconnected / Unset'}
                </span>
              </div>
              <input
                type="text"
                value={config.baseUrl}
                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                placeholder="e.g. https://my-fastapi-backend.run.app (or empty)"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-hidden focus:border-teal-500 dark:focus:border-cyan-500 transition-colors"
              />
              <div className="flex items-center gap-2 mt-2 text-[11px] flex-wrap">
                <span className="text-slate-500">Presets:</span>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, baseUrl: PRODUCTION_RENDER_BACKEND })}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] border transition-colors ${
                    config.baseUrl === PRODUCTION_RENDER_BACKEND
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 font-semibold'
                      : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Connect to deployed Render FastAPI backend"
                >
                  Render (Active)
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, baseUrl: 'http://localhost:8001' })}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] border transition-colors ${
                    config.baseUrl === 'http://localhost:8001'
                      ? 'bg-teal-50 text-teal-700 border-teal-300 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800 font-semibold'
                      : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="For running uvicorn locally on your desktop"
                >
                  Local Desktop (8001)
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, baseUrl: '' })}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] border transition-colors ${
                    !config.baseUrl
                      ? 'bg-teal-50 text-teal-700 border-teal-300 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800 font-semibold'
                      : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Clear custom backend URL"
                >
                  Unset
                </button>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                API Bearer Token (Optional)
              </label>
              <input
                type="password"
                value={config.apiKey || ''}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                placeholder="Bearer token for secured hospital network"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-hidden focus:border-teal-500 dark:focus:border-cyan-500 transition-colors"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Passed in the Authorization header to secured backend environments.
              </p>
            </div>
          </div>

          {typeof window !== 'undefined' && window.location?.protocol === 'https:' && config.baseUrl.trim().startsWith('http://localhost') && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-900 dark:text-amber-200">Mixed Content Security Warning</div>
                <div className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed mt-0.5">
                  You are viewing this app via secure HTTPS (<code className="text-amber-900 dark:text-amber-200 font-mono">{window.location.origin}</code>).
                  Web browsers will block direct requests to unencrypted <code className="text-amber-900 dark:text-amber-200 font-mono">http://localhost</code>.
                  Use the <strong className="text-teal-700 dark:text-cyan-300 cursor-pointer underline" onClick={() => setConfig({ ...config, baseUrl: PRODUCTION_RENDER_BACKEND })}>Render (Active)</strong> preset above for seamless HTTPS cloud access.
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white dark:bg-cyan-400 dark:hover:bg-cyan-300 dark:text-slate-950 font-semibold rounded text-xs transition-colors shadow-xs"
              >
                Save Configuration
              </button>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testResult.status === 'testing'}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 rounded text-xs border border-slate-300 dark:border-slate-700 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testResult.status === 'testing' ? 'animate-spin' : ''}`} />
                <span>Test Connection (GET /api/health)</span>
              </button>
            </div>

            {/* Test result status display */}
            <div className="font-mono text-xs">
              {testResult.status === 'testing' && (
                <span className="text-slate-500 dark:text-slate-400">Probing server...</span>
              )}
              {testResult.status === 'success' && (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {testResult.message}
                </span>
              )}
              {testResult.status === 'error' && (
                <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {testResult.message}
                </span>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Beginner-friendly Separate Backend Deployment Guide */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 shadow-xs transition-colors">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
          How to Deploy & Connect a Separate FastAPI Backend
        </h2>
        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
          Google AI Studio preview hosts this React interface. The production Python FastAPI service in <code className="text-teal-700 dark:text-cyan-300 font-mono">backend/</code> operates independently with SQLite persistence (<code className="text-teal-700 dark:text-cyan-300 font-mono">data/shoulder_twin.db</code>) and a deployment-ready <code className="text-teal-700 dark:text-cyan-300 font-mono">backend/Dockerfile</code>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-[11px]">
          <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded border border-slate-200 dark:border-slate-800/80 space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 dark:bg-cyan-950 dark:text-cyan-400 border border-teal-300 dark:border-cyan-800 flex items-center justify-center text-[10px] font-mono">1</span>
              <span>Deploy to Cloud Run</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-[10px] leading-relaxed">
              Run <code className="text-teal-700 dark:text-cyan-300">gcloud run deploy shoulder-twin-api --source .</code> or connect your GitHub repository in Google Cloud Console. Cloud Run automatically generates an HTTPS URL.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded border border-slate-200 dark:border-slate-800/80 space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 dark:bg-cyan-950 dark:text-cyan-400 border border-teal-300 dark:border-cyan-800 flex items-center justify-center text-[10px] font-mono">2</span>
              <span>Deploy to Render / Railway</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-[10px] leading-relaxed">
              Create a free Web Service pointing to your repo. Set DockerfilePath to <code className="text-teal-700 dark:text-cyan-300">backend/Dockerfile</code>. You will receive an HTTPS endpoint instantly.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded border border-slate-200 dark:border-slate-800/80 space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 dark:bg-cyan-950 dark:text-cyan-400 border border-teal-300 dark:border-cyan-800 flex items-center justify-center text-[10px] font-mono">3</span>
              <span>Connect & Save</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-[10px] leading-relaxed">
              Copy your HTTPS URL (e.g. <code className="text-teal-700 dark:text-cyan-300">https://digital-twin-of-the-shoulder.onrender.com</code>), paste it into <strong>Backend Base URL</strong> above, and click <strong>Save Configuration</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Documented Proposed FastAPI Endpoints Explorer */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 shadow-xs transition-colors">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
            FastAPI API Contracts & OpenAPI Specifications ({API_CONTRACTS.length})
          </h2>
          <span className="text-[11px] font-mono text-teal-600 dark:text-cyan-400 font-semibold">RESTful Data Contracts</span>
        </div>

        <div className="space-y-2">
          {API_CONTRACTS.map((contract) => {
            const isExpanded = expandedContract === contract.endpoint;
            return (
              <div
                key={contract.endpoint}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded overflow-hidden text-xs"
              >
                <div
                  onClick={() => setExpandedContract(isExpanded ? null : contract.endpoint)}
                  className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono font-bold text-[10px] px-2 py-0.5 rounded ${
                        contract.method === 'GET'
                          ? 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
                          : 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                      }`}
                    >
                      {contract.method}
                    </span>
                    <span className="font-mono text-slate-800 dark:text-slate-200 font-medium">{contract.endpoint}</span>
                    <span className="text-slate-500 font-sans hidden sm:inline">
                      — {contract.summary}
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-slate-500">
                    {contract.status === 'implemented_client_ready' ? 'Client Ready' : 'FastAPI Pending'}
                  </span>
                </div>

                {isExpanded && (
                  <div className="p-3 bg-white dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800/80 space-y-2 text-[11px] font-mono text-slate-700 dark:text-slate-300">
                    <p className="font-sans text-slate-600 dark:text-slate-400 leading-relaxed">
                      {contract.description}
                    </p>

                    {contract.requestBodySchema && (
                      <div>
                        <div className="text-slate-500 uppercase text-[10px] font-semibold">Request Body:</div>
                        <pre className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300 overflow-x-auto text-[10px] mt-1 font-mono">
                          {contract.requestBodySchema}
                        </pre>
                      </div>
                    )}

                    <div>
                      <div className="text-slate-500 uppercase text-[10px] font-semibold">Response Payload:</div>
                      <pre className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 text-teal-700 dark:text-cyan-300/90 overflow-x-auto text-[10px] mt-1 font-mono">
                        {contract.responseSchema}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Local Storage & Cache Management */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 shadow-xs transition-colors">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
          Research Storage & Sandbox State
        </h2>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-200 text-xs">Reset to Baseline Demo</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Restores the default synthetic case with pre-segmented scapula, humerus, and landmarks.
            </p>
          </div>
          <button
            onClick={onResetDemo}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 rounded text-xs border border-slate-200 dark:border-slate-700 transition-colors shrink-0 font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Synthetic Demo</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800 pt-3">
          <div>
            <div className="font-semibold text-rose-700 dark:text-rose-300 text-xs">Clear All Local Records</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Purges all registered research cases and mesh buffers to verify empty-state handling.
            </p>
          </div>
          <button
            onClick={onClearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-950/60 dark:text-rose-300 rounded text-xs border border-rose-200 dark:border-rose-900/50 transition-colors shrink-0 font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Purge All Records</span>
          </button>
        </div>
      </div>
    </div>
  );
};
