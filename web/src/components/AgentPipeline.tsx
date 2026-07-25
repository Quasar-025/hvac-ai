"use client";

import { useState, useEffect } from 'react';
import { Cpu, Server, Activity, ArrowRight, Zap, Database } from 'lucide-react';

interface AgentPipelineProps {
  latestData: any;
  latestAction: any;
}

export default function AgentPipeline({ latestData, latestAction }: AgentPipelineProps) {
  // Simple animation states
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(p => !p);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const safeData = latestData || {};
  const safeAction = latestAction || {};

  return (
    <div className="w-full min-h-[500px] flex flex-col items-center justify-center p-8 bg-slate-900/40 backdrop-blur-md border border-slate-700/50 rounded-2xl shadow-xl mt-6">
      <div className="text-center mb-12">
        <h2 className="text-2xl font-bold text-white tracking-tight">Closed-Loop Execution Framework</h2>
        <p className="text-slate-400 mt-2">True Runtime Forward-Injection Pipeline</p>
      </div>

      <div className="flex flex-col lg:flex-row items-stretch justify-center w-full gap-4 max-w-6xl">
        
        {/* Node 1: EnergyPlus Engine */}
        <div className="flex-1 bg-slate-800/80 border border-slate-600 rounded-xl p-6 relative overflow-hidden group hover:border-blue-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
          <div className="flex items-center gap-3 mb-4 text-blue-400">
            <Database size={24} />
            <h3 className="font-semibold text-lg text-white">EnergyPlus Physics Engine</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">Continuous PyEnergyPlus Simulation</p>
          
          <div className="bg-slate-950 p-4 rounded-lg font-mono text-xs text-blue-300 overflow-y-auto max-h-48 custom-scrollbar">
            {'{'}
            <div className="pl-4">
              <span className="text-blue-400">"timestamp":</span> <span className="text-emerald-400">"{safeData.timestamp || 'N/A'}"</span>,<br/>
              <span className="text-blue-400">"outdoor_temp":</span> <span className="text-emerald-400">{safeData.outdoor_temp_c || 0}</span>,<br/>
              <span className="text-blue-400">"avg_co2_ppm":</span> <span className="text-emerald-400">{
                safeData.zones ? 
                Math.round(Object.values(safeData.zones).reduce((acc: any, z: any) => acc + (z.co2_ppm || 0), 0) / 5) : 400
              }</span>,<br/>
              <span className="text-blue-400">"grid_carbon_g_kwh":</span> <span className="text-emerald-400">{safeData.grid_carbon_intensity_g_kwh || 300}</span>,<br/>
              <span className="text-slate-500">// ... 5-zone telemetry</span>
            </div>
            {'}'}
          </div>
        </div>

        {/* Stream 1 */}
        <div className="flex lg:flex-col items-center justify-center py-4 lg:py-0 lg:px-2">
          <div className={`flex flex-col items-center text-emerald-500 transition-opacity duration-500 ${pulse ? 'opacity-100' : 'opacity-40'}`}>
            <span className="text-[10px] font-bold uppercase tracking-widest mb-2 hidden lg:block text-slate-400">Feedback</span>
            <ArrowRight size={32} className="hidden lg:block animate-pulse" />
            <div className="w-1 h-8 lg:hidden bg-emerald-500 rounded animate-pulse"></div>
          </div>
        </div>

        {/* Node 2: LLM Agent */}
        <div className="flex-1 bg-slate-800/80 border border-slate-600 rounded-xl p-6 relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
          <div className="flex items-center gap-3 mb-4 text-emerald-400">
            <Cpu size={24} />
            <h3 className="font-semibold text-lg text-white">Qwen 9B Agent</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">Reasoning against Comfort & Carbon Targets</p>
          
          <div className="bg-slate-950 p-4 rounded-lg text-xs text-slate-300 max-h-48 overflow-y-auto italic border-l-2 border-emerald-500">
            "{safeAction.reasoning || "Analyzing zone thermal inertia and carbon grid signals to determine optimal ECM setpoints..."}"
          </div>
        </div>

        {/* Stream 2 */}
        <div className="flex lg:flex-col items-center justify-center py-4 lg:py-0 lg:px-2">
          <div className={`flex flex-col items-center text-purple-500 transition-opacity duration-500 ${!pulse ? 'opacity-100' : 'opacity-40'}`}>
            <span className="text-[10px] font-bold uppercase tracking-widest mb-2 hidden lg:block text-slate-400">Forward Injection</span>
            <ArrowRight size={32} className="hidden lg:block animate-pulse" />
            <div className="w-1 h-8 lg:hidden bg-purple-500 rounded animate-pulse"></div>
          </div>
        </div>

        {/* Node 3: Actuator Setpoints */}
        <div className="flex-1 bg-slate-800/80 border border-slate-600 rounded-xl p-6 relative overflow-hidden group hover:border-purple-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-full h-1 bg-purple-500"></div>
          <div className="flex items-center gap-3 mb-4 text-purple-400">
            <Zap size={24} />
            <h3 className="font-semibold text-lg text-white">Runtime Injector</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">Dynamic Setpoint Memory Injection</p>
          
          <div className="bg-slate-950 p-4 rounded-lg font-mono text-xs text-purple-300 overflow-y-auto max-h-48">
            {'{'}
            <div className="pl-4">
              <span className="text-purple-400">"action":</span> <span className="text-emerald-400">"SETPOINT_OVERRIDE"</span>,<br/>
              <span className="text-purple-400">"heating_c":</span> <span className="text-emerald-400">{safeAction.htg_setpoint_c || 22.2}</span>,<br/>
              <span className="text-purple-400">"cooling_c":</span> <span className="text-emerald-400">{safeAction.clg_setpoint_c || 23.9}</span><br/>
            </div>
            {'}'}
          </div>
        </div>

      </div>
    </div>
  );
}
