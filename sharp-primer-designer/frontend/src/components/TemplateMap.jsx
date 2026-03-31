import React, { useMemo, useRef, useState } from 'react'

// Colour palette per rank (top = green, lower = blue → orange)
const RANK_COLORS = [
  '#16a34a', // 1 green
  '#2563eb', // 2 blue
  '#9333ea', // 3 purple
  '#db2777', // 4 pink
  '#ea580c', // 5 orange
  '#ca8a04', // 6 yellow
  '#0891b2', // 7 cyan
  '#65a30d', // 8 lime
  '#7c3aed', // 9 violet
  '#be123c', // 10 rose
]
const FALLBACK_COLOR = '#6b7280'

function rankColor(rank) {
  return RANK_COLORS[(rank - 1) % RANK_COLORS.length] || FALLBACK_COLOR
}

function formatPos(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/**
 * TemplateMap — SVG visualisation of primer pair positions on the template.
 *
 * Props:
 *   pairs          PairResult[]
 *   templateLength number
 *   targetRegion   [start, end] (1-indexed, inclusive) | null
 *   selectedRank   number | null
 *   onSelect       (pair) => void
 */
export default function TemplateMap({ pairs, templateLength, targetRegion, selectedRank, onSelect }) {
  const containerRef = useRef(null)
  const [tooltip, setTooltip] = useState(null) // {x, y, text}

  const PAD_LEFT   = 36   // room for rank labels
  const PAD_RIGHT  = 8
  const PAD_TOP    = 8
  const AXIS_H     = 28   // height of template bar + axis
  const ROW_H      = 22   // height per pair row
  const ROW_GAP    = 3
  const PRIMER_H   = ROW_H         // full height for primer rects
  const AMPLICON_OPACITY = 0.25

  const numPairs = pairs?.length || 0
  const svgHeight = PAD_TOP + AXIS_H + numPairs * (ROW_H + ROW_GAP) + 12

  // We'll compute pixel x from template position using the container width.
  // Use a fixed logical width for the SVG and viewBox to make it responsive.
  const SVG_W = 800
  const trackW = SVG_W - PAD_LEFT - PAD_RIGHT

  function toX(pos) {
    if (templateLength <= 0) return PAD_LEFT
    return PAD_LEFT + (pos / templateLength) * trackW
  }

  // Axis ticks — ~6 evenly spaced
  const ticks = useMemo(() => {
    if (templateLength <= 0) return []
    const count = 6
    const step = Math.ceil(templateLength / count / 1000) * 1000 || 1
    const ts = []
    for (let p = 0; p <= templateLength; p += step) ts.push(p)
    if (ts[ts.length - 1] !== templateLength) ts.push(templateLength)
    return ts
  }, [templateLength])

  if (!pairs || pairs.length === 0 || !templateLength) return null

  return (
    <div className="relative" ref={containerRef}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        Template Map
      </h3>
      <svg
        viewBox={`0 0 ${SVG_W} ${svgHeight}`}
        className="w-full border rounded bg-white"
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        {/* ── Template bar ──────────────────────────────────────────────── */}
        {/* Background track */}
        <rect
          x={PAD_LEFT} y={PAD_TOP}
          width={trackW} height={10}
          rx={3} fill="#e5e7eb"
        />

        {/* Target region highlight */}
        {targetRegion && (
          <rect
            x={toX(targetRegion[0])}
            y={PAD_TOP}
            width={toX(targetRegion[1]) - toX(targetRegion[0])}
            height={10}
            fill="#bfdbfe"
            stroke="#3b82f6"
            strokeWidth={0.5}
          />
        )}

        {/* Axis ticks + labels */}
        {ticks.map((pos) => (
          <g key={pos}>
            <line
              x1={toX(pos)} y1={PAD_TOP + 10}
              x2={toX(pos)} y2={PAD_TOP + 14}
              stroke="#9ca3af" strokeWidth={1}
            />
            <text
              x={toX(pos)}
              y={PAD_TOP + 24}
              textAnchor="middle"
              fontSize={8}
              fill="#6b7280"
            >
              {formatPos(pos)}
            </text>
          </g>
        ))}

        {/* Target region label */}
        {targetRegion && (
          <text
            x={(toX(targetRegion[0]) + toX(targetRegion[1])) / 2}
            y={PAD_TOP - 1}
            textAnchor="middle"
            fontSize={7}
            fill="#3b82f6"
          >
            target
          </text>
        )}

        {/* ── Pair rows ─────────────────────────────────────────────────── */}
        {pairs.map((pair, idx) => {
          const color     = rankColor(pair.rank)
          const y         = PAD_TOP + AXIS_H + idx * (ROW_H + ROW_GAP)
          const isSelected = pair.rank === selectedRank

          const fwdX  = toX(pair.forward.start)
          const fwdW  = toX(pair.forward.end) - fwdX
          const revX  = toX(pair.reverse.start)
          const revW  = toX(pair.reverse.end) - revX
          const ampX  = fwdX
          const ampW  = toX(pair.reverse.end) - fwdX

          return (
            <g
              key={pair.rank}
              onClick={() => onSelect(pair)}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => {
                const svg = e.currentTarget.closest('svg')
                const pt = svg.createSVGPoint()
                pt.x = e.clientX; pt.y = e.clientY
                const sp = pt.matrixTransform(svg.getScreenCTM().inverse())
                setTooltip({
                  x: sp.x, y: sp.y,
                  text: [
                    `Pair #${pair.rank}  |  ${pair.amplicon_size} bp amplicon`,
                    `Fwd: ${pair.forward.sequence}`,
                    `Rev: ${pair.reverse.sequence}`,
                    `Penalty: ${pair.penalty_score}  |  Spec: ${pair.specificity_status}`,
                  ],
                })
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Selection highlight */}
              {isSelected && (
                <rect
                  x={PAD_LEFT - 2} y={y - 2}
                  width={trackW + 4} height={ROW_H + 4}
                  rx={3} fill="none"
                  stroke={color} strokeWidth={1.5}
                />
              )}

              {/* Amplicon span (faded fill) */}
              <rect
                x={ampX} y={y}
                width={ampW} height={PRIMER_H}
                rx={2}
                fill={color}
                fillOpacity={isSelected ? 0.35 : AMPLICON_OPACITY}
              />

              {/* Forward primer (solid) */}
              <rect
                x={fwdX} y={y}
                width={Math.max(fwdW, 2)} height={PRIMER_H}
                rx={1}
                fill={color}
                fillOpacity={0.9}
              />

              {/* Reverse primer (solid, hatched feel via darker) */}
              <rect
                x={revX} y={y}
                width={Math.max(revW, 2)} height={PRIMER_H}
                rx={1}
                fill={color}
                fillOpacity={0.9}
              />

              {/* Rank label */}
              <text
                x={PAD_LEFT - 4} y={y + ROW_H / 2 + 3}
                textAnchor="end"
                fontSize={9}
                fontWeight={isSelected ? 'bold' : 'normal'}
                fill={isSelected ? color : '#6b7280'}
              >
                {pair.rank}
              </text>

              {/* Amplicon size label (only if wide enough) */}
              {ampW > 30 && (
                <text
                  x={ampX + ampW / 2} y={y + ROW_H / 2 + 3}
                  textAnchor="middle"
                  fontSize={8}
                  fill={color}
                  fillOpacity={0.85}
                  pointerEvents="none"
                >
                  {pair.amplicon_size} bp
                </text>
              )}
            </g>
          )
        })}

        {/* ── Tooltip ───────────────────────────────────────────────────── */}
        {tooltip && (() => {
          const pad = 6
          const lineH = 12
          const boxW = 280
          const boxH = tooltip.text.length * lineH + pad * 2
          const tx = Math.min(tooltip.x + 10, SVG_W - boxW - 4)
          const ty = Math.max(tooltip.y - boxH - 4, 2)
          return (
            <g pointerEvents="none">
              <rect
                x={tx} y={ty}
                width={boxW} height={boxH}
                rx={4} fill="#1f2937"
                fillOpacity={0.92}
              />
              {tooltip.text.map((line, i) => (
                <text
                  key={i}
                  x={tx + pad}
                  y={ty + pad + (i + 1) * lineH - 2}
                  fontSize={9}
                  fill="white"
                  fontFamily="monospace"
                >
                  {line}
                </text>
              ))}
            </g>
          )
        })()}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block w-6 h-2 rounded" style={{ background: '#9ca3af', opacity: 0.3 }} />
          amplicon
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block w-3 h-2 rounded" style={{ background: '#4b5563' }} />
          primer
        </div>
        {targetRegion && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block w-6 h-2 rounded border border-blue-400" style={{ background: '#bfdbfe' }} />
            target region
          </div>
        )}
        <div className="text-[10px] text-muted-foreground ml-auto">click a row to expand detail</div>
      </div>
    </div>
  )
}
