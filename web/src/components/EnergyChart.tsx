"use client";

import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface EnergyChartProps {
  baseData: any[];
  optData: any[];
}

export default function EnergyChart({ baseData, optData }: EnergyChartProps) {
  if (!baseData.length || !optData.length) return <div className="h-[300px] flex items-center justify-center text-slate-500">Loading chart...</div>;

  const timeBase = baseData.map(d => new Date(2026, d.month - 1, d.day, d.hour, d.minute));
  const timeOpt = optData.map(d => new Date(2026, d.month - 1, d.day, d.hour, d.minute));
  
  const eBase = baseData.map(d => d.total_energy_kwh);
  const eOpt = optData.map(d => d.total_energy_kwh);

  return (
    <div className="w-full h-[300px]">
      <Plot
        data={[
          {
            x: timeBase,
            y: eBase,
            type: 'scatter',
            mode: 'lines',
            name: 'Baseline',
            line: { color: '#94a3b8', width: 2, dash: 'dot' }
          },
          {
            x: timeOpt,
            y: eOpt,
            type: 'scatter',
            mode: 'lines',
            name: 'AI Optimized',
            line: { color: '#10b981', width: 3 },
            fill: 'tonexty',
            fillcolor: 'rgba(16, 185, 129, 0.1)'
          }
        ]}
        layout={{
          autosize: true,
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { color: '#94a3b8', family: 'Inter, sans-serif' },
          margin: { t: 10, r: 10, b: 40, l: 50 },
          xaxis: { 
            gridcolor: 'rgba(255,255,255,0.05)', 
            zerolinecolor: 'rgba(255,255,255,0.1)',
            nticks: 8,
            tickangle: 0
          },
          yaxis: { gridcolor: 'rgba(255,255,255,0.05)', zerolinecolor: 'rgba(255,255,255,0.1)', title: 'Energy (kWh)' },
          legend: { orientation: 'h', y: -0.2 }
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
