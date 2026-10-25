/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, CheckCircle2, AlertTriangle, Info, Terminal } from 'lucide-react';

export interface SystemNotification {
  id: string;
  type: 'info' | 'success' | 'warning';
  title: string;
  message: string;
  timestamp: string;
  provenanceModule?: string;
}

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: SystemNotification[];
  onClear: () => void;
}

export const SystemNotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onClear,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-100">System & Pipeline Audit Log</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action bar */}
        <div className="px-5 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-xs">
          <span className="text-[11px] font-mono text-slate-400">
            {notifications.length} logged events
          </span>
          {notifications.length > 0 && (
            <button
              onClick={onClear}
              className="text-[11px] text-slate-400 hover:text-slate-200 hover:underline"
            >
              Clear Log
            </button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No new notifications or system warnings.
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                className="bg-slate-950/80 border border-slate-800 p-3 rounded text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-medium text-slate-200">
                    {item.type === 'success' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    {item.type === 'warning' && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    {item.type === 'info' && (
                      <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    )}
                    <span>{item.title}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {item.timestamp}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">{item.message}</p>
                {item.provenanceModule && (
                  <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
                    Module: {item.provenanceModule}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
