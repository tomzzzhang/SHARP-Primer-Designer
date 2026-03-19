import React from 'react'

function SpecificityBadge({ status }) {
  if (status === 'pass') return <span className="text-green-600 font-bold" title="No off-target amplicons">✓</span>
  if (status === 'fail') return <span className="text-destructive font-bold" title="Off-target amplicons detected">✗</span>
  return <span className="text-muted-foreground" title="Not screened">—</span>
}

function CopyButton({ text }) {
  const [copied, setCopied] = React.useState(false)
  const timeoutRef = React.useRef(null)

  React.useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleCopy() }}
      className="text-[10px] px-1.5 py-0.5 border rounded hover:bg-muted transition-colors"
      title="Copy sequences"
    >
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

/**
 * Props:
 *   pairs: PairResult[]
 *   primaryProfileId: string
 *   primaryProfileName: string
 *   selectedRank: number | null
 *   onSelect: (pair) => void
 */
export default function ResultsTable({ pairs, primaryProfileId, primaryProfileName, selectedRank, onSelect }) {
  if (!pairs || pairs.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No results yet. Design primers using the panel on the left.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full border-collapse">
        <thead>
          <tr className="bg-muted/50 sticky top-0">
            <th className="border px-2 py-1.5 text-center">#</th>
            <th className="border px-2 py-1.5 text-left">Forward (5′→3′)</th>
            <th className="border px-2 py-1.5 text-left">Reverse (5′→3′)</th>
            <th className="border px-2 py-1.5 text-center">Size (bp)</th>
            <th className="border px-2 py-1.5 text-center" title={`SantaLucia (primer3) Tm under ${primaryProfileName}`}>
              Fwd Tm
            </th>
            <th className="border px-2 py-1.5 text-center" title={`SantaLucia (primer3) Tm under ${primaryProfileName}`}>
              Rev Tm
            </th>
            <th className="border px-2 py-1.5 text-center">ΔTm</th>
            <th className="border px-2 py-1.5 text-center">Fwd GC%</th>
            <th className="border px-2 py-1.5 text-center">Rev GC%</th>
            <th className="border px-2 py-1.5 text-center">Penalty</th>
            <th className="border px-2 py-1.5 text-center">Spec.</th>
            <th className="border px-2 py-1.5 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair) => {
            const fwdTm = pair.forward.tm_grid?.santalucia_primer3?.[primaryProfileId]
            const revTm = pair.reverse.tm_grid?.santalucia_primer3?.[primaryProfileId]
            const dtm = pair.tm_diff?.santalucia_primer3?.[primaryProfileId]
            const isSelected = pair.rank === selectedRank

            return (
              <tr
                key={pair.rank}
                onClick={() => onSelect(pair)}
                className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                  isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''
                }`}
              >
                <td className="border px-2 py-1 text-center font-medium">{pair.rank}</td>
                <td className="border px-2 py-1 font-mono max-w-[140px] truncate" title={pair.forward.sequence}>
                  {pair.forward.sequence}
                </td>
                <td className="border px-2 py-1 font-mono max-w-[140px] truncate" title={pair.reverse.sequence}>
                  {pair.reverse.sequence}
                </td>
                <td className="border px-2 py-1 text-center tabular-nums">{pair.amplicon_size}</td>
                <td className="border px-2 py-1 text-center tabular-nums">
                  {fwdTm != null ? fwdTm.toFixed(1) : '—'}
                </td>
                <td className="border px-2 py-1 text-center tabular-nums">
                  {revTm != null ? revTm.toFixed(1) : '—'}
                </td>
                <td className="border px-2 py-1 text-center tabular-nums">
                  {dtm != null ? dtm.toFixed(1) : '—'}
                </td>
                <td className="border px-2 py-1 text-center tabular-nums">{pair.forward.gc_percent}</td>
                <td className="border px-2 py-1 text-center tabular-nums">{pair.reverse.gc_percent}</td>
                <td className="border px-2 py-1 text-center tabular-nums">{pair.penalty_score.toFixed(3)}</td>
                <td className="border px-2 py-1 text-center">
                  <SpecificityBadge status={pair.specificity_status} />
                </td>
                <td className="border px-2 py-1 text-center">
                  <CopyButton
                    text={`Fwd: ${pair.forward.sequence}\nRev: ${pair.reverse.sequence}`}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground mt-1">
        Tm shown for SantaLucia (primer3) method under {primaryProfileName} profile.
        Click a row to expand full detail. Penalty = primer3 weighted deviation score (lower = better).
      </p>
    </div>
  )
}
