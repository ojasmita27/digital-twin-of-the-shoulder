/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResearchCase, PatientDemographics, MorphometricMeasurements, ImplantPlanningConfig } from '../types/case';

const CASES_STORAGE_KEY = 'dts_cases_store_v1';
const ACTIVE_CASE_KEY = 'dts_active_case_id_v1';

export const DEMO_CASE: ResearchCase = {
  id: 'DEMO-SHL-2026-0042',
  name: 'Synthetic Shoulder Reference (Right)',
  createdAt: '2026-10-12T14:30:00Z',
  updatedAt: '2026-10-14T09:15:00Z',
  isDemo: true,
  status: 'planning_in_progress',
  demographics: {
    researchSubjectId: 'SYNTH-SUBJ-0042',
    ageBand: '61-75',
    biologicalSex: 'male',
    indication: 'Primary Osteoarthritis',
    affectedSide: 'right',
  },
  imaging: {
    modality: 'CT',
    seriesInstanceUid: '1.2.840.113619.2.55.3.2831172836.721.1689230192.1',
    studyInstanceUid: '1.2.840.113619.2.55.3.2831172836.721.1689230000.0',
    sliceThicknessMm: 0.75,
    pixelSpacingMm: [0.683, 0.683],
    rows: 512,
    columns: 512,
    sliceCount: 168,
    kvp: 120,
    tubeCurrentMa: 220,
    gantryTiltDeg: 0,
    reconstructionKernel: 'BONE_PLUS',
    windowCenter: 450,
    windowWidth: 1500,
    acquisitionDate: '2026-09-28',
  },
  segmentationJob: {
    jobId: 'seg-demo-9921',
    caseId: 'DEMO-SHL-2026-0042',
    status: 'completed',
    modelName: 'TotalSegmentator-Shoulder-CT',
    modelVersion: '2.1.0-pre',
    targetStructures: ['scapula', 'humerus'],
    createdAt: '2026-10-12T15:00:00Z',
    completedAt: '2026-10-12T15:02:40Z',
    progressPercent: 100,
    logMessages: [
      '[15:00:01] Volume ingested: 512x512x168 voxels',
      '[15:00:15] Resampled to isotropic 1.0mm voxel grid',
      '[15:00:48] nnU-Net inference completed: Scapula segmented (Dice: 0.962)',
      '[15:01:22] Proximal Humerus segmented (Dice: 0.954)',
      '[15:02:10] Surface mesh extracted via Marching Cubes and Taubin smoothed',
      '[15:02:40] Artifacts persisted to geometry store',
    ],
    diceScoreScapula: 0.962,
    diceScoreHumerus: 0.954,
  },
  meshes: [
    {
      id: 'mesh-scapula-0042',
      structure: 'scapula',
      filename: 'scapula_cortex_highres.stl',
      format: 'stl',
      vertexCount: 38450,
      faceCount: 76896,
      surfaceAreaMm2: 18240,
      volumeMm3: 112400,
      isDemoMesh: true,
      provenance: 'Demo Procedural Mesh / Synthetic TotalSegmentator reconstruction',
    },
    {
      id: 'mesh-humerus-0042',
      structure: 'humerus',
      filename: 'proximal_humerus_cortex.stl',
      format: 'stl',
      vertexCount: 29810,
      faceCount: 59616,
      surfaceAreaMm2: 14120,
      volumeMm3: 94800,
      isDemoMesh: true,
      provenance: 'Demo Procedural Mesh / Synthetic TotalSegmentator reconstruction',
    },
  ],
  landmarks: [
    {
      id: 'lm-glenoid-center',
      name: 'Glenoid Center',
      structure: 'scapula',
      coordinatesMm: [14.2, -8.6, 22.4],
      provenance: 'computed_geometric',
      confidenceScore: 0.98,
      validationNotes: 'Geometric centroid of fitted best-fit glenoid face ellipse',
    },
    {
      id: 'lm-glenoid-sup',
      name: 'Superior Glenoid Rim',
      structure: 'scapula',
      coordinatesMm: [13.8, 11.2, 21.9],
      provenance: 'computed_geometric',
      confidenceScore: 0.95,
      validationNotes: 'Supraglenoid tubercle insertion margin',
    },
    {
      id: 'lm-glenoid-inf',
      name: 'Inferior Glenoid Rim',
      structure: 'scapula',
      coordinatesMm: [14.5, -28.4, 23.1],
      provenance: 'computed_geometric',
      confidenceScore: 0.96,
      validationNotes: 'Infraglenoid tubercle transition edge',
    },
    {
      id: 'lm-acromion-angle',
      name: 'Acromion Lateral Edge',
      structure: 'scapula',
      coordinatesMm: [-18.6, 24.3, 38.2],
      provenance: 'manual_annotated',
      confidenceScore: 0.99,
      validationNotes: 'Posterolateral acromial reference point',
    },
    {
      id: 'lm-coracoid-tip',
      name: 'Coracoid Process Apex',
      structure: 'scapula',
      coordinatesMm: [22.4, 18.1, 4.5],
      provenance: 'computed_geometric',
      confidenceScore: 0.94,
    },
    {
      id: 'lm-humerus-center',
      name: 'Humeral Head Center',
      structure: 'humerus',
      coordinatesMm: [38.5, -9.1, 22.8],
      provenance: 'computed_geometric',
      confidenceScore: 0.97,
      validationNotes: 'Sphere fitting residuals < 0.42mm',
    },
  ],
  measurements: {
    glenoidVersionDeg: -7.8, // 7.8 deg retroverted
    glenoidInclinationDeg: 5.4, // 5.4 deg superior tilt (Beta angle)
    glenoidHeightMm: 37.6,
    glenoidWidthMm: 27.2,
    glenoidSubchondralDepthMm: 14.8,
    walchClassification: 'B2',
    humeralHeadDiameterMm: 46.2,
    humeralNeckShaftAngleDeg: 134.5,
    humeralRetroversionDeg: -28.2,
    humeralHeadOffsetMm: 6.8,
    calculationAlgorithm: 'Friedman Axis & Maurer Beta Vector (ISO-10328 / ISB Standard)',
    validationStatus: 'benchmark_verified',
  },
  implantPlan: {
    procedureType: 'reverse_tsa',
    glenoidComponent: {
      system: 'Orthopedic Research Modular System (RMS)',
      type: 'baseplate_glenosphere',
      sizeMm: 39,
      lateralizationMm: 4,
      inferiorTiltDeg: 5,
      versionCorrectionDeg: 6,
      implantOffsetMm: [14.2, -8.6, 22.4],
    },
    humeralComponent: {
      system: 'Orthopedic Research Modular System (RMS)',
      stemSize: 'Size 3 (10mm x 120mm)',
      stemInclinationDeg: 145,
      humeralTrayLateralizationMm: 2,
      humeralInsertThicknessMm: 6,
    },
    notes: 'Severe posterior glenoid erosion (Walch B2) corrected with 4mm lateralized baseplate and 5 deg inferior tilt to reduce inferior scapular notching.',
    planningApprovedBy: 'Research Fellow Dr. A. Vance',
  },
  reports: [
    {
      reportId: 'REP-2026-0042-01',
      caseId: 'DEMO-SHL-2026-0042',
      title: 'Preoperative Surgical Reconstruction Summary',
      generatedAt: '2026-10-14T10:00:00Z',
      summary: 'Computerized anatomical reconstruction and Reverse Total Shoulder Arthroplasty (rTSA) digital plan for Walch B2 glenoid morphology.',
      imagingSummary: 'Axial CT (168 slices, 0.75mm slice thickness, Bone Plus kernel). Clear subchondral sclerosis and posterior glenoid bone loss.',
      reconstructionSummary: 'High-resolution surface mesh extraction complete. Best-fit sphere to humeral head showed 46.2mm diameter with 0.38mm RMSE.',
      keyFindings: [
        'Glenoid Retroversion: -7.8° (moderate retroversion requiring reaming/augmented baseplate)',
        'Glenoid Inclination: +5.4° (mild superior inclination)',
        'Walch B2 biconcave glenoid with posterior subluxation of the humeral head',
        'Humeral neck-shaft angle: 134.5° (anatomical standard)',
      ],
      recommendationDisclaimer: 'RESEARCH PROTOTYPE ONLY: This digital twin analysis is for educational and biomechanical research investigation. Not approved for direct clinical diagnostic or surgical execution without independent institutional validation.',
      validationWarnings: [
        'Humeral osteophyte presence may slightly overestimate anatomic neck radius',
        'Scapular reference plane aligned to friedman axis, not 3D vault-adjusted plane',
      ],
    },
  ],
};

class CaseStorageService {
  private cases: Map<string, ResearchCase> = new Map();
  private activeCaseId: string | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.init();
  }

  private init() {
    try {
      const stored = localStorage.getItem(CASES_STORAGE_KEY);
      if (stored) {
        const parsed: ResearchCase[] = JSON.parse(stored);
        parsed.forEach((c) => this.cases.set(c.id, c));
      } else {
        // Initialize with the standard DEMO case so user has immediate access to inspectable 3D and CT views
        this.cases.set(DEMO_CASE.id, DEMO_CASE);
        this.persist();
      }

      const active = localStorage.getItem(ACTIVE_CASE_KEY);
      if (active && this.cases.has(active)) {
        this.activeCaseId = active;
      } else if (this.cases.size > 0) {
        this.activeCaseId = Array.from(this.cases.keys())[0];
      }
    } catch {
      this.cases.set(DEMO_CASE.id, DEMO_CASE);
      this.activeCaseId = DEMO_CASE.id;
    }
  }

  private persist() {
    try {
      const array = Array.from(this.cases.values());
      localStorage.setItem(CASES_STORAGE_KEY, JSON.stringify(array));
      if (this.activeCaseId) {
        localStorage.setItem(ACTIVE_CASE_KEY, this.activeCaseId);
      }
      this.notify();
    } catch (e) {
      console.warn('Storage persistence failed', e);
    }
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  public getAllCases(): ResearchCase[] {
    return Array.from(this.cases.values());
  }

  public getCase(id: string): ResearchCase | undefined {
    return this.cases.get(id);
  }

  public getActiveCase(): ResearchCase | null {
    if (!this.activeCaseId) return null;
    return this.cases.get(this.activeCaseId) || null;
  }

  public setActiveCaseId(id: string) {
    if (this.cases.has(id)) {
      this.activeCaseId = id;
      this.persist();
    }
  }

  public addOrUpdateCase(c: ResearchCase) {
    this.cases.set(c.id, c);
    this.activeCaseId = c.id;
    this.persist();
  }

  public setCases(newCases: ResearchCase[]) {
    this.cases.clear();
    newCases.forEach((c) => this.cases.set(c.id, c));
    if (this.activeCaseId && !this.cases.has(this.activeCaseId)) {
      this.activeCaseId = newCases.length > 0 ? newCases[0].id : null;
    } else if (!this.activeCaseId && newCases.length > 0) {
      this.activeCaseId = newCases[0].id;
    }
    this.persist();
  }

  public createCase(input: {
    name: string;
    demographics: PatientDemographics;
    isDemo?: boolean;
  }): ResearchCase {
    const timestamp = Date.now().toString(36).toUpperCase();
    const id = `SHL-2026-${timestamp}`;
    const newCase: ResearchCase = {
      id,
      name: input.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: !!input.isDemo,
      status: 'created',
      demographics: input.demographics,
      meshes: [],
      landmarks: [],
      reports: [],
    };
    this.cases.set(id, newCase);
    this.activeCaseId = id;
    this.persist();
    return newCase;
  }

  public updateCase(id: string, updates: Partial<ResearchCase>): ResearchCase | null {
    const existing = this.cases.get(id);
    if (!existing) return null;
    const updated: ResearchCase = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.cases.set(id, updated);
    this.persist();
    return updated;
  }

  public deleteCase(id: string): boolean {
    const deleted = this.cases.delete(id);
    if (deleted) {
      if (this.activeCaseId === id) {
        const remaining = Array.from(this.cases.keys());
        this.activeCaseId = remaining.length > 0 ? remaining[0] : null;
      }
      this.persist();
    }
    return deleted;
  }

  public resetToDemo(): void {
    this.cases.clear();
    this.cases.set(DEMO_CASE.id, DEMO_CASE);
    this.activeCaseId = DEMO_CASE.id;
    this.persist();
  }

  public clearAllCases(): void {
    this.cases.clear();
    this.activeCaseId = null;
    this.persist();
  }
}

export const caseStorage = new CaseStorageService();
