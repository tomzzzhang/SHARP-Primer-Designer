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

// ─── Enable checkbox ────────────────────────────────────────────────────────

function EnableCheckbox({ constraintKey, enabled, onChange }) {
  return (
    <input
      type="checkbox"
      checked={enabled[constraintKey] !== false}
      onChange={(e) => onChange({ ...enabled, [constraintKey]: e.target.checked })}
      className="w-3 h-3 shrink-0 accent-primary cursor-pointer"
      title={enabled[constraintKey] !== false ? 'Constraint active - uncheck to disable' : 'Constraint disabled - primer3 will not filter on this'}
    />
  )
}

// ─── Field components ────────────────────────────────────────────────────────

function NumInput({ value, onChange, step = 1, disabled = false, className = '' }) {
  // Allow empty string while typing; parse to number on blur
  const [localVal, setLocalVal] = useState(null) // null = use prop value
  const display = localVal !== null ? localVal : value

  return (
    <input
      type="number"
      step={step}
      disabled={disabled}
      className={className}
      value={display}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '' || raw === '-') {
          setLocalVal(raw)
        } else {
          setLocalVal(null)
          onChange(parseFloat(raw) || 0)
        }
      }}
      onBlur={() => {
        if (localVal !== null) {
          onChange(parseFloat(localVal) || 0)
          setLocalVal(null)
        }
      }}
    />
  )
}

function MinOptMax({ label, minKey, optKey, maxKey, values, onChange, step = 1, unit = '', tip, constraintKey, enabled, onEnabledChange }) {
  const isEnabled = enabled[constraintKey] !== false
  return (
    <div className={`space-y-1 ${!isEnabled ? 'opacity-40' : ''}`}>
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <EnableCheckbox constraintKey={constraintKey} enabled={enabled} onChange={onEnabledChange} />
        <span className={!isEnabled ? 'line-through' : ''}>{label}{unit ? ` (${unit})` : ''}</span>
        {tip && <HelpDot tip={tip} />}
      </label>
      <div className="grid grid-cols-3 gap-1">
        {[['min', minKey], ['opt', optKey], ['max', maxKey]].map(([lbl, key]) => (
          <div key={key}>
            <div className="text-[10px] text-muted-foreground text-center">{lbl}</div>
            <NumInput
              step={step}
              disabled={!isEnabled}
              className="w-full border rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring disabled:bg-muted disabled:cursor-not-allowed"
              value={values[key]}
              onChange={(v) => onChange({ ...values, [key]: v })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function SingleField({ label, fieldKey, values, onChange, step = 0.1, unit = '', tip, constraintKey, enabled, onEnabledChange }) {
  const isEnabled = enabled[constraintKey] !== false
  return (
    <div className={`flex items-center justify-between gap-2 ${!isEnabled ? 'opacity-40' : ''}`}>
      <label className="text-xs text-muted-foreground flex-1 flex items-center gap-1.5">
        <EnableCheckbox constraintKey={constraintKey} enabled={enabled} onChange={onEnabledChange} />
        <span className={`whitespace-nowrap ${!isEnabled ? 'line-through' : ''}`}>{label}{unit ? ` (${unit})` : ''}</span>
        {tip && <HelpDot tip={tip} />}
      </label>
      <NumInput
        step={step}
        disabled={!isEnabled}
        className="w-20 border rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring disabled:bg-muted disabled:cursor-not-allowed"
        value={values[fieldKey]}
        onChange={(v) => onChange({ ...values, [fieldKey]: v })}
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
  enabledConstraints,
  onEnabledConstraintsChange,
  numPairs,
  onNumPairsChange,
  diversityMode,
  onDiversityModeChange,
  savedConfigs = [],
  onSaveConfig,
  onUpdateConfig,
  onLoadConfig,
  onDeleteConfig,
  onResetDefaults,
}) {
  const [configName, setConfigName] = useState('')
  const [configError, setConfigError] = useState('')

  async function handleSave() {
    const name = configName.trim()
    if (!name) return
    try {
      setConfigError('')
      await onSaveConfig(name)
      setConfigName('')
    } catch (err) {
      setConfigError(err.message)
    }
  }

  async function handleOverwrite(config) {
    try {
      setConfigError('')
      await onUpdateConfig(config)
    } catch (err) {
      setConfigError(err.message)
    }
  }

  return (
    <div className="space-y-4">
      {/* Saved configs */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">
          Saved Configs
        </h3>
        <div className="space-y-1.5">
          <div className="flex gap-1">
            <input
              type="text"
              placeholder="Config name..."
              className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              value={configName}
              onChange={(e) => setConfigName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              onClick={handleSave}
              disabled={!configName.trim()}
              className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
          <button
            onClick={onResetDefaults}
            className="w-full px-2 py-1 text-xs border rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Reset to Defaults
          </button>
          {configError && <p className="text-xs text-destructive">{configError}</p>}
          {savedConfigs.length > 0 ? (
            <div className="ml-1 border-2 border-border rounded bg-background overflow-y-scroll max-h-28 divide-y" style={{ scrollbarWidth: 'auto', scrollbarColor: 'hsl(var(--border)) transparent' }}>
              {savedConfigs.map((cfg) => (
                <div
                  key={cfg.id}
                  className="flex items-center gap-1 px-2 py-1.5 hover:bg-accent cursor-pointer group border-l-2 border-l-transparent hover:border-l-primary/40"
                  onClick={() => onLoadConfig(cfg)}
                  title="Click to load this config"
                >
                  <span className="text-xs truncate flex-1">{cfg.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOverwrite(cfg) }}
                    className="text-[10px] text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 shrink-0"
                    title="Overwrite with current settings"
                  >
                    Update
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteConfig(cfg.id) }}
                    className="text-xs text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 shrink-0"
                    title="Delete config"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No saved configs. Set your parameters and save a preset above.
            </p>
          )}
        </div>
      </div>

      <hr />

      {/* Primer constraints */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">
          Primer Constraints
        </h3>
        <div className="space-y-2">
          <MinOptMax
            label="Length" unit="nt"
            minKey="length_min" optKey="length_opt" maxKey="length_max"
            values={primerConstraints} onChange={onPrimerConstraintsChange}
            tip={TIPS.length}
            constraintKey="length" enabled={enabledConstraints} onEnabledChange={onEnabledConstraintsChange}
          />
          <MinOptMax
            label="Tm" unit={"°C"}
            minKey="tm_min" optKey="tm_opt" maxKey="tm_max"
            values={primerConstraints} onChange={onPrimerConstraintsChange}
            step={0.5}
            tip={TIPS.tm}
            constraintKey="tm" enabled={enabledConstraints} onEnabledChange={onEnabledConstraintsChange}
          />
          <MinOptMax
            label="GC" unit="%"
            minKey="gc_min" optKey="gc_opt" maxKey="gc_max"
            values={primerConstraints} onChange={onPrimerConstraintsChange}
            step={1}
            tip={TIPS.gc}
            constraintKey="gc" enabled={enabledConstraints} onEnabledChange={onEnabledConstraintsChange}
          />
          <SingleField label="Max poly-X" fieldKey="max_poly_x" values={primerConstraints} onChange={onPrimerConstraintsChange} step={1} tip={TIPS.max_poly_x}
            constraintKey="max_poly_x" enabled={enabledConstraints} onEnabledChange={onEnabledConstraintsChange}
          />
          <SingleField label="Max self-comp (Th °C)" fieldKey="max_self_complementarity" values={primerConstraints} onChange={onPrimerConstraintsChange} tip={TIPS.max_self_complementarity}
            constraintKey="max_self_complementarity" enabled={enabledConstraints} onEnabledChange={onEnabledConstraintsChange}
          />
          <SingleField label="Max 3' self-comp (Th °C)" fieldKey="max_self_end_complementarity" values={primerConstraints} onChange={onPrimerConstraintsChange} tip={TIPS.max_self_end_complementarity}
            constraintKey="max_self_end_complementarity" enabled={enabledConstraints} onEnabledChange={onEnabledConstraintsChange}
          />
          <SingleField label="Max hairpin Tm (°C)" fieldKey="max_hairpin_th" values={primerConstraints} onChange={onPrimerConstraintsChange} tip={TIPS.max_hairpin_th}
            constraintKey="max_hairpin_th" enabled={enabledConstraints} onEnabledChange={onEnabledConstraintsChange}
          />
        </div>
      </div>

      {/* Pair constraints */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">
          Pair Constraints
        </h3>
        <div className="space-y-2">
          <SingleField label="Max delta-Tm (°C)" fieldKey="max_tm_diff" values={pairConstraints} onChange={onPairConstraintsChange} tip={TIPS.max_tm_diff}
            constraintKey="max_tm_diff" enabled={enabledConstraints} onEnabledChange={onEnabledConstraintsChange}
          />
          <SingleField label="Max pair comp (Th °C)" fieldKey="max_pair_complementarity" values={pairConstraints} onChange={onPairConstraintsChange} tip={TIPS.max_pair_complementarity}
            constraintKey="max_pair_complementarity" enabled={enabledConstraints} onEnabledChange={onEnabledConstraintsChange}
          />
          <SingleField label="Max pair 3' comp (Th °C)" fieldKey="max_pair_end_complementarity" values={pairConstraints} onChange={onPairConstraintsChange} tip={TIPS.max_pair_end_complementarity}
            constraintKey="max_pair_end_complementarity" enabled={enabledConstraints} onEnabledChange={onEnabledConstraintsChange}
          />
        </div>
      </div>

      {/* Amplicon constraints */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">
          Amplicon
        </h3>
        <MinOptMax
          label="Size" unit="bp"
          minKey="size_min" optKey="size_opt" maxKey="size_max"
          values={ampliconConstraints} onChange={onAmpliconConstraintsChange}
          step={10}
          tip={TIPS.amplicon_size}
          constraintKey="amplicon_size" enabled={enabledConstraints} onEnabledChange={onEnabledConstraintsChange}
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

      {/* Position diversity */}
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">
          Position diversity
          <HelpDot tip="Controls how spread out primer positions are across the template. 'Off' returns the best-scoring pairs (may cluster). Higher settings enforce spacing between primer start sites to cover more regions." />
        </label>
        <select
          className="border rounded px-2 py-1 text-xs focus:outline-none"
          value={diversityMode}
          onChange={(e) => onDiversityModeChange(e.target.value)}
        >
          <option value="off">Off (best score)</option>
          <option value="sparse">Sparse (10 bp spacing)</option>
          <option value="spread">Spread (25 bp spacing)</option>
          <option value="coverage">Coverage (region bins)</option>
        </select>
      </div>
    </div>
  )
}
