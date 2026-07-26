"use client";

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface TempChartProps {
  optData: any[];
}

export default function TempChart({ optData }: TempChartProps) {
  const [colors, setColors] = useState({
    grid: 'rgba(255,255,255,0.04)',
    zero: 'rgba(255,255,255,0.08)',
    text: '#94a3b8',
    outdoor: 'rgba(148, 163, 184, 0.3)',
    cooling: '#818cf8',
    heating: '#f87171',
    avgTemp: '#f8fafc',
  });

  useEffect(() => {
    const updateColors = () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      setColors({
        grid: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
        zero: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
        text: isLight ? '#64748b' : '#94a3b8',
        outdoor: isLight ? 'rgba(100, 116, 139, 0.3)' : 'rgba(148, 163, 184, 0.3)',
        cooling: isLight ? '#6366f1' : '#818cf8',
        heating: isLight ? '#dc2626' : '#f87171',
        avgTemp: isLight ? '#1e293b' : '#f8fafc',
      });
    };

    updateColors();
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  if (!optData.length) {
    return (
      <div className="h-[300px] flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        Loading chart...
      </div>
    );
  }

  const time = optData.map(d => new Date(2026, d.month - 1, d.day, d.hour, d.minute));
  
  // Safe extraction with fallbacks
  const htgSp = optData.map(d => d.zones?.['SPACE1-1']?.htg_setpoint_c ?? 20);
  const clgSp = optData.map(d => d.zones?.['SPACE1-1']?.clg_setpoint_c ?? 25);
  
  const avgTemp = optData.map(d => {
    if (!d.zones) return 22;
    const temps = Object.values(d.zones).map((z: any) => z.temp_c);
    return temps.reduce((a,b) => a+b, 0) / (temps.length || 1);
  });

  const outdoorTemp = optData.map(d => d.outdoor_temp_c ?? 20);

  return (
    <div className="w-full h-[300px]">
      <Plot
        data={[
          {
            x: time, y: outdoorTemp,
            type: 'scatter', mode: 'lines',
            name: 'Outdoor',
            line: { color: colors.outdoor, width: 1 }
          },
          {
            x: time, y: clgSp,
            type: 'scatter', mode: 'lines',
            name: 'Cooling Setpoint',
            line: { color: colors.cooling, width: 2, dash: 'dash' }
          },
          {
            x: time, y: htgSp,
            type: 'scatter', mode: 'lines',
            name: 'Heating Setpoint',
            line: { color: colors.heating, width: 2, dash: 'dash' }
          },
          {
            x: time, y: avgTemp,
            type: 'scatter', mode: 'lines',
            name: 'Avg Zone Temp',
            line: { color: colors.avgTemp, width: 2 }
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
            tickangle: 0
          },
          yaxis: { 
            gridcolor: colors.grid, 
            zerolinecolor: colors.zero, 
            title: 'Temperature (°C)' 
          },
          legend: { orientation: 'h', y: -0.2 }
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
