"use client";

import { Zap, TrendingDown, Thermometer, Battery } from 'lucide-react';

interface KPIProps {
  results: any;
}

export default function KPIBoard({ results }: KPIProps) {
  if (!results) return null;

  const savings = results.savings || {};
  const comfort = results.comfort || {};

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      
      {/* Energy Saved Card */}
      <div className="bg-slate-900/40 backdrop-blur-md border border-emerald-500/30 rounded-2xl p-6 shadow-[0_0_30px_rgba(16,185,129,0.1)] relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
        <div className="absolute -right-6 -top-6 text-emerald-500/10 group-hover:text-emerald-500/20 transition-colors">
          <TrendingDown size={120} />
        </div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Energy Saved</h3>
        <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 to-teal-200 mb-1">
          {savings.energy_saved_kwh?.toFixed(1) || '--'} <span className="text-lg font-bold text-emerald-500">kWh</span>
        </div>
        <div className="text-sm text-emerald-400/80 font-medium">
          {savings.energy_savings_pct?.toFixed(1) || '--'}% reduction vs baseline
        </div>
      </div>

      {/* Baseline Energy Card */}
      <div className="bg-slate-900/40 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-slate-600 transition-colors">
        <div className="absolute -right-6 -top-6 text-slate-700/30 group-hover:text-slate-600/50 transition-colors">
          <Battery size={120} />
        </div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Baseline Energy</h3>
        <div className="text-3xl font-bold text-slate-200 mb-1">
          {savings.baseline_kwh?.toFixed(1) || '--'} kWh
        </div>
        <div className="text-sm text-slate-500">
          Standard rule-based control
        </div>
      </div>

      {/* Optimized Energy Card */}
      <div className="bg-slate-900/40 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-slate-600 transition-colors">
        <div className="absolute -right-6 -top-6 text-blue-500/10 group-hover:text-blue-500/20 transition-colors">
          <Zap size={120} />
        </div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">AI Optimized Energy</h3>
        <div className="text-3xl font-bold text-slate-200 mb-1">
          {savings.optimized_kwh?.toFixed(1) || '--'} kWh
        </div>
        <div className="text-sm text-slate-500">
          Agentic dynamic control
        </div>
      </div>

      {/* Thermal Comfort Card */}
      <div className="bg-slate-900/40 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-slate-600 transition-colors">
        <div className="absolute -right-6 -top-6 text-orange-500/10 group-hover:text-orange-500/20 transition-colors">
          <Thermometer size={120} />
        </div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Thermal Comfort</h3>
        <div className="text-3xl font-bold text-slate-200 mb-1">
          {comfort.optimized_comfort_pct?.toFixed(1) || '--'}%
        </div>
        <div className="text-sm text-slate-500">
          Time within bounds (20-25°C)
        </div>
      </div>

    </div>
  );
}
