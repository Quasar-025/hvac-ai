"use client";

import { Activity } from 'lucide-react';

interface LogViewerProps {
  actions: any[];
}

export default function LogViewer({ actions }: LogViewerProps) {
  return (
    <div className="bg-slate-900/40 backdrop-blur-md border border-slate-700/50 rounded-2xl flex flex-col h-full shadow-xl">
      <div className="p-5 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
          <Activity className="text-blue-500" size={20} />
          AI Control Log
        </h2>
        <span className="text-xs font-medium text-slate-500 bg-slate-800 px-2 py-1 rounded">Live updates</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        {!actions.length ? (
          <div className="h-full flex items-center justify-center text-slate-500 italic text-sm">
            Waiting for AI control actions...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Show reversed array for newest first */}
            {[...actions].reverse().map((act, i) => (
              <div 
                key={i} 
                className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-800/80 transition-colors relative overflow-hidden group"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-emerald-500 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="flex justify-between items-start mb-2">
                  <div className="text-xs text-slate-400 font-mono">TS: {act.timestep}</div>
                  <div className="flex gap-2 text-xs font-bold">
                    <span className="text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded">
                      H: {act.heating_setpoint}°C
                    </span>
                    <span className="text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">
                      C: {act.cooling_setpoint}°C
                    </span>
                  </div>
                </div>
                
                <div className="text-sm text-slate-300 italic">
                  "{act.reasoning || 'No reasoning provided.'}"
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
