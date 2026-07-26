"use client";

import { Activity } from 'lucide-react';

interface LogViewerProps {
  actions: any[];
}

export default function LogViewer({ actions }: LogViewerProps) {
  return (
    <div className="glass-card flex flex-col h-full">
      <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--divider)' }}>
        <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Activity size={20} style={{ color: 'var(--accent-primary)' }} />
          AI Control Log
        </h2>
        <span
          className="text-[10px] font-medium px-2 py-1 rounded-md"
          style={{ background: 'var(--glass-bg)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }}
        >
          Live updates
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        {!actions.length ? (
          <div className="h-full flex items-center justify-center italic text-sm" style={{ color: 'var(--text-muted)' }}>
            Waiting for AI control actions...
          </div>
        ) : (
          <div className="space-y-3">
            {/* Show reversed array for newest first */}
            {[...actions].reverse().slice(0, 30).map((act, i) => (
              <div 
                key={i} 
                className="glass-surface rounded-xl p-3.5 relative overflow-hidden group"
                style={{ transition: 'all 0.2s ease' }}
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-[2px] opacity-40 group-hover:opacity-100 transition-opacity"
                  style={{ background: `linear-gradient(to bottom, var(--accent-primary), var(--accent-secondary))` }}
                />
                
                <div className="flex justify-between items-start mb-1.5 pl-2">
                  <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    TS: {act.timestep}
                  </div>
                  <div className="flex gap-1.5 text-[10px] font-bold">
                    <span
                      className="px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(251, 191, 36, 0.08)', color: 'var(--accent-warning)' }}
                    >
                      H: {act.heating_setpoint}°C
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--accent-primary-dim)', color: 'var(--accent-primary)' }}
                    >
                      C: {act.cooling_setpoint}°C
                    </span>
                  </div>
                </div>
                
                <div className="text-xs italic pl-2" style={{ color: 'var(--text-secondary)' }}>
                  &quot;{act.reasoning || 'No reasoning provided.'}&quot;
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
