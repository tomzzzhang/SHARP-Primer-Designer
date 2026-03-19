import React, { useState } from 'react'
import TmGrid from './TmGrid'
import BlastHits from './BlastHits'

const SECTIONS = ['tm', 'thermo', 'blast']
const SECTION_LABELS = { tm: 'Tm Grid', thermo: 'Thermodynamics', blast: 'BLAST / Specificity' }

function ThermoRow({ label, dg, tm }) {
  return (
    <tr className="hover:bg-muted/20">
      <td className="border px-2 py-1">{label}</td>
      <td className="border px-2 py-1 text-center tabular-nums">
        {dg != null ? dg.toFixed(2) : '—'}
      </td>
      <td className="border px-2 py-1 text-center tabular-nums">
        {tm != null ? tm.toFixed(1) : '—'}
      </td>
    </tr>
  )
}

function ThermoTable({ pair }) {
  const { forward: fwd, reverse: rev } = pair
  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full border-collapse">
        <thead>
          <tr className="bg-muted/50">
            <th className="border px-2 py-1 text-left">Structure</th>
            <th className="border px-2 py-1 text-center">ΔG (kcal/mol)</th>
            <th className="border px-2 py-1 text-center">Tm (°C)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-muted/20">
            <td colSpan={3} className="border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Forward: {fwd.sequence}
            </td>
          </tr>
          <ThermoRow label="Hairpin" dg={fwd.hairpin_dg} tm={fwd.hairpin_tm} />
          <ThermoRow label="Homodimer" dg={fwd.homodimer_dg} tm={fwd.homodimer_tm} />
          <tr className="hover:bg-muted/20">
            <td className="border px-2 py-1">3′ end stability</td>
            <td className="border px-2 py-1 text-center tabular-nums">{fwd.end_stability?.toFixed(2) ?? '—'}</td>
            <td className="border px-2 py-1 text-center">—</td>
          </tr>
          <tr className="bg-muted/20">
            <td colSpan={3} className="border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Reverse: {rev.sequence}
            </td>
          </tr>
          <ThermoRow label="Hairpin" dg={rev.hairpin_dg} tm={rev.hairpin_tm} />
          <ThermoRow label="Homodimer" dg={rev.homodimer_dg} tm={rev.homodimer_tm} />
          <tr className="hover:bg-muted/20">
            <td className="border px-2 py-1">3′ end stability</td>
            <td className="border px-2 py-1 text-center tabular-nums">{rev.end_stability?.toFixed(2) ?? '—'}</td>
            <td className="border px-2 py-1 text-center">—</td>
          </tr>
          <tr className="bg-muted/20">
            <td colSpan={3} className="border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Pair
            </td>
          </tr>
          <ThermoRow label="Heterodimer" dg={pair.heterodimer_dg} tm={pair.heterodimer_tm} />
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground mt-1">
        Calculated under primary condition profile. Negative ΔG = thermodynamically favorable.
      </p>
    </div>
  )
}

export default function PairDetail({ pair, profileNames, onClose }) {
  const [section, setSection] = useState('tm')

  if (!pair) return null

  return (
    <div className="border rounded bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="text-sm font-semibold">Pair #{pair.rank} Detail</div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Amplicon: {pair.amplicon_size} bp · Penalty: {pair.penalty_score}
          </span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Primer sequences */}
      <div className="px-3 py-2 grid grid-cols-2 gap-2 border-b text-xs">
        <div>
          <span className="text-muted-foreground">Fwd: </span>
          <span className="font-mono">{pair.forward.sequence}</span>
          <span className="text-muted-foreground ml-2">
            {pair.forward.start}–{pair.forward.end} · {pair.forward.length} nt · {pair.forward.gc_percent}% GC
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Rev: </span>
          <span className="font-mono">{pair.reverse.sequence}</span>
          <span className="text-muted-foreground ml-2">
            {pair.reverse.start}–{pair.reverse.end} · {pair.reverse.length} nt · {pair.reverse.gc_percent}% GC
          </span>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 px-3 pt-2 border-b">
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-3 py-1 text-xs font-medium rounded-t transition-colors ${
              section === s
                ? 'border border-b-white -mb-px bg-white text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {SECTION_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="p-3">
        {section === 'tm' && (
          <TmGrid
            fwdGrid={pair.forward.tm_grid}
            revGrid={pair.reverse.tm_grid}
            profileNames={profileNames}
          />
        )}
        {section === 'thermo' && <ThermoTable pair={pair} />}
        {section === 'blast' && (
          <BlastHits
            forward={pair.forward}
            reverse={pair.reverse}
            offTargetAmplicons={pair.off_target_amplicons}
          />
        )}
      </div>
    </div>
  )
}
