import React from 'react'

function HitsTable({ hits, label }) {
  if (!hits || hits.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        {label}: no hits
      </div>
    )
  }
  return (
    <div>
      <div className="text-xs font-medium mb-1">{label} — {hits.length} hit{hits.length !== 1 ? 's' : ''}</div>
      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="bg-muted/50">
              <th className="border px-2 py-1 text-left">Subject</th>
              <th className="border px-2 py-1 text-center">Start</th>
              <th className="border px-2 py-1 text-center">End</th>
              <th className="border px-2 py-1 text-center">Identity %</th>
              <th className="border px-2 py-1 text-center">Align len</th>
              <th className="border px-2 py-1 text-center">Strand</th>
              <th className="border px-2 py-1 text-center">E-value</th>
            </tr>
          </thead>
          <tbody>
            {hits.map((h, i) => (
              <tr key={i} className="hover:bg-muted/20">
                <td className="border px-2 py-1 font-mono text-[10px] max-w-[120px] truncate">{h.subject_id}</td>
                <td className="border px-2 py-1 text-center tabular-nums">{h.subject_start.toLocaleString()}</td>
                <td className="border px-2 py-1 text-center tabular-nums">{h.subject_end.toLocaleString()}</td>
                <td className="border px-2 py-1 text-center tabular-nums">{h.percent_identity.toFixed(1)}</td>
                <td className="border px-2 py-1 text-center tabular-nums">{h.alignment_length}</td>
                <td className={`border px-2 py-1 text-center ${h.strand === 'plus' ? 'text-blue-600' : 'text-orange-600'}`}>
                  {h.strand === 'plus' ? '+' : '−'}
                </td>
                <td className="border px-2 py-1 text-center tabular-nums">{h.evalue.toExponential(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function BlastHits({ forward, reverse, offTargetAmplicons }) {
  return (
    <div className="space-y-3">
      <HitsTable hits={forward?.blast_hits} label="Forward primer" />
      <HitsTable hits={reverse?.blast_hits} label="Reverse primer" />
      {offTargetAmplicons && offTargetAmplicons.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-destructive mb-1">
            Off-target amplicons ({offTargetAmplicons.length})
          </div>
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="bg-destructive/10">
                <th className="border px-2 py-1 text-left">Subject</th>
                <th className="border px-2 py-1 text-center">Fwd pos</th>
                <th className="border px-2 py-1 text-center">Rev pos</th>
                <th className="border px-2 py-1 text-center">Est. size (bp)</th>
              </tr>
            </thead>
            <tbody>
              {offTargetAmplicons.map((a, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="border px-2 py-1 font-mono text-[10px]">{a.subject}</td>
                  <td className="border px-2 py-1 text-center tabular-nums">{a.fwd_pos.toLocaleString()}</td>
                  <td className="border px-2 py-1 text-center tabular-nums">{a.rev_pos.toLocaleString()}</td>
                  <td className="border px-2 py-1 text-center tabular-nums">{a.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
