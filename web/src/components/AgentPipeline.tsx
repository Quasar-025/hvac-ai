"use client";

import { useSSE } from './SSEProvider';
import { Database, Cpu, Zap, ChevronRight, Wifi, WifiOff, Loader2 } from 'lucide-react';

function FlowArrow({ active, color }: { active: boolean; color: string }) {
  return (
    <div className="flex lg:flex-col items-center justify-center py-3 lg:py-0 lg:px-3 shrink-0">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full transition-all duration-300"
            style={{
              background: active ? color : 'var(--text-muted)',
              opacity: active ? 1 : 0.25,
              animationDelay: `${i * 0.2}s`,
              animation: active ? `flow-particle 1.2s ease-in-out ${i * 0.2}s infinite` : 'none',
            }}
          />
        ))}
        <ChevronRight
          size={18}
          className="hidden lg:block transition-colors duration-300"
          style={{ color: active ? color : 'var(--text-muted)', opacity: active ? 1 : 0.3 }}
        />
        {/* Vertical arrow for mobile */}
        <div
          className="lg:hidden w-0.5 h-6 rounded transition-colors duration-300"
          style={{ background: active ? color : 'var(--text-muted)', opacity: active ? 1 : 0.3 }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ phase, targetPhase, label }: { phase: string; targetPhase: string; label: string }) {
  const isActive = phase === targetPhase;
  const isPast = (
    (targetPhase === 'sensing' && ['thinking', 'injecting'].includes(phase)) ||
    (targetPhase === 'thinking' && phase === 'injecting')
  );

  return (
    <span
      className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full transition-all duration-300"
      style={{
        background: isActive ? 'var(--accent-primary-dim)' : isPast ? 'var(--accent-secondary-dim)' : 'transparent',
        color: isActive ? 'var(--accent-primary)' : isPast ? 'var(--accent-secondary)' : 'var(--text-muted)',
        border: `1px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}`,
      }}
    >
      {isActive ? '● ' : isPast ? '✓ ' : ''}{label}
    </span>
  );
}

export default function AgentPipeline() {
  const { phase, sensorData, llmTokens, llmStartInfo, llmDoneInfo, injectionData, connected, timestepCount } = useSSE();

  return (
    <div className="w-full min-h-[520px] flex flex-col p-6 lg:p-8 glass-card mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Closed-Loop Execution Framework
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            True Runtime Forward-Injection Pipeline
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            TS #{timestepCount}
          </span>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{
            background: connected ? 'var(--accent-secondary-dim)' : 'rgba(248,113,113,0.12)',
            border: `1px solid ${connected ? 'var(--accent-secondary)' : 'var(--accent-danger)'}30`,
          }}>
            {connected ? (
              <Wifi size={12} style={{ color: 'var(--accent-secondary)' }} />
            ) : (
              <WifiOff size={12} style={{ color: 'var(--accent-danger)' }} />
            )}
            <span className="text-xs font-medium" style={{ color: connected ? 'var(--accent-secondary)' : 'var(--accent-danger)' }}>
              {connected ? 'Stream Live' : 'Reconnecting...'}
            </span>
          </div>
        </div>
      </div>

      {/* Pipeline Nodes */}
      <div className="flex flex-col lg:flex-row items-stretch justify-center w-full gap-0 flex-1 max-w-7xl mx-auto">

        {/* ── Node 1: EnergyPlus Engine ── */}
        <div className={`flex-1 glass-card pipeline-node sensor p-5 ${phase === 'sensing' ? 'active' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--node-sensor-dim)' }}>
                <Database size={16} style={{ color: 'var(--node-sensor)' }} />
              </div>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>EnergyPlus Engine</h3>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>PyEnergyPlus Runtime</p>
              </div>
            </div>
            <StatusBadge phase={phase} targetPhase="sensing" label="Sensor Read" />
          </div>

          {/* Accent bar */}
          <div className="w-full h-[2px] rounded-full mb-3" style={{
            background: phase === 'sensing'
              ? `linear-gradient(90deg, var(--node-sensor), transparent)`
              : 'var(--divider)',
          }} />

          <div className="code-surface p-3 text-xs overflow-y-auto max-h-44 custom-scrollbar" style={{ color: 'var(--node-sensor)' }}>
            {sensorData ? (
              <pre className="whitespace-pre-wrap font-mono leading-relaxed">
                <span style={{ color: 'var(--text-muted)' }}>{'{\n'}</span>
                <span>  <span style={{ color: 'var(--node-sensor)' }}>&quot;timestamp&quot;</span>: <span style={{ color: 'var(--accent-secondary)' }}>&quot;{sensorData.timestamp}&quot;</span>,</span>{'\n'}
                <span>  <span style={{ color: 'var(--node-sensor)' }}>&quot;outdoor_temp&quot;</span>: <span style={{ color: 'var(--accent-secondary)' }}>{sensorData.outdoor_temp_c?.toFixed(1) ?? 'N/A'}</span>,</span>{'\n'}
                <span>  <span style={{ color: 'var(--node-sensor)' }}>&quot;hvac_power_w&quot;</span>: <span style={{ color: 'var(--accent-secondary)' }}>{sensorData.hvac_power_w?.toFixed(0) ?? 0}</span>,</span>{'\n'}
                <span>  <span style={{ color: 'var(--node-sensor)' }}>&quot;grid_carbon&quot;</span>: <span style={{ color: 'var(--accent-secondary)' }}>{sensorData.grid_carbon_intensity_g_kwh ?? 300}</span>,</span>{'\n'}
                <span>  <span style={{ color: 'var(--node-sensor)' }}>&quot;zones&quot;</span>: <span style={{ color: 'var(--text-muted)' }}>{'{ '}{sensorData.zones ? Object.keys(sensorData.zones).length : 0}{' zones }'}</span></span>{'\n'}
                <span style={{ color: 'var(--text-muted)' }}>{'}'}</span>
              </pre>
            ) : (
              <div className="flex items-center justify-center h-24" style={{ color: 'var(--text-muted)' }}>
                <span className="italic text-xs">Awaiting sensor data...</span>
              </div>
            )}
          </div>
        </div>

        {/* Arrow 1 */}
        <FlowArrow active={phase === 'sensing' || phase === 'thinking'} color="var(--node-sensor)" />

        {/* ── Node 2: LLM Agent ── */}
        <div className={`flex-1 glass-card pipeline-node llm p-5 ${phase === 'thinking' ? 'active' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                background: 'var(--node-llm-dim)',
                ...(phase === 'thinking' ? { animation: 'glow-ring 2s ease-in-out infinite' } : {}),
              }}>
                {phase === 'thinking' ? (
                  <Loader2 size={16} className="animate-spin-slow" style={{ color: 'var(--node-llm)' }} />
                ) : (
                  <Cpu size={16} style={{ color: 'var(--node-llm)' }} />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Llama 3 Agent</h3>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {llmStartInfo?.model || 'Comfort & Carbon Optimizer'}
                </p>
              </div>
            </div>
            <StatusBadge phase={phase} targetPhase="thinking" label={phase === 'thinking' ? 'Reasoning' : 'LLM'} />
          </div>

          {/* Accent bar */}
          <div className="w-full h-[2px] rounded-full mb-3" style={{
            background: phase === 'thinking'
              ? `linear-gradient(90deg, var(--node-llm), transparent)`
              : 'var(--divider)',
            ...(phase === 'thinking' ? {
              backgroundImage: 'linear-gradient(90deg, transparent, var(--node-llm-dim), var(--node-llm), var(--node-llm-dim), transparent)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s linear infinite',
            } : {}),
          }} />

          <div className="code-surface p-3 text-xs overflow-y-auto max-h-44 custom-scrollbar relative" style={{ color: 'var(--node-llm)' }}>
            {phase === 'thinking' && llmTokens ? (
              <div className="font-mono leading-relaxed whitespace-pre-wrap">
                <span style={{ color: 'var(--text-secondary)' }}>{llmTokens}</span>
                <span className="animate-cursor-blink inline-block w-[2px] h-3.5 ml-0.5 align-middle" style={{ background: 'var(--node-llm)' }} />
              </div>
            ) : phase === 'thinking' && !llmTokens ? (
              <div className="flex items-center gap-2 justify-center h-24">
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--node-llm)' }} />
                <span className="italic" style={{ color: 'var(--text-muted)' }}>Analyzing zone telemetry...</span>
              </div>
            ) : llmDoneInfo?.actions ? (
              <pre className="whitespace-pre-wrap font-mono leading-relaxed">
                <span style={{ color: 'var(--text-muted)' }}>{'{\n'}</span>
                <span>  <span style={{ color: 'var(--node-llm)' }}>&quot;heating_setpoint&quot;</span>: <span style={{ color: 'var(--accent-secondary)' }}>{llmDoneInfo.actions.heating_setpoint}</span>,</span>{'\n'}
                <span>  <span style={{ color: 'var(--node-llm)' }}>&quot;cooling_setpoint&quot;</span>: <span style={{ color: 'var(--accent-secondary)' }}>{llmDoneInfo.actions.cooling_setpoint}</span>,</span>{'\n'}
                <span>  <span style={{ color: 'var(--node-llm)' }}>&quot;reasoning&quot;</span>: <span style={{ color: 'var(--accent-warning)' }}>&quot;{llmDoneInfo.actions.reasoning?.slice(0, 120) ?? ''}...&quot;</span></span>{'\n'}
                <span style={{ color: 'var(--text-muted)' }}>{'}'}</span>
                {llmDoneInfo.latency_s && (
                  <span className="block mt-2" style={{ color: 'var(--text-muted)' }}>
                    {llmDoneInfo.fallback ? '⚡ Fallback' : '✓ Parsed'} in {llmDoneInfo.latency_s}s
                  </span>
                )}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-24" style={{ color: 'var(--text-muted)' }}>
                <span className="italic text-xs">Awaiting LLM inference...</span>
              </div>
            )}
          </div>
        </div>

        {/* Arrow 2 */}
        <FlowArrow active={phase === 'injecting'} color="var(--node-inject)" />

        {/* ── Node 3: Runtime Injector ── */}
        <div className={`flex-1 glass-card pipeline-node inject p-5 ${phase === 'injecting' ? 'active' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--node-inject-dim)' }}>
                <Zap size={16} style={{ color: 'var(--node-inject)' }} />
              </div>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Runtime Injector</h3>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Memory Setpoint Override</p>
              </div>
            </div>
            <StatusBadge phase={phase} targetPhase="injecting" label="Injecting" />
          </div>

          {/* Accent bar */}
          <div className="w-full h-[2px] rounded-full mb-3" style={{
            background: phase === 'injecting'
              ? `linear-gradient(90deg, var(--node-inject), transparent)`
              : 'var(--divider)',
          }} />

          <div className="code-surface p-3 text-xs overflow-y-auto max-h-44 custom-scrollbar" style={{ color: 'var(--node-inject)' }}>
            {injectionData ? (
              <pre className="whitespace-pre-wrap font-mono leading-relaxed animate-fade-in">
                <span style={{ color: 'var(--text-muted)' }}>{'{\n'}</span>
                <span>  <span style={{ color: 'var(--node-inject)' }}>&quot;action&quot;</span>: <span style={{ color: 'var(--accent-secondary)' }}>&quot;SETPOINT_OVERRIDE&quot;</span>,</span>{'\n'}
                <span>  <span style={{ color: 'var(--node-inject)' }}>&quot;heating_c&quot;</span>: <span style={{ color: 'var(--accent-secondary)' }}>{injectionData.heating_setpoint ?? '—'}</span>,</span>{'\n'}
                <span>  <span style={{ color: 'var(--node-inject)' }}>&quot;cooling_c&quot;</span>: <span style={{ color: 'var(--accent-secondary)' }}>{injectionData.cooling_setpoint ?? '—'}</span>,</span>{'\n'}
                <span>  <span style={{ color: 'var(--node-inject)' }}>&quot;reasoning&quot;</span>: <span style={{ color: 'var(--accent-warning)' }}>&quot;{injectionData.reasoning?.slice(0, 80) ?? ''}...&quot;</span></span>{'\n'}
                <span style={{ color: 'var(--text-muted)' }}>{'}'}</span>
              </pre>
            ) : (
              <div className="flex items-center justify-center h-24" style={{ color: 'var(--text-muted)' }}>
                <span className="italic text-xs">Awaiting injection command...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
