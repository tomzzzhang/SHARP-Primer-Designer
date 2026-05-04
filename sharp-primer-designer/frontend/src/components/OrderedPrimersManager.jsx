import React, { useState, useRef } from 'react'
import {
  bulkAddOrderedPrimers,
  importOrderedPrimers,
  deleteOrderedPrimer,
  clearOrderedPrimers,
} from '../api/client'

function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString()
  } catch (_) {
    return ''
  }
}

function sourceLabel(source) {
  switch (source) {
    case 'manual': return 'Pasted'
    case 'imported_json': return 'Imported (JSON/zip)'
    case 'imported_xlsx': return 'Imported (xlsx)'
    default: return source || ''
  }
}

/**
 * Modal for managing the "ordered primers" exclusion library.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   primers: OrderedPrimer[]
 *   onPrimersChange: (primers) => void   // refresh after mutations
 */
export default function OrderedPrimersManager({ open, onClose, primers, onPrimersChange }) {
  const [tab, setTab] = useState('paste')
  const [pasteText, setPasteText] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)  // { kind: 'success' | 'error', text }
  const fileInputRef = useRef(null)

  if (!open) return null

  const filtered = primers.filter((p) => {
    if (!search.trim()) return true
    const q = search.trim().toUpperCase()
    return (
      p.sequence.includes(q) ||
      (p.name || '').toUpperCase().includes(q)
    )
  })

  async function handlePaste() {
    const text = pasteText.trim()
    if (!text) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await bulkAddOrderedPrimers([text], 'manual')
      setMessage({
        kind: 'success',
        text: `Added ${result.added} primer(s). Skipped ${result.skipped} (duplicates or invalid).`,
      })
      setPasteText('')
      await onPrimersChange()
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await importOrderedPrimers(file)
      setMessage({
        kind: 'success',
        text: `Added ${result.added} primer(s) from ${file.name}. Skipped ${result.skipped}.`,
      })
      await onPrimersChange()
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
      // Reset the input so re-uploading the same file fires onChange
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(id) {
    setBusy(true)
    setMessage(null)
    try {
      await deleteOrderedPrimer(id)
      await onPrimersChange()
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  async function handleClearAll() {
    if (!window.confirm(`Remove all ${primers.length} ordered primers from the library? This cannot be undone.`)) return
    setBusy(true)
    setMessage(null)
    try {
      await clearOrderedPrimers()
      await onPrimersChange()
      setMessage({ kind: 'success', text: 'Library cleared.' })
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h2 className="font-semibold">Ordered Primers Library</h2>
            <p className="text-xs text-muted-foreground">
              Pairs containing any of these sequences will be skipped during design.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        {/* Add tabs */}
        <div className="px-4 pt-3 border-b">
          <div className="flex gap-1">
            {[['paste', 'Paste sequences'], ['import', 'Import from file']].map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${
                  tab === t
                    ? 'border border-b-card -mb-px bg-card text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="py-3">
            {tab === 'paste' && (
              <div className="space-y-2">
                <textarea
                  className="w-full h-24 text-xs font-mono border rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Paste primer sequences here (one per line, or FASTA blocks)..."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  disabled={busy}
                />
                <div className="flex justify-end">
                  <button
                    onClick={handlePaste}
                    disabled={busy || !pasteText.trim()}
                    className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                  >
                    {busy ? 'Adding…' : 'Add to library'}
                  </button>
                </div>
              </div>
            )}
            {tab === 'import' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Accepts a previously-exported zip or .json from this app, or any IDT-style .xlsx
                  with a "Sequence" column.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.zip,.xlsx"
                  onChange={handleFile}
                  disabled={busy}
                  className="text-xs"
                />
              </div>
            )}
          </div>

          {message && (
            <div className={`text-xs mb-3 px-2 py-1.5 rounded ${
              message.kind === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-destructive/5 text-destructive border border-destructive/20'
            }`}>
              {message.text}
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-xs font-medium text-muted-foreground">
              {primers.length} primer{primers.length === 1 ? '' : 's'} in library
            </span>
            <input
              type="text"
              placeholder="Search by sequence or name..."
              className="flex-1 max-w-sm border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {primers.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={busy}
              className="text-[10px] px-2 py-1 border border-destructive text-destructive rounded hover:bg-destructive/10 disabled:opacity-50"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-2">
          {primers.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">
              Library is empty. Paste sequences or import a file to populate it.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">
              No matches for "{search}".
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-1.5 group">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs truncate">{p.sequence}</div>
                    <div className="text-[10px] text-muted-foreground flex gap-2">
                      <span>{p.sequence.length} nt</span>
                      {p.source && <span>· {sourceLabel(p.source)}</span>}
                      {p.added_date && <span>· {formatDate(p.added_date)}</span>}
                      {p.name && <span>· {p.name}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={busy}
                    className="text-xs text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 disabled:opacity-50 px-1"
                    title="Remove from library"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border rounded hover:bg-muted"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
