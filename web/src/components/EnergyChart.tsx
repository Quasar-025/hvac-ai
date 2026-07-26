"use client";

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface EnergyChartProps {
  baseData: any[];
  optData: any[];
}

export default function EnergyChart({ baseData, optData }: EnergyChartProps) {
  const [colors, setColors] = useState({
    grid: 'rgba(255,255,255,0.04)',
    zero: 'rgba(255,255,255,0.08)',
    text: '#94a3b8',
    baseline: '#94a3b8',
    optimized: '#34d399',
    fill: 'rgba(52, 211, 153, 0.08)',
  });

  useEffect(() => {
    const updateColors = () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      setColors({
        grid: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
        zero: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
        text: isLight ? '#64748b' : '#94a3b8',
        baseline: isLight ? '#94a3b8' : '#94a3b8',
        optimized: isLight ? '#059669' : '#34d399',
        fill: isLight ? 'rgba(5, 150, 105, 0.06)' : 'rgba(52, 211, 153, 0.08)',
      });
    };

    updateColors();
    // Watch for theme changes
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  if (!baseData.length || !optData.length) {
    return (
      <div className="h-[300px] flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        Loading chart...
      </div>
    );
  }

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
            line: { color: colors.baseline, width: 2, dash: 'dot' }
          },
          {
            x: timeOpt,
            y: eOpt,
            type: 'scatter',
            mode: 'lines',
            name: 'AI Optimized',
            line: { color: colors.optimized, width: 3 },
            fill: 'tonexty',
            fillcolor: colors.fill
          }
        ]}
        layout={{
          autosize: true,
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { color: colors.text, family: 'Inter, sans-serif' },
          margin: { t: 10, r: 10, b: 40, l: 50 },
          xaxis: { 
            gridcolor: colors.grid, 
            zerolinecolor: colors.zero,
            nticks: 8,
            tickangle: 0
          },
          yaxis: { 
            gridcolor: colors.grid, 
            zerolinecolor: colors.zero, 
            title: 'Energy (kWh)' 
          },
          legend: { orientation: 'h', y: -0.2 }
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
