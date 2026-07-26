"use client";

import { Zap, TrendingDown, Thermometer, Battery } from 'lucide-react';

interface KPIProps {
  results: any;
}

export default function KPIBoard({ results }: KPIProps) {
  if (!results) return null;

  const savings = results.savings || {};
  const comfort = results.comfort || {};

  const cards = [
    {
      title: 'Energy Saved',
      value: savings.energy_saved_kwh?.toFixed(1) || '--',
      unit: 'kWh',
      subtitle: `${savings.energy_savings_pct?.toFixed(1) || '--'}% reduction vs baseline`,
      icon: TrendingDown,
      accentColor: 'var(--accent-secondary)',
      accentDim: 'var(--accent-secondary-dim)',
      highlight: true,
    },
    {
      title: 'Baseline Energy',
      value: savings.baseline_kwh?.toFixed(1) || '--',
      unit: 'kWh',
      subtitle: 'Standard rule-based control',
      icon: Battery,
      accentColor: 'var(--text-tertiary)',
      accentDim: 'var(--glass-bg)',
    },
    {
      title: 'AI Optimized Energy',
      value: savings.optimized_kwh?.toFixed(1) || '--',
      unit: 'kWh',
      subtitle: 'Agentic dynamic control',
      icon: Zap,
      accentColor: 'var(--accent-primary)',
      accentDim: 'var(--accent-primary-dim)',
    },
    {
      title: 'Thermal Comfort',
      value: comfort.optimized_comfort_pct?.toFixed(1) || '--',
      unit: '%',
      subtitle: 'Time within bounds (19–26°C)',
      icon: Thermometer,
      accentColor: 'var(--accent-warning)',
      accentDim: 'rgba(251, 191, 36, 0.08)',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <div
            key={i}
            className="glass-card p-5 relative overflow-hidden group"
            style={{
              borderColor: card.highlight ? card.accentColor : undefined,
              borderWidth: card.highlight ? '1px' : undefined,
            }}
          >
            {/* Background icon */}
            <div
              className="absolute -right-4 -top-4 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity"
            >
              <Icon size={100} style={{ color: card.accentColor }} />
            </div>

            <h3
              className="text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {card.title}
            </h3>

            <div className="flex items-baseline gap-1.5 mb-1">
              <span
                className="text-3xl font-black"
                style={{
                  color: card.highlight ? card.accentColor : 'var(--text-primary)',
                }}
              >
                {card.value}
              </span>
              <span
                className="text-sm font-bold"
                style={{ color: card.accentColor }}
              >
                {card.unit}
              </span>
            </div>

            <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {card.subtitle}
            </div>
          </div>
        );
      })}
    </div>
  );
}
