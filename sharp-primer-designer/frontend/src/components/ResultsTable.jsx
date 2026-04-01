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
 *   checkedRanks: Set<number>
 *   onCheckedChange: (ranks: Set<number>) => void
 *   onExport: () => void
 *   exporting: boolean
 *   exportName: string
 *   onExportNameChange: (name: string) => void
 */
export default function ResultsTable({ pairs, primaryProfileId, primaryProfileName, selectedRank, onSelect, checkedRanks, onCheckedChange, onExport, exporting, exportName, onExportNameChange }) {
  if (!pairs || pairs.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No results yet. Design primers using the panel on the left.
      </div>
    )
  }

  const allChecked = pairs.length > 0 && pairs.every((p) => checkedRanks.has(p.rank))
  const someChecked = checkedRanks.size > 0

  function toggleAll() {
    if (allChecked) {
      onCheckedChange(new Set())
    } else {
      onCheckedChange(new Set(pairs.map((p) => p.rank)))
    }
  }

  function toggleOne(rank) {
    const next = new Set(checkedRanks)
    if (next.has(rank)) next.delete(rank)
    else next.add(rank)
    onCheckedChange(next)
  }

  return (
    <div>
      {/* Export bar */}
      {someChecked && (
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded px-3 py-1.5 mb-2">
          <span className="text-xs text-primary font-medium whitespace-nowrap">
            {checkedRanks.size} pair{checkedRanks.size > 1 ? 's' : ''}
          </span>
          <input
            type="text"
            value={exportName}
            onChange={(e) => onExportNameChange(e.target.value)}
            placeholder="Target name for export..."
            className="flex-1 border rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={onExport}
            disabled={exporting || !exportName.trim()}
            className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {exporting ? 'Exporting...' : 'Export Selected'}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="bg-muted/50 sticky top-0">
              <th className="border px-2 py-1.5 text-center w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="w-3 h-3 accent-primary cursor-pointer"
                  title="Select all"
                />
              </th>
              <th className="border px-2 py-1.5 text-center">#</th>
              <th className="border px-2 py-1.5 text-left">Forward (5'-3')</th>
              <th className="border px-2 py-1.5 text-left">Reverse (5'-3')</th>
              <th className="border px-2 py-1.5 text-center">Size (bp)</th>
              <th className="border px-2 py-1.5 text-center" title={`SantaLucia (primer3) Tm under ${primaryProfileName}`}>
                Fwd Tm
              </th>
              <th className="border px-2 py-1.5 text-center" title={`SantaLucia (primer3) Tm under ${primaryProfileName}`}>
                Rev Tm
              </th>
              <th className="border px-2 py-1.5 text-center">delta-Tm</th>
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
              const isChecked = checkedRanks.has(pair.rank)

              return (
                <tr
                  key={pair.rank}
                  onClick={() => onSelect(pair)}
                  className={`cursor-pointer hover:bg-accent transition-colors ${
                    isSelected ? 'bg-accent ring-1 ring-inset ring-primary/30' : ''
                  }`}
                >
                  <td className="border px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => { e.stopPropagation(); toggleOne(pair.rank) }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-3 h-3 accent-primary cursor-pointer"
                    />
                  </td>
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
    </div>
  )
}
