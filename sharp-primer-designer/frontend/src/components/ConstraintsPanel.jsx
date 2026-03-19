import React, { useState, useRef } from 'react'

// ─── Tooltip descriptions for every parameter ────────────────────────────────

const TIPS = {
  // Primer constraints
  length:              'How many nucleotides long each primer should be. Shorter primers bind faster but less specifically; longer primers are more specific but may form secondary structures.',
  tm:                  'Melting temperature — the temperature at which half the primer is bound to its complement. Higher Tm means stronger binding. Primers in a pair should have similar Tm values.',
  gc:                  'Percentage of G and C bases in the primer. GC pairs form 3 hydrogen bonds (vs. 2 for AT), so higher GC% generally means higher Tm and stronger binding.',
  max_poly_x:         'Maximum allowed run of identical bases in a row (e.g. AAAA = 4). Long homopolymers can cause mispriming and are hard to synthesize accurately.',
  max_self_complementarity:   'Maximum thermodynamic score (Th) for self-complementarity — how strongly a primer can bind to itself forming a self-dimer. Lower values reduce the chance of primer molecules binding to each other instead of the template.',
  max_self_end_complementarity: "Maximum thermodynamic score (Th) for complementarity at the primer's 3' end with itself. 3' dimers are especially problematic because DNA polymerase can extend them, creating artifacts.",
  max_hairpin_th:      'Maximum allowed hairpin melting temperature. A hairpin forms when a primer folds back on itself. If the hairpin is too stable (high Tm), the primer won\'t bind the template efficiently.',

  // Pair constraints
  max_tm_diff:         'Maximum allowed difference in Tm between the forward and reverse primers. Matched Tm values ensure both primers anneal efficiently at the same temperature.',
  max_pair_complementarity:   'Maximum thermodynamic score (Th) for complementarity between the forward and reverse primers (heterodimer). High complementarity means they may bind each other instead of the template.',
  max_pair_end_complementarity: "Maximum thermodynamic score (Th) for 3' end complementarity between the forward and reverse primers. 3' heterodimers can be extended by polymerase, generating primer-dimer artifacts.",

  // Amplicon constraints
  amplicon_size:       'The length of the DNA fragment amplified between the two primers (including primer sequences). Smaller amplicons amplify more efficiently; larger ones capture more of the target region.',

  // Other
  num_pairs:           'How many primer pair candidates to return, ranked by primer3 penalty score (lower penalty = better match to your optimal parameters).',
}

// ─── HelpDot component ──────────────────────────────────────────────────────

function HelpDot({ tip }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef(null)

  function handleEnter() {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const tipW = 220
    const tipH = 80 // estimate
    let left = rect.left + rect.width / 2 - tipW / 2
    let top = rect.top - tipH - 6

    // Keep within viewport horizontally
    if (left < 8) left = 8
    if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8

    // If clipped at top, show below instead
    if (top < 8) top = rect.bottom + 6

    setPos({ top, left })
    setShow(true)
  }

  return (
    <span
      ref={ref}
      className="inline-flex items-center ml-1 shrink-0"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 min-w-[14px] rounded-full bg-muted text-muted-foreground text-[9px] font-bold cursor-help leading-none">
        ?
      </span>
      {show && (
        <span
          className="fixed w-[220px] px-2.5 py-1.5 text-[11px] leading-snug text-white bg-gray-800 rounded shadow-lg z-[9999] normal-case font-normal tracking-normal"
          style={{ top: pos.top, left: pos.left }}
        >
          {tip}
        </span>
      )}
    </span>
  )
}

// ─── Field components ────────────────────────────────────────────────────────

function MinOptMax({ label, minKey, optKey, maxKey, values, onChange, step = 1, unit = '', tip }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground flex items-center">
        <span>{label}{unit ? ` (${unit})` : ''}</span>
        {tip && <HelpDot tip={tip} />}
      </label>
      <div className="grid grid-cols-3 gap-1">
        {[['min', minKey], ['opt', optKey], ['max', maxKey]].map(([lbl, key]) => (
          <div key={key}>
            <div className="text-[10px] text-muted-foreground text-center">{lbl}</div>
            <input
              type="number"
              step={step}
              className="w-full border rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
              value={values[key]}
              onChange={(e) => onChange({ ...values, [key]: parseFloat(e.target.value) || 0 })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function SingleField({ label, fieldKey, values, onChange, step = 0.1, unit = '', tip }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-muted-foreground flex-1 flex items-center">
        <span className="whitespace-nowrap">{label}{unit ? ` (${unit})` : ''}</span>
        {tip && <HelpDot tip={tip} />}
      </label>
      <input
        type="number"
        step={step}
        className="w-20 border rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
        value={values[fieldKey]}
        onChange={(e) => onChange({ ...values, [fieldKey]: parseFloat(e.target.value) || 0 })}
      />
    </div>
  )
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export default function ConstraintsPanel({
  primerConstraints,
  onPrimerConstraintsChange,
  pairConstraints,
  onPairConstraintsChange,
  ampliconConstraints,
  onAmpliconConstraintsChange,
  numPairs,
  onNumPairsChange,
}) {
  return (
    <div className="space-y-4">
      {/* Primer constraints */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Primer Constraints
        </h3>
        <div className="space-y-2">
          <MinOptMax
            label="Length" unit="nt"
            minKey="length_min" optKey="length_opt" maxKey="length_max"
            values={primerConstraints} onChange={onPrimerConstraintsChange}
            tip={TIPS.length}
          />
          <MinOptMax
            label="Tm" unit={"°C"}
            minKey="tm_min" optKey="tm_opt" maxKey="tm_max"
            values={primerConstraints} onChange={onPrimerConstraintsChange}
            step={0.5}
            tip={TIPS.tm}
          />
          <MinOptMax
            label="GC" unit="%"
            minKey="gc_min" optKey="gc_opt" maxKey="gc_max"
            values={primerConstraints} onChange={onPrimerConstraintsChange}
            step={1}
            tip={TIPS.gc}
          />
          <SingleField label="Max poly-X" fieldKey="max_poly_x" values={primerConstraints} onChange={onPrimerConstraintsChange} step={1} tip={TIPS.max_poly_x} />
          <SingleField label="Max self-comp (Th °C)" fieldKey="max_self_complementarity" values={primerConstraints} onChange={onPrimerConstraintsChange} tip={TIPS.max_self_complementarity} />
          <SingleField label="Max 3' self-comp (Th °C)" fieldKey="max_self_end_complementarity" values={primerConstraints} onChange={onPrimerConstraintsChange} tip={TIPS.max_self_end_complementarity} />
          <SingleField label="Max hairpin Tm (°C)" fieldKey="max_hairpin_th" values={primerConstraints} onChange={onPrimerConstraintsChange} tip={TIPS.max_hairpin_th} />
        </div>
      </div>

      {/* Pair constraints */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Pair Constraints
        </h3>
        <div className="space-y-2">
          <SingleField label="Max ΔTm (°C)" fieldKey="max_tm_diff" values={pairConstraints} onChange={onPairConstraintsChange} tip={TIPS.max_tm_diff} />
          <SingleField label="Max pair comp (Th °C)" fieldKey="max_pair_complementarity" values={pairConstraints} onChange={onPairConstraintsChange} tip={TIPS.max_pair_complementarity} />
          <SingleField label="Max pair 3' comp (Th °C)" fieldKey="max_pair_end_complementarity" values={pairConstraints} onChange={onPairConstraintsChange} tip={TIPS.max_pair_end_complementarity} />
        </div>
      </div>

      {/* Amplicon constraints */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Amplicon
        </h3>
        <MinOptMax
          label="Size" unit="bp"
          minKey="size_min" optKey="size_opt" maxKey="size_max"
          values={ampliconConstraints} onChange={onAmpliconConstraintsChange}
          step={10}
          tip={TIPS.amplicon_size}
        />
      </div>

      {/* Num pairs */}
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">
          Number of pairs to return
          <HelpDot tip={TIPS.num_pairs} />
        </label>
        <select
          className="border rounded px-2 py-1 text-xs focus:outline-none"
          value={numPairs}
          onChange={(e) => onNumPairsChange(parseInt(e.target.value))}
        >
          {[5, 10, 20, 30].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
