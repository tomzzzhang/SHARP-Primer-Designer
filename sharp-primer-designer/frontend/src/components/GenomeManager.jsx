import React, { useState } from 'react'
import { addGenome, deleteGenome } from '../api/client'

function AddGenomeForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ id: '', name: '', accession: '', sequence: '' })
  const [inputMode, setInputMode] = useState('accession') // 'accession' | 'paste' | 'file'
  const [fileB64, setFileB64] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setFileB64(btoa(reader.result))
    reader.readAsBinaryString(file)
  }

  async function handleSubmit() {
    if (!form.id || !form.name) { setError('ID and name are required'); return }
    setLoading(true)
    setError('')
    const payload = { id: form.id, name: form.name }
    if (inputMode === 'accession' && form.accession) payload.accession = form.accession
    else if (inputMode === 'paste' && form.sequence) payload.sequence = form.sequence
    else if (inputMode === 'file' && fileB64) payload.fasta_file = fileB64
    else { setError('Provide sequence input'); setLoading(false); return }
    try {
      const genome = await onSave(payload)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2 p-3 border rounded bg-muted/10">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Genome ID (no spaces)</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. ecoli_k12"
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Display Name</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. E. coli K-12"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-1">
        {['accession', 'paste', 'file'].map((m) => (
          <button
            key={m}
            onClick={() => setInputMode(m)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              inputMode === m ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted'
            }`}
          >
            {m === 'accession' ? 'NCBI Accession' : m === 'paste' ? 'Paste FASTA' : 'Upload File'}
          </button>
        ))}
      </div>
      {inputMode === 'accession' && (
        <input
          className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="NCBI accession, e.g. U00096"
          value={form.accession}
          onChange={(e) => setForm({ ...form, accession: e.target.value })}
        />
      )}
      {inputMode === 'paste' && (
        <textarea
          className="w-full h-20 text-xs font-mono border rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Paste FASTA or raw sequence..."
          value={form.sequence}
          onChange={(e) => setForm({ ...form, sequence: e.target.value })}
        />
      )}
      {inputMode === 'file' && (
        <input type="file" accept=".fasta,.fa,.fna" onChange={handleFile} className="text-xs" />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1 text-sm border rounded hover:bg-muted">Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Indexing…' : 'Add & Index'}
        </button>
      </div>
    </div>
  )
}

/**
 * Props:
 *   genomes: GenomeInfo[]
 *   selectedIds: string[]
 *   onSelectionChange: (ids: string[]) => void
 *   onGenomesChange: (genomes: GenomeInfo[]) => void
 *   showCheckboxes: boolean
 */
export default function GenomeManager({
  genomes,
  selectedIds,
  onSelectionChange,
  onGenomesChange,
  showCheckboxes = true,
}) {
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  function toggleGenome(id) {
    if (!showCheckboxes) return
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((g) => g !== id))
    } else {
      onSelectionChange([...selectedIds, id])
    }
  }

  async function handleAdd(payload) {
    const genome = await addGenome(payload)
    onGenomesChange([...genomes, genome])
    setAdding(false)
    return genome
  }

  async function handleDelete(id) {
    if (!window.confirm(`Remove genome "${id}" and its BLAST index?`)) return
    setError('')
    try {
      await deleteGenome(id)
      onGenomesChange(genomes.filter((g) => g.id !== id))
      onSelectionChange(selectedIds.filter((g) => g !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {genomes.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No reference genomes indexed.</p>
      )}
      {genomes.map((g) => (
        <div
          key={g.id}
          className="flex items-center justify-between px-2 py-1.5 border rounded hover:bg-muted/20 cursor-pointer"
          onClick={() => toggleGenome(g.id)}
        >
          <div className="flex items-center gap-2">
            {showCheckboxes && (
              <input
                type="checkbox"
                readOnly
                checked={selectedIds.includes(g.id)}
                className="w-3.5 h-3.5 cursor-pointer"
              />
            )}
            <div>
              <span className="text-sm">{g.name}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {g.indexed ? '✓ indexed' : '⚠ not indexed'}
                {g.fasta_size_bp && ` · ${(g.fasta_size_bp / 1000).toFixed(0)} kbp`}
              </span>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(g.id) }}
            className="text-[10px] px-1.5 py-0.5 border border-destructive text-destructive rounded hover:bg-destructive/10"
          >
            Remove
          </button>
        </div>
      ))}
      {adding ? (
        <AddGenomeForm onSave={handleAdd} onCancel={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full text-sm border-2 border-dashed rounded py-2 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          + Add genome
        </button>
      )}
    </div>
  )
}
