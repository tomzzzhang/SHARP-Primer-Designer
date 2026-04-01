import React, { useState, useEffect } from 'react'
import TmGrid from './TmGrid'
import BlastHits from './BlastHits'
import GenomeManager from './GenomeManager'
import { checkPrimer } from '../api/client'

const SECTIONS = ['tm', 'thermo', 'blast']
const SECTION_LABELS = { tm: 'Tm Grid', thermo: 'Thermodynamics', blast: 'BLAST / Specificity' }
const SAVED_PRIMERS_KEY = 'sharp_saved_primer_sets'

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

function PrimerSummary({ label, primer }) {
  if (!primer) return null
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className="text-xs text-muted-foreground font-medium">{label}:</span>
      <span className="font-mono text-xs break-all">{primer.sequence}</span>
      <span className="text-xs text-muted-foreground">
        {primer.length} nt · {primer.gc_percent}% GC
      </span>
    </div>
  )
}

function loadSavedPrimerSets() {
  try {
    const raw = localStorage.getItem(SAVED_PRIMERS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function savePrimerSets(sets) {
  try {
    localStorage.setItem(SAVED_PRIMERS_KEY, JSON.stringify(sets))
  } catch { /* full */ }
}

export default function PrimerChecker({
  style,
  profiles,
  genomes,
  reactionConditions,
  onReactionConditionsChange,
  blastEnabled,
  onBlastEnabledChange,
  blastAvailable,
  selectedGenomeIds,
  onSelectedGenomeIdsChange,
  offTargetTmThreshold,
  onOffTargetTmThresholdChange,
  onGenomesChange,
  onDesignSimilar,
}) {
  const [seqInput, setSeqInput] = useState('')
  const [result, setResult] = useState(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [section, setSection] = useState('tm')

  // Saved primer sets
  const [savedSets, setSavedSets] = useState(() => loadSavedPrimerSets())
  const [setName, setSetName] = useState('')

  useEffect(() => { savePrimerSets(savedSets) }, [savedSets])

  const profileNames = Object.fromEntries(profiles.map((p) => [p.id, p.name]))
  const canCheck = seqInput.trim().length > 0

  function handleSaveSet() {
    const name = setName.trim()
    if (!name || !seqInput.trim()) return
    const id = Date.now().toString(36)
    setSavedSets([...savedSets, { id, name, sequences: seqInput.trim() }])
    setSetName('')
  }

  function handleLoadSet(set) {
    setSeqInput(set.sequences)
  }

  function handleDeleteSet(id) {
    setSavedSets(savedSets.filter((s) => s.id !== id))
  }

  function handleDesignSimilar() {
    if (!result || !result.primers.length) return
    const primers = result.primers
    const lengths = primers.map((p) => p.length)
    const gcs = primers.map((p) => p.gc_percent)
    const minLen = Math.min(...lengths)
    const maxLen = Math.max(...lengths)
    const avgLen = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
    const minGc = Math.min(...gcs)
    const maxGc = Math.max(...gcs)
    const avgGc = Math.round((gcs.reduce((a, b) => a + b, 0) / gcs.length) * 10) / 10

    onDesignSimilar({
      length_min: Math.max(10, minLen - 2),
      length_opt: avgLen,
      length_max: maxLen + 2,
      tm_min: 54.0,
      tm_opt: 62.0,
      tm_max: 68.0,
      gc_min: Math.max(0, Math.round(minGc - 5)),
      gc_opt: avgGc,
      gc_max: Math.min(100, Math.round(maxGc + 5)),
      max_poly_x: 4,
      max_self_complementarity: 45.0,
      max_self_end_complementarity: 45.0,
      max_hairpin_th: 45.0,
    })
  }

  function handleExportResult() {
    if (!result) return
    const record = {
      export_version: '1.0',
      export_date: new Date().toISOString().slice(0, 10),
      export_tool: 'SHARP Primer Designer v1 — Checker',
      primers: result.primers,
      heterodimer_dg: result.heterodimer_dg,
      heterodimer_tm: result.heterodimer_tm,
      tm_diff: result.tm_diff,
      specificity_status: result.specificity_status,
      off_target_amplicons: result.off_target_amplicons,
      conditions: reactionConditions,
    }
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    a.href = url
    a.download = `SHARP_primer_check_${dateStr}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleCheck() {
    setError('')
    setResult(null)
    setChecking(true)
    try {
      const sequences = seqInput.trim().split(/\n+/).map((s) => s.trim()).filter(Boolean)
      const payload = {
        sequences,
        reaction_conditions: reactionConditions,
        specificity: {
          genome_ids: blastEnabled ? selectedGenomeIds : [],
          enabled: blastEnabled,
          evalue_threshold: 1000,
          min_alignment_length: 15,
          max_off_targets: 0,
          off_target_tm_threshold: offTargetTmThreshold,
        },
      }
      const data = await checkPrimer(payload)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setChecking(false)
    }
  }

  const isPair = result && result.primers.length === 2

  return (
    <div className="flex flex-1 overflow-hidden" style={style}>
      {/* Left panel — input */}
      <aside className="w-72 border-r overflow-y-auto p-3 space-y-4 flex-shrink-0 bg-card">
        {/* Primer sequences */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">
            Primer Sequences
          </h3>
          <textarea
            rows={5}
            placeholder={"One sequence per line, e.g.:\nCGGCTTCTGACTCTCTTTCC\nTTCCTTCAAGCTTTGCCACA"}
            className="w-full border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            value={seqInput}
            onChange={(e) => setSeqInput(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            One per line. If exactly 2, pair thermo (heterodimer) is computed.
          </p>
        </div>

        {/* Saved primer sets */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">
            Saved Primer Sets
          </h3>
          <div className="space-y-1.5">
            <div className="flex gap-1">
              <input
                type="text"
                placeholder="Set name..."
                className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                value={setName}
                onChange={(e) => setSetName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveSet()}
              />
              <button
                onClick={handleSaveSet}
                disabled={!setName.trim() || !seqInput.trim()}
                className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
            {savedSets.length > 0 ? (
              <div className="border rounded max-h-28 overflow-y-auto divide-y">
                {savedSets.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-1 px-2 py-1.5 hover:bg-muted/50 cursor-pointer group"
                    onClick={() => handleLoadSet(s)}
                    title="Click to load"
                  >
                    <span className="text-xs truncate flex-1">{s.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSet(s.id) }}
                      className="text-xs text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 shrink-0"
                      title="Delete"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No saved sets. Enter primers and save above.
              </p>
            )}
          </div>
        </div>

        <hr />

        {/* Condition profiles */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">
            Condition Profiles
          </h3>
          <div className="space-y-1">
            <div>
              <label className="text-xs text-muted-foreground">Primary</label>
              <select
                className="w-full border rounded px-2 py-1 text-xs focus:outline-none mt-0.5"
                value={reactionConditions.primary_profile_id}
                onChange={(e) => onReactionConditionsChange({
                  ...reactionConditions,
                  primary_profile_id: e.target.value,
                })}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Additional Tm grid profiles</label>
              <div className="space-y-0.5 mt-0.5">
                {profiles
                  .filter((p) => p.id !== reactionConditions.primary_profile_id)
                  .map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reactionConditions.additional_profile_ids.includes(p.id)}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...reactionConditions.additional_profile_ids, p.id]
                            : reactionConditions.additional_profile_ids.filter((id) => id !== p.id)
                          onReactionConditionsChange({ ...reactionConditions, additional_profile_ids: ids })
                        }}
                        className="w-3 h-3"
                      />
                      <span className="text-xs">{p.name}</span>
                    </label>
                  ))}
              </div>
            </div>
          </div>
        </div>

        <hr />

        {/* Specificity (BLAST) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
              Specificity (BLAST)
            </h3>
            {blastAvailable ? (
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blastEnabled}
                  onChange={(e) => onBlastEnabledChange(e.target.checked)}
                  className="w-3 h-3"
                />
                <span className="text-xs">enabled</span>
              </label>
            ) : (
              <span className="text-[10px] text-yellow-600 font-medium">not installed</span>
            )}
          </div>
          {blastAvailable && blastEnabled && (
            <>
              <GenomeManager
                genomes={genomes}
                selectedIds={selectedGenomeIds}
                onSelectionChange={onSelectedGenomeIdsChange}
                onGenomesChange={onGenomesChange}
                showCheckboxes
              />
              <div className="mt-2 space-y-1">
                <label className="text-xs text-muted-foreground flex items-center justify-between">
                  <span>Off-target Tm threshold</span>
                  <span className="font-mono font-medium text-foreground">{offTargetTmThreshold}°C</span>
                </label>
                <input
                  type="range"
                  min={25}
                  max={70}
                  step={1}
                  value={offTargetTmThreshold}
                  onChange={(e) => onOffTargetTmThresholdChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 accent-primary cursor-pointer"
                />
              </div>
            </>
          )}
        </div>

        {/* Check button */}
        <button
          onClick={handleCheck}
          disabled={!canCheck || checking}
          className="w-full py-2 bg-primary text-primary-foreground font-medium rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {checking ? 'Checking...' : 'Check Primers'}
        </button>

        {error && (
          <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2 whitespace-pre-line">
            {error}
          </p>
        )}
      </aside>

      {/* Right panel — results */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {!result && !checking && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Enter primer sequences (one per line) and click "Check Primers"
          </div>
        )}

        {checking && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Analyzing...
          </div>
        )}

        {result && result.primers.length > 0 && (
          <>
            {/* Summary */}
            <div className="border rounded bg-card shadow-sm p-3 space-y-1">
              {result.primers.map((p, i) => (
                <PrimerSummary key={i} label={`Primer ${i + 1}`} primer={p} />
              ))}
              {isPair && result.heterodimer_dg != null && (
                <div className="text-xs text-muted-foreground pt-1 border-t mt-1">
                  Heterodimer: ΔG = {result.heterodimer_dg.toFixed(2)} kcal/mol, Tm = {result.heterodimer_tm.toFixed(1)}°C
                </div>
              )}
              <div className="pt-1 border-t mt-1 flex gap-3">
                <button
                  onClick={handleDesignSimilar}
                  className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                  title="Set Builder constraints based on these primers' properties (length, GC%) and switch to Builder"
                >
                  Design Similar Primers →
                </button>
                <button
                  onClick={handleExportResult}
                  className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                  title="Download full analysis as JSON"
                >
                  Export JSON
                </button>
              </div>
            </div>

            {/* Section tabs + content */}
            <div className="border rounded bg-card shadow-sm">
              <div className="flex gap-1 px-3 pt-2 border-b">
                {SECTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSection(s)}
                    className={`px-3 py-1 text-xs font-medium rounded-t transition-colors ${
                      section === s
                        ? 'border border-b-card -mb-px bg-card text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {SECTION_LABELS[s]}
                  </button>
                ))}
              </div>

              <div className="p-3 space-y-4">
                {section === 'tm' && (
                  isPair ? (
                    <TmGrid
                      fwdGrid={result.primers[0].tm_grid}
                      revGrid={result.primers[1].tm_grid}
                      profileNames={profileNames}
                    />
                  ) : (
                    result.primers.map((p, i) => (
                      <div key={i}>
                        {result.primers.length > 1 && (
                          <div className="text-xs font-medium text-muted-foreground mb-1">Primer {i + 1}: {p.sequence.slice(0, 20)}...</div>
                        )}
                        <TmGrid fwdGrid={p.tm_grid} profileNames={profileNames} />
                      </div>
                    ))
                  )
                )}

                {section === 'thermo' && (
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
                        {result.primers.map((p, i) => (
                          <React.Fragment key={i}>
                            <tr className="bg-muted/20">
                              <td colSpan={3} className="border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                Primer {i + 1}: {p.sequence}
                              </td>
                            </tr>
                            <ThermoRow label="Hairpin" dg={p.hairpin_dg} tm={p.hairpin_tm} />
                            <ThermoRow label="Homodimer" dg={p.homodimer_dg} tm={p.homodimer_tm} />
                            <tr className="hover:bg-muted/20">
                              <td className="border px-2 py-1">3' end stability</td>
                              <td className="border px-2 py-1 text-center tabular-nums">{p.end_stability?.toFixed(2) ?? '—'}</td>
                              <td className="border px-2 py-1 text-center">—</td>
                            </tr>
                          </React.Fragment>
                        ))}
                        {isPair && result.heterodimer_dg != null && (
                          <>
                            <tr className="bg-muted/20">
                              <td colSpan={3} className="border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                Pair
                              </td>
                            </tr>
                            <ThermoRow label="Heterodimer" dg={result.heterodimer_dg} tm={result.heterodimer_tm} />
                          </>
                        )}
                      </tbody>
                    </table>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Calculated under primary condition profile. Negative ΔG = thermodynamically favorable.
                    </p>
                  </div>
                )}

                {section === 'blast' && (
                  <div className="space-y-3">
                    {result.primers.map((p, i) => (
                      <BlastHits
                        key={i}
                        forward={p}
                        label={`Primer ${i + 1}`}
                        tmThreshold={offTargetTmThreshold}
                      />
                    ))}
                    {result.off_target_amplicons && result.off_target_amplicons.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-destructive mb-1">
                          Off-target amplicons ({result.off_target_amplicons.length})
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
                            {result.off_target_amplicons.map((a, i) => (
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
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
