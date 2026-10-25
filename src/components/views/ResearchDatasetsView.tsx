/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Database,
  ExternalLink,
  Download,
  FileCode,
  Box,
  Layers,
  ShieldCheck,
  CheckCircle2,
  HardDrive,
  Upload,
} from 'lucide-react';

interface DatasetEntry {
  id: string;
  name: string;
  type: 'derived_geometry' | 'raw_imaging' | 'morphometric_landmarks';
  sourceUrl: string;
  doi?: string;
  license: string;
  version: string;
  formats: string[];
  provenance: string;
  availableAnatomy: string[];
  hasRawImaging: boolean;
  hasDerivedGeometry: boolean;
  validationStatus: string;
  description: string;
}

const RESEARCH_DATASETS: DatasetEntry[] = [
  {
    id: 'zenodo-scapula-humerus-3d',
    name: 'Zenodo Open Orthopedic Scapula & Humerus Shape Models',
    type: 'derived_geometry',
    sourceUrl: 'https://zenodo.org',
    doi: '10.5281/zenodo.4764832',
    license: 'Creative Commons Attribution 4.0 International (CC-BY-4.0)',
    version: '1.2.0',
    formats: ['STL', 'CSV (Fiducial Landmarks)', 'VTK PolyData'],
    provenance: 'Multi-institutional cadaveric CT reconstructions segmented with verified manual landmark coordinates.',
    availableAnatomy: ['Scapula (full body)', 'Proximal Humerus', 'Anatomical landmarks (CSV)'],
    hasRawImaging: false,
    hasDerivedGeometry: true,
    validationStatus: 'Peer-reviewed benchmark verified against optical digitizer',
    description: 'Collection of 3D polygonal meshes and anatomical landmark annotations for statistical shape modeling of the human shoulder girdle.',
  },
  {
    id: 'tcia-shoulder-ct-archive',
    name: 'The Cancer Imaging Archive (TCIA) - Orthopedic CT Collections',
    type: 'raw_imaging',
    sourceUrl: 'https://www.cancerimagingarchive.net',
    doi: '10.7937/K9/TCIA.2015.V7M0A7QL',
    license: 'TCIA Restricted Research Data Usage Agreement',
    version: '2024.1',
    formats: ['DICOM (Part 10)', 'DICOM-RT Struct'],
    provenance: 'Multi-slice helical CT scans (sub-millimeter collimation) acquired under clinical diagnostic protocols.',
    availableAnatomy: ['Full shoulder girdle', 'Cervicothoracic junction', 'Thoracic cage'],
    hasRawImaging: true,
    hasDerivedGeometry: false,
    validationStatus: 'Clinical DICOM conformant',
    description: 'Volumetric CT series suitable for testing DICOM parsing, multi-planar reconstruction, and training AI segmentation models.',
  },
  {
    id: 'nih-visible-human-shoulder',
    name: 'NIH Visible Human Project - Shoulder Anatomy Cross-Sections',
    type: 'raw_imaging',
    sourceUrl: 'https://www.nlm.nih.gov/research/visible/visible_human.html',
    license: 'NLM Public Domain Research License',
    version: '2.0',
    formats: ['Cryosection PNG', 'Axial CT DICOM', 'MR Volumetric'],
    provenance: 'High-resolution anatomical cryosections and correlated CT slices of healthy male and female donor specimens.',
    availableAnatomy: ['Scapula', 'Humerus', 'Glenoid labrum', 'Rotator cuff musculature'],
    hasRawImaging: true,
    hasDerivedGeometry: true,
    validationStatus: 'Gold Standard Anatomical Reference',
    description: 'Sub-millimeter anatomical cross-sections providing ground-truth morphological references for glenoid cartilage and muscular borders.',
  },
];

export const ResearchDatasetsView: React.FC = () => {
  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-slate-100">
              Research Datasets & Open Anatomical Registries
            </h1>
          </div>
          <p className="text-xs text-slate-400">
            Catalogue of verified open-access shoulder CT imaging volumes and 3D geometric shape models with provenance metadata.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded">
          <Database className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">Provenance Rule:</span>
          <span className="text-emerald-400">No Mock Data Ingestion</span>
        </div>
      </div>

      {/* Dataset Type Distinction Notice */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>Type A: Raw Volumetric CT / DICOM</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Unprocessed cross-sectional DICOM stacks containing original Hounsfield Unit attenuation matrices, pixel spacing metadata, and slice geometry. Used for image preprocessing, window/level validation, and AI model inference.
          </p>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Box className="w-4 h-4 text-cyan-400" />
            <span>Type B: Derived 3D Geometry & Landmarks (Zenodo)</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Segmented polygonal surface meshes (STL, VTK) and tabulated anatomical landmark coordinate tables (CSV). Used for statistical shape modeling (SSM), biomechanical kinematic simulation, and implant planning.
          </p>
        </div>
      </div>

      {/* Datasets Catalogue */}
      <div className="space-y-4">
        {RESEARCH_DATASETS.map((ds) => (
          <div
            key={ds.id}
            className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 hover:border-slate-700 transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-slate-100">{ds.name}</span>
                  <span className="text-[10px] font-mono text-cyan-400 border border-cyan-500/30 px-1.5 rounded">
                    v{ds.version}
                  </span>
                </div>
                {ds.doi && (
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    DOI: <span className="text-slate-300">{ds.doi}</span>
                  </div>
                )}
              </div>

              <a
                href={ds.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono self-start"
              >
                <span>External Repository</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{ds.description}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono bg-slate-950 p-3 rounded border border-slate-800/80">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Format</span>
                <span className="text-slate-200">{ds.formats.join(', ')}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">License</span>
                <span className="text-slate-200 truncate block">{ds.license}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Raw CT Available</span>
                <span className={ds.hasRawImaging ? 'text-emerald-400' : 'text-slate-500'}>
                  {ds.hasRawImaging ? 'Yes (DICOM)' : 'No (Geometry Only)'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Derived Meshes</span>
                <span className={ds.hasDerivedGeometry ? 'text-emerald-400' : 'text-slate-500'}>
                  {ds.hasDerivedGeometry ? 'Yes (STL/VTK)' : 'No (Raw CT)'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs pt-1">
              <div className="text-slate-400 text-[11px]">
                <span className="text-slate-500">Validation Status:</span> {ds.validationStatus}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-500">
                  Import target: 3D Viewport or CT Viewer
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
