/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { PatientDemographics, ResearchCase } from '../../types/case';
import { caseStorage } from '../../services/caseStorage';
import { apiClient } from '../../services/apiClient';
import { X, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';

interface CreateCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaseCreated: (newCase: ResearchCase) => void;
}

export const CreateCaseModal: React.FC<CreateCaseModalProps> = ({
  isOpen,
  onClose,
  onCaseCreated,
}) => {
  const [name, setName] = useState('');
  const [subjectId, setSubjectId] = useState(`SUBJ-${Math.floor(1000 + Math.random() * 9000)}`);
  const [ageBand, setAgeBand] = useState<PatientDemographics['ageBand']>('61-75');
  const [biologicalSex, setBiologicalSex] = useState<PatientDemographics['biologicalSex']>('female');
  const [indication, setIndication] = useState<PatientDemographics['indication']>('Primary Osteoarthritis');
  const [affectedSide, setAffectedSide] = useState<PatientDemographics['affectedSide']>('right');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    const payload = {
      name: name.trim() || `Research Case ${subjectId}`,
      demographics: {
        researchSubjectId: subjectId,
        ageBand,
        biologicalSex,
        indication,
        affectedSide,
      },
      isDemo: false,
    };

    const result = await apiClient.createCase(payload);
    setIsSubmitting(false);

    if (result.data) {
      caseStorage.addOrUpdateCase(result.data);
      onCaseCreated(result.data);
      onClose();
    } else {
      setSubmitError(
        result.error ||
          `Failed to create case: FastAPI backend is disconnected. Configure your backend URL in Settings.`
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Create Research Case</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Initialize a de-identified orthopedic subject for CT ingestion and 3D modeling.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
              Case Display Title
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Post-traumatic Glenohumeral Arthritis Study"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-hidden focus:border-teal-500 dark:focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                De-identified Subject ID
              </label>
              <input
                type="text"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 font-mono text-[11px] focus:outline-hidden focus:border-teal-500 dark:focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                Affected Anatomy Side
              </label>
              <select
                value={affectedSide}
                onChange={(e) => setAffectedSide(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-teal-500 dark:focus:border-cyan-500"
              >
                <option value="right">Right Shoulder</option>
                <option value="left">Left Shoulder</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                Age Demographic Band
              </label>
              <select
                value={ageBand}
                onChange={(e) => setAgeBand(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-teal-500 dark:focus:border-cyan-500"
              >
                <option value="18-40">18 - 40 years</option>
                <option value="41-60">41 - 60 years</option>
                <option value="61-75">61 - 75 years</option>
                <option value="75+">75+ years</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                Biological Sex
              </label>
              <select
                value={biologicalSex}
                onChange={(e) => setBiologicalSex(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-teal-500 dark:focus:border-cyan-500"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="undisclosed">Undisclosed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
              Orthopedic Pathology / Indication
            </label>
            <select
              value={indication}
              onChange={(e) => setIndication(e.target.value as any)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-teal-500 dark:focus:border-cyan-500"
            >
              <option value="Primary Osteoarthritis">Primary Osteoarthritis</option>
              <option value="Rotator Cuff Tear Arthropathy">Rotator Cuff Tear Arthropathy (CTA)</option>
              <option value="Proximal Humerus Fracture">Proximal Humerus Fracture (3-part / 4-part)</option>
              <option value="Avascular Necrosis">Avascular Necrosis (AVN)</option>
              <option value="Revision Arthroplasty">Revision Arthroplasty</option>
              <option value="Research Normative">Research Normative Control</option>
            </select>
          </div>

          {submitError && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded text-[11px] text-rose-800 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-rose-900 dark:text-rose-200">Backend Communication Error</div>
                <div className="leading-relaxed">{submitError}</div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] text-slate-600 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-cyan-400 shrink-0 mt-0.5" />
            <span>
              HIPAA & GDPR Compliance: Store non-identifying research identifiers only. No patient names, dates of birth, or geographic identifiers are persisted.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 dark:bg-cyan-400 dark:hover:bg-cyan-300 dark:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Submitting to Backend...</span>
                </>
              ) : (
                <span>Create Case (POST /api/cases)</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
