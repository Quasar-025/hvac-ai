"use client";

import { useEffect, useState } from 'react';
import KPIBoard from '@/components/KPIBoard';
import DigitalTwin from '@/components/DigitalTwin';
import EnergyChart from '@/components/EnergyChart';
import TempChart from '@/components/TempChart';
import LogViewer from '@/components/LogViewer';
import AgentPipeline from '@/components/AgentPipeline';
import ThemeToggle from '@/components/ThemeToggle';
import { SSEProvider, useSSE } from '@/components/SSEProvider';
import { Leaf, Activity, BarChart2 } from 'lucide-react';

function DashboardContent() {
  const [viewMode, setViewMode] = useState<'dashboard' | 'pipeline'>('dashboard');
  const [results, setResults] = useState<any>(null);
  const [baseData, setBaseData] = useState<any[]>([]);
  const [optData, setOptData] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const sse = useSSE();

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
    <main className="min-h-screen font-sans" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Ambient Background */}
      <div className="ambient-bg" />

      <div className="relative z-10 mx-auto px-6 lg:px-8 py-8 w-full max-w-[1800px]">
        {/* Header */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                boxShadow: '0 0 24px var(--accent-primary-dim)',
              }}
            >
              <Leaf className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Eco-Loop <span style={{ color: 'var(--accent-primary)', fontWeight: 300 }}>Agents</span>
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Autonomous Building Energy Optimization
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* View Mode Toggle */}
            <div className="flex p-1 rounded-xl glass-surface">
              <button 
                onClick={() => setViewMode('dashboard')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  background: viewMode === 'dashboard' ? 'var(--accent-primary-dim)' : 'transparent',
                  color: viewMode === 'dashboard' ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                }}
              >
                <BarChart2 size={16} /> Analytics
              </button>
              <button 
                onClick={() => setViewMode('pipeline')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  background: viewMode === 'pipeline' ? 'var(--accent-tertiary-dim)' : 'transparent',
                  color: viewMode === 'pipeline' ? 'var(--accent-tertiary)' : 'var(--text-tertiary)',
                }}
              >
                <Activity size={16} /> Pipeline
              </button>
            </div>

            {/* Theme Toggle */}
            <ThemeToggle />
            
            {/* Status Badge */}
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-full"
              style={{
                background: sse.connected ? 'var(--accent-secondary-dim)' : 'var(--accent-primary-dim)',
                border: `1px solid ${sse.connected ? 'var(--accent-secondary)' : 'var(--accent-primary)'}20`,
              }}
            >
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: sse.connected ? 'var(--accent-secondary)' : 'var(--accent-primary)' }}
              />
              <span className="text-sm font-medium" style={{ color: sse.connected ? 'var(--accent-secondary)' : 'var(--accent-primary)' }}>
                {sse.connected ? 'AI Live' : 'AI Active'}
              </span>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center h-64" style={{ color: 'var(--text-tertiary)' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 mr-3" style={{ borderColor: 'var(--accent-primary)' }} />
            Loading simulation data...
          </div>
        ) : (
          <>
            {/* KPI Section — use live SSE metrics during simulation, file-based results after */}
            <KPIBoard results={sse.liveMetrics || results} />

            {/* Conditional Views */}
            {viewMode === 'dashboard' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column - Charts */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                      Energy Profile (Baseline vs AI)
                    </h2>
                    <EnergyChart baseData={baseData} optData={optData} />
                  </div>
                  
                  <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                      Zone Temperatures & AI Setpoints
                    </h2>
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
              <AgentPipeline />
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function Dashboard() {
  return (
    <SSEProvider>
      <DashboardContent />
    </SSEProvider>
  );
}
