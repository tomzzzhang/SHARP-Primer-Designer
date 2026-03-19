import React from 'react'
import { TM_METHOD_LABELS } from '../lib/defaults'

/**
 * Displays the Tm grid (methods × profiles) for a single primer or side-by-side for a pair.
 * Props:
 *   fwdGrid: TmGrid
 *   revGrid: TmGrid (optional; if omitted shows single primer)
 *   profileNames: { [profile_id]: string }
 */
export default function TmGrid({ fwdGrid, revGrid, profileNames }) {
  if (!fwdGrid) return null

  const methods = ['santalucia_primer3', 'santalucia_biopython', 'owczarzy_2008', 'wallace']

  // Collect all profile IDs from non-wallace methods
  const profileIds = Object.keys(fwdGrid.santalucia_primer3 || {})

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full border-collapse">
        <thead>
          <tr className="bg-muted/50">
            <th className="border px-2 py-1 text-left font-medium">Method</th>
            {profileIds.map((pid) => (
              <th key={pid} colSpan={revGrid ? 2 : 1} className="border px-2 py-1 text-center font-medium">
                {profileNames?.[pid] || pid}
              </th>
            ))}
            {/* Wallace column */}
            <th colSpan={revGrid ? 2 : 1} className="border px-2 py-1 text-center font-medium">
              (all conditions)
            </th>
          </tr>
          {revGrid && (
            <tr className="bg-muted/30 text-[10px]">
              <th className="border px-2 py-1" />
              {profileIds.flatMap((pid) => [
                <th key={`${pid}-fwd`} className="border px-2 py-1 text-center">Fwd</th>,
                <th key={`${pid}-rev`} className="border px-2 py-1 text-center">Rev</th>,
              ])}
              <th className="border px-2 py-1 text-center">Fwd</th>
              <th className="border px-2 py-1 text-center">Rev</th>
            </tr>
          )}
        </thead>
        <tbody>
          {methods.map((method) => {
            const fwdVals = fwdGrid[method] || {}
            const revVals = revGrid ? (revGrid[method] || {}) : {}
            const isWallace = method === 'wallace'
            const displayIds = isWallace ? ['_'] : profileIds

            return (
              <tr key={method} className="hover:bg-muted/20">
                <td className="border px-2 py-1 font-medium whitespace-nowrap">
                  {TM_METHOD_LABELS[method]}
                </td>
                {displayIds.map((pid) => {
                  const fv = fwdVals[pid]
                  const rv = revVals[pid]
                  if (revGrid) {
                    return (
                      <React.Fragment key={pid}>
                        <td className="border px-2 py-1 text-center tabular-nums">
                          {fv != null ? fv.toFixed(1) : '—'}
                        </td>
                        <td className="border px-2 py-1 text-center tabular-nums">
                          {rv != null ? rv.toFixed(1) : '—'}
                        </td>
                      </React.Fragment>
                    )
                  }
                  return (
                    <td key={pid} className="border px-2 py-1 text-center tabular-nums">
                      {fv != null ? fv.toFixed(1) : '—'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground mt-1">
        All temperatures in °C. Wallace rule is sequence-only (no salt correction).
        SHARP isothermal performance is not predicted by Tm.
      </p>
    </div>
  )
}
