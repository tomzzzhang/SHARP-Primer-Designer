import React, { useState } from 'react'
import { fetchSequence } from '../api/client'
import SequenceBar from './SequenceBar'

const TABS = ['paste', 'upload', 'accession']
const TAB_LABELS = { paste: 'Paste Sequence', upload: 'Upload FASTA', accession: 'NCBI Accession' }

export default function TemplateInput({ value, onChange, savedSequences, onSaveSequence, onDeleteSequence }) {
  const [tab, setTab] = useState('paste')
  const [accessionInput, setAccessionInput] = useState('')
  const [fetchStatus, setFetchStatus] = useState(null) // null | 'loading' | 'ok' | 'error'
  const [fetchError, setFetchError] = useState('')
  const [seqName, setSeqName] = useState('')

  function handlePasteChange(e) {
    onChange({ ...value, sequence: e.target.value, fasta_file: null, accession: null })
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // Store as base64
      const b64 = btoa(reader.result)
      onChange({ ...value, fasta_file: b64, sequence: null, accession: null })
    }
    reader.readAsBinaryString(file)
  }

  async function handleFetch() {
    if (!accessionInput.trim()) return
    setFetchStatus('loading')
    setFetchError('')
    try {
      const result = await fetchSequence(accessionInput.trim())
      onChange({
        ...value,
        sequence: result.sequence,
        fasta_file: null,
        accession: accessionInput.trim(),
        _fetched_name: result.name,
        _fetched_length: result.length,
      })
      setFetchStatus('ok')
    } catch (err) {
      setFetchError(err.message)
      setFetchStatus('error')
    }
  }

  function handleSave() {
    if (!seqName.trim() || !value.sequence) return
    onSaveSequence({
      name: seqName.trim(),
      sequence: value.sequence,
      target_start: value.target_start || null,
      target_end: value.target_end || null,
    })
    setSeqName('')
  }

  function handleLoad(seq) {
    // Convert legacy target_length to target_end if needed
    let targetEnd = seq.target_end || null
    if (!targetEnd && seq.target_start && seq.target_length) {
      targetEnd = seq.target_start + seq.target_length - 1
    }
    onChange({
      ...value,
      sequence: seq.sequence,
      fasta_file: null,
      accession: null,
      target_start: seq.target_start || null,
      target_end: targetEnd,
    })
    setTab('paste')
  }

  const hasSequence = !!value.sequence
  const canSave = seqName.trim().length > 0 && hasSequence

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Template
      </h2>

      {/* Sequence name + Save button */}
      <div className="flex gap-2">
        <input
          className="flex-1 text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Sequence name"
          value={seqName}
          onChange={(e) => setSeqName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSave && handleSave()}
        />
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-40 whitespace-nowrap"
        >
          Save
        </button>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
              tab === t
                ? 'border border-b-white -mb-px bg-white text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'paste' && (
        <textarea
          className="w-full h-28 text-xs font-mono border rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Paste DNA sequence (ACGT, whitespace ignored)..."
          value={value.sequence || ''}
          onChange={handlePasteChange}
        />
      )}

      {tab === 'upload' && (
        <div className="border-2 border-dashed rounded p-4 text-center">
          <input
            type="file"
            accept=".fasta,.fa,.fna,.txt"
            className="hidden"
            id="fasta-upload"
            onChange={handleFileChange}
          />
          <label htmlFor="fasta-upload" className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            {value.fasta_file
              ? <span className="text-green-600 font-medium">FASTA loaded</span>
              : 'Click to select a FASTA file'}
          </label>
        </div>
      )}

      {tab === 'accession' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. J02459"
              value={accessionInput}
              onChange={(e) => setAccessionInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
            />
            <button
              onClick={handleFetch}
              disabled={fetchStatus === 'loading'}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {fetchStatus === 'loading' ? 'Fetching...' : 'Fetch'}
            </button>
          </div>
          {fetchStatus === 'ok' && value._fetched_name && (
            <p className="text-xs text-green-600">
              {value._fetched_name} ({value._fetched_length?.toLocaleString()} bp)
            </p>
          )}
          {fetchStatus === 'error' && (
            <p className="text-xs text-destructive">{fetchError}</p>
          )}
        </div>
      )}

      {/* Sequence summary if loaded */}
      {tab !== 'paste' && value.sequence && (
        <p className="text-xs text-muted-foreground">
          {value.sequence.length.toLocaleString()} bp loaded
        </p>
      )}

      {/* Target region */}
      {hasSequence && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Target Region</label>
            {(value.target_start || value.target_end) && (
              <button
                onClick={() => onChange({ ...value, target_start: null, target_end: null })}
                className="text-[10px] text-muted-foreground hover:text-destructive"
              >
                Clear
              </button>
            )}
          </div>

          <SequenceBar
            sequenceLength={value.sequence.length}
            targetStart={value.target_start}
            targetEnd={value.target_end}
            onChange={(start, end) => onChange({ ...value, target_start: start, target_end: end })}
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Start</label>
              <input
                type="number"
                min={1}
                max={value.sequence.length}
                className="w-full border rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="1"
                value={value.target_start || ''}
                onChange={(e) => {
                  const v = e.target.value ? parseInt(e.target.value) : null
                  onChange({ ...value, target_start: v })
                }}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">End</label>
              <input
                type="number"
                min={1}
                max={value.sequence.length}
                className="w-full border rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={value.sequence.length.toString()}
                value={value.target_end || ''}
                onChange={(e) => {
                  const v = e.target.value ? parseInt(e.target.value) : null
                  onChange({ ...value, target_end: v })
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Saved sequences */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Saved Sequences</label>
        {savedSequences && savedSequences.length > 0 ? (
          <div className="border rounded h-24 overflow-y-auto divide-y">
            {savedSequences.map((seq) => (
              <div
                key={seq.id}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 cursor-pointer group"
                onClick={() => handleLoad(seq)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{seq.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {seq.sequence.length.toLocaleString()} bp
                    {seq.target_start ? ` · target @${seq.target_start}` : ''}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteSequence(seq.id) }}
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity px-1"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No saved sequences. Enter a sequence and name above, then click Save.
          </p>
        )}
      </div>
    </div>
  )
}
