"use client";

import { useEffect, useState } from 'react';
import KPIBoard from '@/components/KPIBoard';
import DigitalTwin from '@/components/DigitalTwin';
import EnergyChart from '@/components/EnergyChart';
import TempChart from '@/components/TempChart';
import LogViewer from '@/components/LogViewer';
import AgentPipeline from '@/components/AgentPipeline';
import { Leaf, Activity, BarChart2 } from 'lucide-react';

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<'dashboard' | 'pipeline'>('dashboard');
  const [results, setResults] = useState<any>(null);
  const [baseData, setBaseData] = useState<any[]>([]);
  const [optData, setOptData] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const t = Date.now();
      const [resData, baseRes, optRes, actRes] = await Promise.all([
        fetch(`/api/data?type=results&t=${t}`).then(r => r.json()).catch(() => null),
        fetch(`/api/data?type=baseline&t=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/data?type=optimized&t=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/data?type=actions&t=${t}`).then(r => r.json()).catch(() => [])
      ]);

      if (resData && !resData.error) setResults(resData);
      if (Array.isArray(baseRes)) setBaseData(baseRes);
      if (Array.isArray(optRes)) setOptData(optRes);
      if (Array.isArray(actRes)) setActions(actRes);
      
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 10 seconds if simulation is running
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-600/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto px-6 lg:px-8 py-8 w-full max-w-[1800px]">
        {/* Header */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <Leaf className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Eco-Loop <span className="text-emerald-400 font-light">Agents</span></h1>
              <p className="text-slate-400 text-sm">Autonomous Building Energy Optimization</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-700/50">
              <button 
                onClick={() => setViewMode('dashboard')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'dashboard' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <BarChart2 size={16} /> Analytics
              </button>
              <button 
                onClick={() => setViewMode('pipeline')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'pipeline' ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <Activity size={16} /> Pipeline
              </button>
            </div>
            
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-sm font-medium text-emerald-400">AI Active</span>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mr-3"></div>
            Loading simulation data...
          </div>
        ) : (
          <>
            {/* KPI Section */}
            <KPIBoard results={results} />

            {/* Conditional Views */}
            {viewMode === 'dashboard' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column - Charts */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-slate-900/40 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-xl">
                    <h2 className="text-lg font-semibold text-slate-200 mb-4">Energy Profile (Baseline vs AI)</h2>
                    <EnergyChart baseData={baseData} optData={optData} />
                  </div>
                  
                  <div className="bg-slate-900/40 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-xl">
                    <h2 className="text-lg font-semibold text-slate-200 mb-4">Zone Temperatures & AI Setpoints</h2>
                    <TempChart optData={optData} />
                  </div>
                </div>

                {/* Right Column - 3D & Logs */}
                <div className="space-y-6 flex flex-col">
                  <DigitalTwin latestData={optData[optData.length - 1]} />
                  <LogViewer actions={actions} />
                </div>
              </div>
            ) : (
              <AgentPipeline 
                latestData={optData[optData.length - 1]} 
                latestAction={actions[actions.length - 1]} 
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
