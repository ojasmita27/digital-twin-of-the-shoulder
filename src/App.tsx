/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { NavRoute, Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { CreateCaseModal } from './components/layout/CreateCaseModal';
import { SystemNotificationsDrawer, SystemNotification } from './components/layout/SystemNotificationsDrawer';
import { caseStorage, DEMO_CASE } from './services/caseStorage';
import { apiClient } from './services/apiClient';
import { ResearchCase } from './types/case';

// Views
import { OverviewView } from './components/views/OverviewView';
import { CasesView } from './components/views/CasesView';
import { Anatomy3DView } from './components/views/Anatomy3DView';
import { ImagingView } from './components/views/ImagingView';
import { SegmentationView } from './components/views/SegmentationView';
import { MeasurementsView } from './components/views/MeasurementsView';
import { ImplantPlanningView } from './components/views/ImplantPlanningView';
import { ReportsView } from './components/views/ReportsView';
import { ResearchDatasetsView } from './components/views/ResearchDatasetsView';
import { SettingsView } from './components/views/SettingsView';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<NavRoute>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [cases, setCases] = useState<ResearchCase[]>(caseStorage.getAllCases());
  const [activeCase, setActiveCase] = useState<ResearchCase | null>(caseStorage.getActiveCase());

  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const [notifications, setNotifications] = useState<SystemNotification[]>([
    {
      id: 'notif-init',
      type: 'info',
      title: 'Platform Initialized',
      message: 'Digital Twin of the Shoulder research workstation ready. WebGL viewport calibrated.',
      timestamp: new Date().toLocaleTimeString(),
      provenanceModule: 'Core Client Engine',
    },
    {
      id: 'notif-case-loaded',
      type: 'success',
      title: 'Synthetic Reference Case Mounted',
      message: 'Synthetic shoulder CT series (168 slices) and pre-segmented cortical meshes ready for inspection.',
      timestamp: new Date().toLocaleTimeString(),
      provenanceModule: 'Local Storage Provider',
    },
  ]);

  // Fetch real cases from GET /api/cases
  const fetchCases = async () => {
    setIsLoadingCases(true);
    setBackendError(null);
    const res = await apiClient.getCases();
    setIsLoadingCases(false);

    if (res.data) {
      setBackendError(null);
      // Synchronize backend cases with store while preserving DEMO_CASE
      const backendCases = res.data;
      const combined = [...backendCases];
      if (!combined.some((c) => c.id === DEMO_CASE.id)) {
        combined.push(DEMO_CASE);
      }
      caseStorage.setCases(combined);
      addNotification(
        'success',
        'Backend Cases Synchronized',
        `Successfully fetched ${backendCases.length} case(s) from GET /api/cases`,
        'FastAPI Backend'
      );
    } else {
      setBackendError(
        res.error ||
          (apiClient.getConfig().baseUrl
            ? `FastAPI connection failed (${apiClient.getConfig().baseUrl}). Server appears offline.`
            : 'FastAPI backend is not connected. Configure your backend URL in Settings.')
      );
    }
  };

  // Subscribe to case storage mutations
  useEffect(() => {
    const unsubscribe = caseStorage.subscribe(() => {
      const allCases = caseStorage.getAllCases();
      setCases(allCases);
      setActiveCase(caseStorage.getActiveCase());
    });
    return unsubscribe;
  }, []);

  // Auto-fetch cases whenever backend becomes connected or on initial mount
  useEffect(() => {
    let previousStatus: string | null = null;
    const unsubscribe = apiClient.subscribeHealth((state) => {
      if (state.status === 'connected' && previousStatus !== 'connected') {
        fetchCases();
      } else if (state.status === 'unreachable') {
        setBackendError(state.error || 'FastAPI backend is disconnected.');
      }
      previousStatus = state.status;
    });
    return unsubscribe;
  }, []);

  const handleSelectCase = async (caseId: string) => {
    caseStorage.setActiveCaseId(caseId);
    setActiveCase(caseStorage.getActiveCase());
    addNotification('info', 'Case Switched', `Active case changed to ${caseId}`, 'Case Registry');

    // If real backend case, fetch fresh details from GET /api/cases/{case_id}
    if (caseId !== DEMO_CASE.id) {
      const res = await apiClient.getCaseById(caseId);
      if (res.data) {
        caseStorage.addOrUpdateCase(res.data);
        setActiveCase(res.data);
      }
    }
  };

  const handleCaseCreated = (newCase: ResearchCase) => {
    caseStorage.addOrUpdateCase(newCase);
    setActiveCase(newCase);
    addNotification(
      'success',
      'Research Case Created (POST /api/cases)',
      `Subject ${newCase.demographics.researchSubjectId} registered on backend with ID: ${newCase.id}`,
      'FastAPI Backend'
    );
    fetchCases();
  };

  const handleDeleteCase = async (caseId: string) => {
    if (caseId === DEMO_CASE.id) {
      caseStorage.deleteCase(caseId);
      addNotification('warning', 'Demo Case Removed', 'Synthetic baseline removed from view.', 'Storage');
      return;
    }

    const res = await apiClient.deleteCase(caseId);
    if (res.error) {
      addNotification(
        'warning',
        'Backend Delete Failed',
        `Could not delete case ${caseId}: ${res.error}`,
        'FastAPI Backend'
      );
    } else {
      caseStorage.deleteCase(caseId);
      addNotification(
        'info',
        'Case Deleted (DELETE /api/cases)',
        `Removed case ${caseId} from backend memory.`,
        'FastAPI Backend'
      );
      fetchCases();
    }
  };

  const handleResetDemo = () => {
    caseStorage.resetToDemo();
    addNotification('info', 'Demo Baseline Restored', 'Re-initialized standard synthetic shoulder model.', 'Storage');
  };

  const handleClearAll = () => {
    caseStorage.clearAllCases();
    addNotification('warning', 'All Cases Cleared', 'Empty state verification mode active.', 'Storage');
  };

  const addNotification = (
    type: 'info' | 'success' | 'warning',
    title: string,
    message: string,
    provenanceModule?: string
  ) => {
    const newNotif: SystemNotification = {
      id: `notif-${Date.now()}`,
      type,
      title,
      message,
      timestamp: new Date().toLocaleTimeString(),
      provenanceModule,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100/60 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans transition-colors">
      {/* Sidebar Navigation */}
      <Sidebar
        currentRoute={currentRoute}
        onRouteChange={setCurrentRoute}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Bar Navigation */}
        <TopBar
          currentRoute={currentRoute}
          onRouteChange={setCurrentRoute}
          activeCase={activeCase}
          cases={cases}
          onSelectCase={handleSelectCase}
          onOpenCreateCaseModal={() => setCreateModalOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          unreadNotificationsCount={notifications.length}
        />

        {/* Viewport Canvas Area */}
        <main className="flex-1 overflow-y-auto px-6 py-5 bg-slate-100/60 dark:bg-slate-950 transition-colors">
          {currentRoute === 'overview' && (
            <OverviewView
              cases={cases}
              activeCase={activeCase}
              onSelectCase={handleSelectCase}
              onNavigate={setCurrentRoute}
              onOpenCreateModal={() => setCreateModalOpen(true)}
              onResetDemo={handleResetDemo}
              isLoading={isLoadingCases}
              backendError={backendError}
              onRefresh={fetchCases}
            />
          )}

          {currentRoute === 'cases' && (
            <CasesView
              cases={cases}
              activeCase={activeCase}
              onSelectCase={handleSelectCase}
              onNavigate={setCurrentRoute}
              onOpenCreateModal={() => setCreateModalOpen(true)}
              onDeleteCase={handleDeleteCase}
              isLoading={isLoadingCases}
              backendError={backendError}
              onRefresh={fetchCases}
            />
          )}

          {currentRoute === 'imaging' && (
            <ImagingView
              activeCase={activeCase}
              onNavigateToAnatomy={() => setCurrentRoute('anatomy3d')}
              onUpdateImaging={(meta) => {
                if (activeCase) {
                  caseStorage.updateCase(activeCase.id, {
                    imaging: meta,
                    status: 'imaging_imported',
                  });
                  addNotification('success', 'CT Series Ingested', `${meta.sliceCount} slices mapped.`, 'DICOM Parser');
                }
              }}
            />
          )}

          {currentRoute === 'segmentation' && (
            <SegmentationView
              activeCase={activeCase}
              onNavigateToAnatomy={() => setCurrentRoute('anatomy3d')}
            />
          )}

          {currentRoute === 'anatomy3d' && (
            <Anatomy3DView
              activeCase={activeCase}
              onUpdateCaseLandmarks={(landmarks) => {
                if (activeCase) {
                  caseStorage.updateCase(activeCase.id, { landmarks });
                }
              }}
            />
          )}

          {currentRoute === 'measurements' && (
            <MeasurementsView activeCase={activeCase} />
          )}

          {currentRoute === 'planning' && (
            <ImplantPlanningView
              activeCase={activeCase}
              onUpdatePlan={(plan) => {
                if (activeCase) {
                  caseStorage.updateCase(activeCase.id, {
                    implantPlan: plan,
                    status: 'planning_in_progress',
                  });
                  addNotification('success', 'Plan Saved', `Glenosphere ${plan.glenoidComponent.sizeMm}mm`, 'Implant Planner');
                }
              }}
            />
          )}

          {currentRoute === 'reports' && (
            <ReportsView activeCase={activeCase} />
          )}

          {currentRoute === 'research' && (
            <ResearchDatasetsView />
          )}

          {currentRoute === 'settings' && (
            <SettingsView
              onResetDemo={handleResetDemo}
              onClearAll={handleClearAll}
            />
          )}
        </main>
      </div>

      {/* Case Creation Modal */}
      <CreateCaseModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCaseCreated={handleCaseCreated}
      />

      {/* System Notifications & Audit Drawer */}
      <SystemNotificationsDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        onClear={() => setNotifications([])}
      />
    </div>
  );
}
