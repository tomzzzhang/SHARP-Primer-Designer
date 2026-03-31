import React, { useRef, useCallback, useState, useEffect } from 'react'

function formatPos(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/**
 * SequenceBar — interactive visual bar for selecting a target region on a template sequence.
 *
 * Props:
 *   sequenceLength  number          total template length in bp
 *   targetStart     number | null   1-indexed start of target region
 *   targetEnd       number | null   1-indexed end of target region (inclusive)
 *   onChange        (start, end) => void   called when handles are dragged or inputs change
 */
export default function SequenceBar({ sequenceLength, targetStart, targetEnd, onChange }) {
  const svgRef = useRef(null)
  const [dragging, setDragging] = useState(null) // 'start' | 'end' | null

  if (!sequenceLength || sequenceLength < 1) return null

  const WIDTH = 232  // matches sidebar width minus padding
  const PAD = 4
  const BAR_Y = 14
  const BAR_H = 16
  const HANDLE_W = 6
  const SVG_H = 52

  const barLeft = PAD
  const barRight = WIDTH - PAD
  const barW = barRight - barLeft

  function bpToX(bp) {
    return barLeft + ((bp - 1) / (sequenceLength - 1)) * barW
  }

  function xToBp(x) {
    const frac = (x - barLeft) / barW
    return Math.round(frac * (sequenceLength - 1) + 1)
  }

  function clamp(bp) {
    return Math.max(1, Math.min(sequenceLength, bp))
  }

  // Generate tick marks
  const ticks = []
  const tickInterval = (() => {
    const approx = sequenceLength / 5
    const mag = Math.pow(10, Math.floor(Math.log10(approx)))
    const candidates = [1, 2, 5, 10, 20, 50].map(m => m * mag)
    return candidates.find(c => c >= approx) || mag * 10
  })()

  for (let bp = 0; bp <= sequenceLength; bp += tickInterval) {
    if (bp === 0) bp = 1
    ticks.push(bp)
  }
  if (ticks[ticks.length - 1] < sequenceLength) {
    ticks.push(sequenceLength)
  }

  const hasTarget = targetStart != null && targetEnd != null

  // Drag handlers
  const handleMouseDown = useCallback((which, e) => {
    e.preventDefault()
    setDragging(which)
  }, [])

  useEffect(() => {
    if (!dragging) return

    function handleMouseMove(e) {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const x = e.clientX - rect.left
      const bp = clamp(xToBp(x))

      if (dragging === 'start') {
        const newStart = Math.min(bp, (targetEnd || sequenceLength) - 1)
        onChange(Math.max(1, newStart), targetEnd || sequenceLength)
      } else if (dragging === 'end') {
        const newEnd = Math.max(bp, (targetStart || 1) + 1)
        onChange(targetStart || 1, Math.min(sequenceLength, newEnd))
      }
    }

    function handleMouseUp() {
      setDragging(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, targetStart, targetEnd, sequenceLength, onChange])

  // Click on bar to set initial target region
  function handleBarClick(e) {
    if (hasTarget) return // already has target, use handles
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = e.clientX - rect.left
    const bp = clamp(xToBp(x))
    // Set a ~10% region centered on click
    const regionSize = Math.max(100, Math.round(sequenceLength * 0.1))
    const half = Math.round(regionSize / 2)
    const start = clamp(bp - half)
    const end = clamp(bp + half)
    onChange(start, end)
  }

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {sequenceLength.toLocaleString()} bp
        </span>
        {hasTarget && (
          <span className="text-[10px] text-blue-600 font-medium">
            Target: {targetStart.toLocaleString()}–{targetEnd.toLocaleString()}
            {' '}({(targetEnd - targetStart + 1).toLocaleString()} bp)
          </span>
        )}
      </div>

      <svg
        ref={svgRef}
        width={WIDTH}
        height={SVG_H}
        className={`select-none ${!hasTarget ? 'cursor-crosshair' : ''}`}
        onClick={!hasTarget ? handleBarClick : undefined}
      >
        {/* Full sequence bar (grey) */}
        <rect
          x={barLeft}
          y={BAR_Y}
          width={barW}
          height={BAR_H}
          fill="#e5e7eb"
          rx={2}
        />

        {/* Target region highlight (blue) */}
        {hasTarget && (
          <rect
            x={bpToX(targetStart)}
            y={BAR_Y}
            width={Math.max(2, bpToX(targetEnd) - bpToX(targetStart))}
            height={BAR_H}
            fill="#bfdbfe"
            stroke="#3b82f6"
            strokeWidth={0.5}
            rx={1}
          />
        )}

        {/* Start handle */}
        {hasTarget && (
          <g
            onMouseDown={(e) => handleMouseDown('start', e)}
            className="cursor-ew-resize"
          >
            <rect
              x={bpToX(targetStart) - HANDLE_W / 2}
              y={BAR_Y - 2}
              width={HANDLE_W}
              height={BAR_H + 4}
              fill={dragging === 'start' ? '#2563eb' : '#3b82f6'}
              rx={2}
              stroke="white"
              strokeWidth={1}
            />
          </g>
        )}

        {/* End handle */}
        {hasTarget && (
          <g
            onMouseDown={(e) => handleMouseDown('end', e)}
            className="cursor-ew-resize"
          >
            <rect
              x={bpToX(targetEnd) - HANDLE_W / 2}
              y={BAR_Y - 2}
              width={HANDLE_W}
              height={BAR_H + 4}
              fill={dragging === 'end' ? '#2563eb' : '#3b82f6'}
              rx={2}
              stroke="white"
              strokeWidth={1}
            />
          </g>
        )}

        {/* Tick marks and labels */}
        {ticks.map((bp) => {
          const x = bpToX(bp)
          return (
            <g key={bp}>
              <line x1={x} y1={BAR_Y + BAR_H} x2={x} y2={BAR_Y + BAR_H + 4} stroke="#9ca3af" strokeWidth={0.5} />
              <text x={x} y={BAR_Y + BAR_H + 14} textAnchor="middle" fontSize={8} fill="#6b7280">
                {formatPos(bp)}
              </text>
            </g>
          )
        })}
      </svg>

      {!hasTarget && (
        <p className="text-[9px] text-muted-foreground italic">
          Click the bar to set a target region, or enter positions below
        </p>
      )}
    </div>
  )
}
