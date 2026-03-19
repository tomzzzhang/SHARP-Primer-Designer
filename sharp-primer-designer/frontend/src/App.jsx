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
import { getProfiles, getGenomes, getSequences, saveSequence, deleteSequence } from './api/client'
import {
  DEFAULT_PRIMER_CONSTRAINTS,
  DEFAULT_PAIR_CONSTRAINTS,
  DEFAULT_AMPLICON_CONSTRAINTS,
  DEFAULT_SPECIFICITY,
  DEFAULT_REACTION_CONDITIONS,
} from './lib/defaults'

// ─── Settings modal ────────────────────────────────────────────────────────────

function SettingsModal({ open, onClose, profiles, onProfilesChange, genomes, selectedGenomeIds, onGenomesChange, onGenomeSelectionChange, metadata }) {
  const [tab, setTab] = useState('profiles')
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
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
                tab === t ? 'border border-b-white -mb-px bg-white text-primary' : 'text-muted-foreground hover:text-foreground'
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

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  // Template
  const [template, setTemplate] = useState({
    sequence: null, fasta_file: null, accession: null,
    target_start: null, target_length: null, excluded_regions: null,
  })

  // Constraints
  const [primerConstraints, setPrimerConstraints] = useState(DEFAULT_PRIMER_CONSTRAINTS)
  const [pairConstraints, setPairConstraints] = useState(DEFAULT_PAIR_CONSTRAINTS)
  const [ampliconConstraints, setAmpliconConstraints] = useState(DEFAULT_AMPLICON_CONSTRAINTS)
  const [numPairs, setNumPairs] = useState(10)

  // Profiles and conditions
  const [profiles, setProfiles] = useState([])
  const [reactionConditions, setReactionConditions] = useState(DEFAULT_REACTION_CONDITIONS)

  // Genomes
  const [genomes, setGenomes] = useState([])
  const [selectedGenomeIds, setSelectedGenomeIds] = useState(['lambda'])
  const [blastEnabled, setBlastEnabled] = useState(true)
  const [blastAvailable, setBlastAvailable] = useState(true)

  // Results
  const [results, setResults] = useState(null)
  const [selectedPair, setSelectedPair] = useState(null)
  const [designing, setDesigning] = useState(false)
  const [designError, setDesignError] = useState('')
  const [progress, setProgress] = useState(null)  // {step, message, pct}

  // Saved sequences
  const [savedSequences, setSavedSequences] = useState([])

  // Settings modal & help
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [lastMetadata, setLastMetadata] = useState(null)

  // Load profiles, genomes, saved sequences, and check BLAST on mount
  useEffect(() => {
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

  const primaryProfile = profiles.find((p) => p.id === reactionConditions.primary_profile_id)
  const profileNames = Object.fromEntries(profiles.map((p) => [p.id, p.name]))

  async function handleDesign() {
    setDesignError('')
    setDesigning(true)
    setResults(null)
    setSelectedPair(null)
    setProgress({ step: 'template', message: 'Preparing request...', pct: 2 })

    const templatePayload = {}
    if (template.sequence) templatePayload.sequence = template.sequence
    else if (template.fasta_file) templatePayload.fasta_file = template.fasta_file
    else if (template.accession) templatePayload.accession = template.accession
    if (template.target_start) templatePayload.target_start = template.target_start
    if (template.target_length) templatePayload.target_length = template.target_length
    if (template.excluded_regions) templatePayload.excluded_regions = template.excluded_regions

    const payload = {
      template: templatePayload,
      primer_constraints: primerConstraints,
      pair_constraints: pairConstraints,
      amplicon_constraints: ampliconConstraints,
      reaction_conditions: reactionConditions,
      specificity: {
        genome_ids: blastEnabled ? selectedGenomeIds : [],
        enabled: blastEnabled,
        evalue_threshold: 1000,
        min_alignment_length: 15,
        max_off_targets: 0,
      },
      num_pairs: numPairs,
    }

    try {
      const res = await fetch('/api/design/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || res.statusText)
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
              setTimeout(() => setProgress(null), 800)
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

  const canDesign = template.sequence || template.fasta_file || template.accession

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-4 py-2.5 flex items-center justify-between bg-white shadow-sm">
        <div>
          <h1 className="font-bold text-lg">SHARP Primer Designer</h1>
          <p className="text-xs text-muted-foreground">
            Tm estimates are reference only — not a predictor of SHARP isothermal performance
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
          >
            ? Help
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
          >
            Settings
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside className="w-72 border-r overflow-y-auto p-3 space-y-4 flex-shrink-0 bg-white">
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
            numPairs={numPairs}
            onNumPairsChange={setNumPairs}
          />

          <hr />
          {/* Condition profile selection */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
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
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
              <GenomeManager
                genomes={genomes}
                selectedIds={selectedGenomeIds}
                onSelectionChange={setSelectedGenomeIds}
                onGenomesChange={setGenomes}
                showCheckboxes
              />
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
            <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
              {designError}
            </p>
          )}
        </aside>

        {/* Right panel */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {results && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
          />

          {selectedPair && (
            <PairDetail
              pair={selectedPair}
              profileNames={profileNames}
              onClose={() => setSelectedPair(null)}
            />
          )}
        </main>
      </div>

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
    </div>
  )
}
