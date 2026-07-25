"use client";

import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface TempChartProps {
  optData: any[];
}

export default function TempChart({ optData }: TempChartProps) {
  if (!optData.length) return <div className="h-[300px] flex items-center justify-center text-slate-500">Loading chart...</div>;

  const time = optData.map(d => d.timestamp);
  
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
            line: { color: 'rgba(148, 163, 184, 0.3)', width: 1 }
          },
          {
            x: time, y: clgSp,
            type: 'scatter', mode: 'lines',
            name: 'Cooling Setpoint',
            line: { color: '#3b82f6', width: 2, dash: 'dash' }
          },
          {
            x: time, y: htgSp,
            type: 'scatter', mode: 'lines',
            name: 'Heating Setpoint',
            line: { color: '#ef4444', width: 2, dash: 'dash' }
          },
          {
            x: time, y: avgTemp,
            type: 'scatter', mode: 'lines',
            name: 'Avg Zone Temp',
            line: { color: '#f8fafc', width: 2 }
          }
        ]}
        layout={{
          autosize: true,
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { color: '#94a3b8', family: 'Inter, sans-serif' },
          margin: { t: 10, r: 10, b: 40, l: 50 },
          xaxis: { gridcolor: 'rgba(255,255,255,0.05)', zerolinecolor: 'rgba(255,255,255,0.1)' },
          yaxis: { gridcolor: 'rgba(255,255,255,0.05)', zerolinecolor: 'rgba(255,255,255,0.1)', title: 'Temperature (°C)' },
          legend: { orientation: 'h', y: -0.2 }
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
