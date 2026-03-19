import React from 'react'

const STEP_ICONS = {
  template: '📄',
  primer3:  '🔬',
  tm_grid:  '🌡',
  blast:    '💥',
  ranking:  '🏆',
}

export default function ProgressBar({ progress }) {
  if (!progress) return null
  const { step, message, pct } = progress

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {STEP_ICONS[step] || '⚙️'} {message}
        </span>
        <span className="tabular-nums font-medium">{pct.toFixed(0)}%</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
