import React, { useState, useEffect } from 'react'
import TemplateInput from './components/TemplateInput'
import ConstraintsPanel from './components/ConstraintsPanel'
import GenomeManager from './components/GenomeManager'
import ResultsTable from './components/ResultsTable'
import PairDetail from './components/PairDetail'
import ProfileManager from './components/ProfileManager'
import ProgressBar from './components/ProgressBar'
import ParameterReference from './components/ParameterReference'
import TemplateMap from './components/TemplateMap'
import PrimerChecker from './components/PrimerChecker'
import OrderedPrimersManager from './components/OrderedPrimersManager'
import ExportWizard from './components/ExportWizard'

function extractApiError(err, fallback) {
  const d = err.detail
  if (Array.isArray(d)) return d.map((e) => e.msg).join('; ')
  return d || fallback
}
import { getProfiles, getGenomes, getSequences, saveSequence, deleteSequence, getConfigs, saveConfigApi, updateConfigApi, deleteConfigApi, getOrderedPrimers } from './api/client'
import {
  DEFAULT_PRIMER_CONSTRAINTS,
  DEFAULT_PAIR_CONSTRAINTS,
  DEFAULT_AMPLICON_CONSTRAINTS,
  DEFAULT_SPECIFICITY,
  DEFAULT_REACTION_CONDITIONS,
  DEFAULT_ENABLED_CONSTRAINTS,
} from './lib/defaults'

// ─── Settings modal ────────────────────────────────────────────────────────────

function SettingsModal({ open, onClose, profiles, onProfilesChange, genomes, selectedGenomeIds, onGenomesChange, onGenomeSelectionChange, metadata }) {
  const [tab, setTab] = useState('profiles')
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold">Settings</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="flex gap-1 px-4 pt-2 border-b">
          {['profiles', 'genomes', 'about'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm font-medium rounded-t capitalize transition-colors ${
                tab === t ? 'border border-b-card -mb-px bg-card text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'profiles' ? 'Condition Profiles' : t === 'genomes' ? 'Reference Genomes' : 'About'}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {tab === 'profiles' && (
            <ProfileManager profiles={profiles} onProfilesChange={onProfilesChange} />
          )}
          {tab === 'genomes' && (
            <GenomeManager
              genomes={genomes}
              selectedIds={selectedGenomeIds}
              onSelectionChange={onGenomeSelectionChange}
              onGenomesChange={onGenomesChange}
              showCheckboxes={false}
            />
          )}
          {tab === 'about' && (
            <div className="space-y-2 text-sm">
              <p><strong>SHARP Primer Designer</strong> — v1.0</p>
              <p className="text-muted-foreground text-xs">
                Primer design for SHARP Diagnostics isothermal amplification platform.
                Tm estimates are for reference only; Tm's relationship to SHARP performance is not established.
              </p>
              {metadata && (
                <dl className="text-xs space-y-1 mt-3">
                  <div><dt className="inline text-muted-foreground">primer3-py: </dt><dd className="inline">{metadata.primer3_version}</dd></div>
                  {metadata.blast_version && (
                    <div><dt className="inline text-muted-foreground">BLAST+: </dt><dd className="inline">{metadata.blast_version}</dd></div>
                  )}
                </dl>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Session persistence ──────────────────────────────────────────────────────

const SESSION_KEY = 'sharp_primer_session'
const SETTINGS_KEY = 'sharp_primer_settings'

function saveSession(data) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data))
  } catch (e) { /* localStorage full or unavailable */ }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

function saveSettings(data) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data))
  } catch (e) { /* localStorage full or unavailable */ }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  // Template
  const [template, setTemplate] = useState({
    sequence: null, fasta_file: null, accession: null,
    target_start: null, target_end: null, excluded_regions: null,
  })

  // Load saved settings (or use defaults)
  const _saved = loadSettings()

  // Constraints
  const [primerConstraints, setPrimerConstraints] = useState(_saved?.primerConstraints || DEFAULT_PRIMER_CONSTRAINTS)
  const [pairConstraints, setPairConstraints] = useState(_saved?.pairConstraints || DEFAULT_PAIR_CONSTRAINTS)
  const [ampliconConstraints, setAmpliconConstraints] = useState(_saved?.ampliconConstraints || DEFAULT_AMPLICON_CONSTRAINTS)
  const [numPairs, setNumPairs] = useState(_saved?.numPairs ?? 10)
  const [enabledConstraints, setEnabledConstraints] = useState(_saved?.enabledConstraints || DEFAULT_ENABLED_CONSTRAINTS)
  const [diversityMode, setDiversityMode] = useState(_saved?.diversityMode || 'off')

  // Profiles and conditions
  const [profiles, setProfiles] = useState([])
  const [reactionConditions, setReactionConditions] = useState(_saved?.reactionConditions || DEFAULT_REACTION_CONDITIONS)

  // Genomes
  const [genomes, setGenomes] = useState([])
  const [selectedGenomeIds, setSelectedGenomeIds] = useState(_saved?.selectedGenomeIds || ['lambda'])
  const [blastEnabled, setBlastEnabled] = useState(_saved?.blastEnabled ?? true)
  const [blastAvailable, setBlastAvailable] = useState(true)
  const [offTargetTmThreshold, setOffTargetTmThreshold] = useState(_saved?.offTargetTmThreshold ?? DEFAULT_SPECIFICITY.off_target_tm_threshold)

  // Results
  const [results, setResults] = useState(null)
  const [selectedPair, setSelectedPair] = useState(null)
  const [designing, setDesigning] = useState(false)
  const [designError, setDesignError] = useState('')
  const [progress, setProgress] = useState(null)  // {step, message, pct}
  const [checkedRanks, setCheckedRanks] = useState(new Set())
  const [exporting, setExporting] = useState(false)
  const [exportWizardOpen, setExportWizardOpen] = useState(false)
  const [resultsSource, setResultsSource] = useState(null) // null = designed, "imported" = imported

  // Saved sequences
  const [savedSequences, setSavedSequences] = useState([])

  // Saved configs (parameter presets)
  const [savedConfigs, setSavedConfigs] = useState([])

  // Ordered primers (exclusion library)
  const [orderedPrimers, setOrderedPrimers] = useState([])
  const [excludeOrdered, setExcludeOrdered] = useState(_saved?.excludeOrdered ?? true)
  const [orderedManagerOpen, setOrderedManagerOpen] = useState(false)

  // Settings modal & help
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [lastMetadata, setLastMetadata] = useState(null)

  // Version key (fetched from backend, single source of truth)
  const [buildVersion, setBuildVersion] = useState('...')

  // App mode: 'builder' or 'checker'
  const [appMode, setAppMode] = useState('builder')

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    saveSettings({
      primerConstraints, pairConstraints, ampliconConstraints,
      numPairs, enabledConstraints, diversityMode,
      reactionConditions, selectedGenomeIds, blastEnabled, offTargetTmThreshold,
      excludeOrdered,
    })
  }, [primerConstraints, pairConstraints, ampliconConstraints, numPairs, enabledConstraints, diversityMode, reactionConditions, selectedGenomeIds, blastEnabled, offTargetTmThreshold, excludeOrdered])

  // Load profiles, genomes, saved sequences, check BLAST, and restore session on mount
  useEffect(() => {
    fetch('/api/version').then(r => r.json()).then(d => setBuildVersion(d.version)).catch(() => setBuildVersion('???'))
    fetch('http://localhost:8000/health').then(r => r.json()).then((data) => {
      if (!data.blast_available) {
        setBlastAvailable(false)
        setBlastEnabled(false)
      }
    }).catch(() => {})
    getProfiles().then((r) => setProfiles(r.profiles)).catch(console.error)
    getGenomes().then((r) => {
      setGenomes(r.genomes)
      // Auto-select lambda if present
      const lambdaPresent = r.genomes.some((g) => g.id === 'lambda')
      if (lambdaPresent) setSelectedGenomeIds(['lambda'])
    }).catch(console.error)
    loadSavedSequences()
    loadSavedConfigs()
    loadOrderedPrimers()

    // Restore previous session (results + template)
    const session = loadSession()
    if (session?.results) {
      setResults(session.results)
      setLastMetadata(session.results.design_metadata || null)
      if (session.resultsSource) setResultsSource(session.resultsSource)
      if (session.template) setTemplate(session.template)
    }
  }, [])

  function loadSavedSequences() {
    getSequences().then((r) => setSavedSequences(r.sequences)).catch(console.error)
  }

  async function handleSaveSequence(seq) {
    await saveSequence({ id: '', ...seq })
    loadSavedSequences()
  }

  async function handleDeleteSequence(id) {
    await deleteSequence(id)
    loadSavedSequences()
  }

  // ── Ordered primers ──────────────────────────────────────────────────────
  function loadOrderedPrimers() {
    return getOrderedPrimers()
      .then((r) => setOrderedPrimers(r.primers || []))
      .catch(console.error)
  }

  // ── Saved configs ────────────────────────────────────────────────────────
  function loadSavedConfigs() {
    getConfigs().then((r) => setSavedConfigs(r.configs)).catch(console.error)
  }

  async function handleSaveConfig(name) {
    await saveConfigApi({
      id: '',
      name,
      primer_constraints: primerConstraints,
      pair_constraints: pairConstraints,
      amplicon_constraints: ampliconConstraints,
      enabled_constraints: enabledConstraints,
      num_pairs: numPairs,
      diversity_mode: diversityMode,
      reaction_conditions: reactionConditions,
      blast_enabled: blastEnabled,
      selected_genome_ids: selectedGenomeIds,
      off_target_tm_threshold: offTargetTmThreshold,
    })
    loadSavedConfigs()
  }

  async function handleUpdateConfig(config) {
    await updateConfigApi(config.id, {
      ...config,
      primer_constraints: primerConstraints,
      pair_constraints: pairConstraints,
      amplicon_constraints: ampliconConstraints,
      enabled_constraints: enabledConstraints,
      num_pairs: numPairs,
      diversity_mode: diversityMode,
      reaction_conditions: reactionConditions,
      blast_enabled: blastEnabled,
      selected_genome_ids: selectedGenomeIds,
      off_target_tm_threshold: offTargetTmThreshold,
    })
    loadSavedConfigs()
  }

  function handleLoadConfig(config) {
    setPrimerConstraints(config.primer_constraints)
    setPairConstraints(config.pair_constraints)
    setAmpliconConstraints(config.amplicon_constraints)
    setEnabledConstraints(config.enabled_constraints)
    setNumPairs(config.num_pairs)
    setDiversityMode(config.diversity_mode)
    setReactionConditions(config.reaction_conditions)
    setBlastEnabled(config.blast_enabled)
    setSelectedGenomeIds(config.selected_genome_ids)
    setOffTargetTmThreshold(config.off_target_tm_threshold)
  }

  async function handleDeleteConfig(id) {
    await deleteConfigApi(id)
    loadSavedConfigs()
  }

  const primaryProfile = profiles.find((p) => p.id === reactionConditions.primary_profile_id)
  const profileNames = Object.fromEntries(profiles.map((p) => [p.id, p.name]))

  async function handleDesign() {
    setDesignError('')
    setDesigning(true)
    setResults(null)
    setSelectedPair(null)
    setCheckedRanks(new Set())
    setResultsSource(null)
    setProgress({ step: 'template', message: 'Preparing request...', pct: 2 })

    const templatePayload = {}
    if (template.sequence) templatePayload.sequence = template.sequence
    else if (template.fasta_file) templatePayload.fasta_file = template.fasta_file
    else if (template.accession) templatePayload.accession = template.accession
    if (template.target_start && template.target_end) {
      templatePayload.target_start = template.target_start
      templatePayload.target_length = template.target_end - template.target_start + 1
    }
    if (template.excluded_regions) templatePayload.excluded_regions = template.excluded_regions

    // Collect disabled constraint keys
    const disabledConstraints = Object.entries(enabledConstraints)
      .filter(([, v]) => v === false)
      .map(([k]) => k)

    const excludedSequences = (excludeOrdered && orderedPrimers.length > 0)
      ? orderedPrimers.map((p) => p.sequence)
      : []

    const payload = {
      template: templatePayload,
      primer_constraints: primerConstraints,
      pair_constraints: pairConstraints,
      amplicon_constraints: ampliconConstraints,
      disabled_constraints: disabledConstraints,
      reaction_conditions: reactionConditions,
      specificity: {
        genome_ids: blastEnabled ? selectedGenomeIds : [],
        enabled: blastEnabled,
        evalue_threshold: 1000,
        min_alignment_length: 15,
        max_off_targets: 0,
        off_target_tm_threshold: offTargetTmThreshold,
      },
      num_pairs: numPairs,
      diversity_mode: diversityMode,
      excluded_sequences: excludedSequences,
    }

    try {
      const res = await fetch('/api/design/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(extractApiError(err, res.statusText))
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          buffer += decoder.decode() // flush remaining bytes
          break
        }
        buffer += decoder.decode(value, { stream: true })

        // Parse SSE lines from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete last line

        let eventType = null
        let dataLine = null
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            dataLine = line.slice(6).trim()
          } else if (line === '' && eventType && dataLine) {
            // Dispatch the event
            let data
            try {
              data = JSON.parse(dataLine)
            } catch (parseErr) {
              console.warn('SSE JSON parse error:', parseErr, dataLine)
              eventType = null
              dataLine = null
              continue
            }
            if (eventType === 'progress') {
              setProgress(data)
            } else if (eventType === 'done') {
              setProgress({ step: 'ranking', message: 'Done!', pct: 100 })
              setResults(data)
              setLastMetadata(data.design_metadata)
              saveSession({ results: data, template, resultsSource: null })
              setTimeout(() => setProgress(null), 800)
              // Warn if 0 results with target region
              if (data.pairs?.length === 0 && template.target_start && template.target_end) {
                setDesignError(
                  'No primer pairs found for this target region. Try:\n' +
                  '• Expanding the target region (drag handles wider)\n' +
                  '• Increasing the amplicon size range\n' +
                  '• Disabling some constraints (uncheck parameters)'
                )
              }
            } else if (eventType === 'error') {
              throw new Error(data.message)
            }
            eventType = null
            dataLine = null
          }
        }
      }
    } catch (err) {
      setDesignError(err.message)
      setProgress(null)
    } finally {
      setDesigning(false)
    }
  }

  async function handleExport({ targetName, primerNames, mapSvg }) {
    if (!results || checkedRanks.size === 0) return
    setExporting(true)
    try {
      const selectedPairs = results.pairs.filter((p) => checkedRanks.has(p.rank))
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairs: selectedPairs,
          template_info: results.template_info,
          design_metadata: results.design_metadata,
          target_name: targetName,
          primer_names: primerNames,
          map_svg: mapSvg,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(extractApiError(err, res.statusText))
      }
      // Download the zip file
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      a.href = url
      a.download = `SHARP_primer_export_${dateStr}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setExportWizardOpen(false)
    } catch (err) {
      setDesignError(`Export failed: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  async function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const record = JSON.parse(text)
        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(extractApiError(err, res.statusText))
        }
        const data = await res.json()
        setResults(data)
        setResultsSource('imported')
        saveSession({ results: data, template, resultsSource: 'imported' })
        setSelectedPair(null)
        setCheckedRanks(new Set())
        setDesignError('')
      } catch (err) {
        setDesignError(`Import failed: ${err.message}`)
      }
    }
    input.click()
  }

  const canDesign = template.sequence || template.fasta_file || template.accession

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-4 py-2.5 flex items-center justify-between bg-card shadow-sm">
        <div>
          <h1 className="font-bold text-lg text-foreground">
            SHARP Primer Designer
            <span className="ml-2 text-[10px] font-mono text-muted-foreground align-middle">{buildVersion}</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Tm estimates are reference only — not a predictor of SHARP isothermal performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode switcher */}
          <div className="flex border rounded overflow-hidden mr-1">
            {[['builder', 'Builder'], ['checker', 'Checker']].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setAppMode(mode)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  appMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleImport}
            className="px-3 py-1.5 text-sm border rounded text-foreground hover:bg-muted transition-colors"
            title="Import a previously exported primer record (.json)"
          >
            Import
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            className="px-3 py-1.5 text-sm border rounded text-foreground hover:bg-muted transition-colors"
          >
            ? Help
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="px-3 py-1.5 text-sm border rounded text-foreground hover:bg-muted transition-colors"
          >
            Settings
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ display: appMode === 'builder' ? 'flex' : 'none' }}>
        {/* Left panel */}
        <aside className="w-72 border-r overflow-y-auto p-3 space-y-4 flex-shrink-0 bg-card">
          <TemplateInput
            value={template}
            onChange={setTemplate}
            savedSequences={savedSequences}
            onSaveSequence={handleSaveSequence}
            onDeleteSequence={handleDeleteSequence}
          />

          <hr />
          <ConstraintsPanel
            primerConstraints={primerConstraints}
            onPrimerConstraintsChange={setPrimerConstraints}
            pairConstraints={pairConstraints}
            onPairConstraintsChange={setPairConstraints}
            ampliconConstraints={ampliconConstraints}
            onAmpliconConstraintsChange={setAmpliconConstraints}
            enabledConstraints={enabledConstraints}
            onEnabledConstraintsChange={setEnabledConstraints}
            numPairs={numPairs}
            onNumPairsChange={setNumPairs}
            diversityMode={diversityMode}
            onDiversityModeChange={setDiversityMode}
            savedConfigs={savedConfigs}
            onSaveConfig={handleSaveConfig}
            onUpdateConfig={handleUpdateConfig}
            onLoadConfig={handleLoadConfig}
            onDeleteConfig={handleDeleteConfig}
            onResetDefaults={() => {
              setPrimerConstraints(DEFAULT_PRIMER_CONSTRAINTS)
              setPairConstraints(DEFAULT_PAIR_CONSTRAINTS)
              setAmpliconConstraints(DEFAULT_AMPLICON_CONSTRAINTS)
              setEnabledConstraints(DEFAULT_ENABLED_CONSTRAINTS)
              setNumPairs(10)
              setDiversityMode('off')
            }}
            excludeOrdered={excludeOrdered}
            onExcludeOrderedChange={setExcludeOrdered}
            orderedPrimerCount={orderedPrimers.length}
            onOpenOrderedManager={() => setOrderedManagerOpen(true)}
          />

          <hr />
          {/* Condition profile selection */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-2">
              Condition Profiles
            </h3>
            <div className="space-y-1">
              <div>
                <label className="text-xs text-muted-foreground">Primary (for primer3 design)</label>
                <select
                  className="w-full border rounded px-2 py-1 text-xs focus:outline-none mt-0.5"
                  value={reactionConditions.primary_profile_id}
                  onChange={(e) => setReactionConditions({
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
                            setReactionConditions({ ...reactionConditions, additional_profile_ids: ids })
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
          {/* Specificity */}
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
                    onChange={(e) => setBlastEnabled(e.target.checked)}
                    className="w-3 h-3"
                  />
                  <span className="text-xs">enabled</span>
                </label>
              ) : (
                <span className="text-[10px] text-yellow-600 font-medium">not installed</span>
              )}
            </div>
            {!blastAvailable && (
              <p className="text-xs text-muted-foreground">
                BLAST+ is not installed. Primer design will work without it, but off-target specificity screening is unavailable.
              </p>
            )}
            {blastAvailable && blastEnabled && (
              <>
                <GenomeManager
                  genomes={genomes}
                  selectedIds={selectedGenomeIds}
                  onSelectionChange={setSelectedGenomeIds}
                  onGenomesChange={setGenomes}
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
                    onChange={(e) => setOffTargetTmThreshold(parseFloat(e.target.value))}
                    className="w-full h-1.5 accent-primary cursor-pointer"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    BLAST hits with binding Tm below this are ignored.
                    Lower = stricter (catches weaker binding). Higher = more permissive.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Design button */}
          <button
            onClick={handleDesign}
            disabled={!canDesign || designing}
            className="w-full py-2 bg-primary text-primary-foreground font-medium rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {designing ? 'Designing…' : 'Design Primers'}
          </button>

          {designing && progress && <ProgressBar progress={progress} />}

          {designError && (
            <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2 whitespace-pre-line">
              {designError}
            </p>
          )}
        </aside>

        {/* Right panel */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {results && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {resultsSource === 'imported' && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-semibold uppercase">
                  Imported
                </span>
              )}
              <span>
                Template: <strong>{results.template_info.name}</strong>
                {' '}({results.template_info.length.toLocaleString()} bp)
              </span>
              {results.template_info.target_region && (
                <span>
                  Target: {results.template_info.target_region[0]}–{results.template_info.target_region[1]}
                </span>
              )}
              <span>
                {results.design_metadata.total_candidates_screened} candidates,{' '}
                {results.design_metadata.filtered_by_blast} filtered by BLAST
                {results.design_metadata.excluded_pair_count > 0 && (
                  <>, {results.design_metadata.excluded_pair_count} already-ordered</>
                )}
              </span>
              {results.design_metadata.blast_coverage_warning && (
                <span className="text-yellow-600">
                  ⚠ &gt;2/3 candidates filtered by BLAST — try relaxing constraints
                </span>
              )}
            </div>
          )}

          {results?.pairs?.length > 0 && (
            <TemplateMap
              pairs={results.pairs}
              templateLength={results.template_info.length}
              targetRegion={results.template_info.target_region}
              selectedRank={selectedPair?.rank}
              onSelect={(pair) => setSelectedPair(selectedPair?.rank === pair.rank ? null : pair)}
            />
          )}

          <ResultsTable
            pairs={results?.pairs}
            primaryProfileId={reactionConditions.primary_profile_id}
            primaryProfileName={primaryProfile?.name || reactionConditions.primary_profile_id}
            selectedRank={selectedPair?.rank}
            onSelect={(pair) => setSelectedPair(selectedPair?.rank === pair.rank ? null : pair)}
            checkedRanks={checkedRanks}
            onCheckedChange={setCheckedRanks}
            onOpenExportWizard={() => setExportWizardOpen(true)}
            exporting={exporting}
          />

          {selectedPair && (
            <PairDetail
              pair={selectedPair}
              profileNames={profileNames}
              onClose={() => setSelectedPair(null)}
              tmThreshold={offTargetTmThreshold}
            />
          )}
        </main>
      </div>
        <PrimerChecker
          style={{ display: appMode === 'checker' ? 'flex' : 'none' }}
          profiles={profiles}
          genomes={genomes}
          reactionConditions={reactionConditions}
          onReactionConditionsChange={setReactionConditions}
          blastEnabled={blastEnabled}
          onBlastEnabledChange={setBlastEnabled}
          blastAvailable={blastAvailable}
          selectedGenomeIds={selectedGenomeIds}
          onSelectedGenomeIdsChange={setSelectedGenomeIds}
          offTargetTmThreshold={offTargetTmThreshold}
          onOffTargetTmThresholdChange={setOffTargetTmThreshold}
          onGenomesChange={setGenomes}
          onDesignSimilar={(constraints) => {
            setPrimerConstraints(constraints)
            setAppMode('builder')
          }}
        />

      {helpOpen && <ParameterReference onClose={() => setHelpOpen(false)} />}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profiles={profiles}
        onProfilesChange={setProfiles}
        genomes={genomes}
        selectedGenomeIds={selectedGenomeIds}
        onGenomesChange={setGenomes}
        onGenomeSelectionChange={setSelectedGenomeIds}
        metadata={lastMetadata}
      />

      <OrderedPrimersManager
        open={orderedManagerOpen}
        onClose={() => setOrderedManagerOpen(false)}
        primers={orderedPrimers}
        onPrimersChange={loadOrderedPrimers}
      />

      <ExportWizard
        open={exportWizardOpen}
        onClose={() => setExportWizardOpen(false)}
        pairs={results?.pairs?.filter((p) => checkedRanks.has(p.rank)) || []}
        templateInfo={results?.template_info}
        exporting={exporting}
        onSubmit={handleExport}
      />
    </div>
  )
}
