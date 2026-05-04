import React, { useEffect, useMemo, useRef, useState } from 'react'
import TemplateMap from './TemplateMap'

// Mirror of backend `_sanitize_name` so the user sees the actual exported name as they type.
// Replace any character outside [A-Za-z0-9_-] with `_`, collapse runs of `_`,
// strip leading/trailing `_`, and clamp to 50 chars.
export function sanitizeName(name) {
  if (!name) return ''
  let clean = String(name).replace(/[^A-Za-z0-9_\-]/g, '_')
  clean = clean.replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  return clean.slice(0, 50)
}

function defaultPrimerName(target, rank, dir) {
  return `${sanitizeName(target)}_P${rank}_${dir}`
}

/**
 * ExportWizard — modal that lets the user review/rename selected primer pairs
 * before triggering the export. Also captures a position-map SVG for the bundle.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   pairs: PairResult[]                       (already filtered to checked rows)
 *   templateInfo: { name, length, target_region? }
 *   exporting: boolean                        (parent's busy flag)
 *   onSubmit: ({ targetName, primerNames, mapSvg }) => Promise<void>
 */
export default function ExportWizard({ open, onClose, pairs, templateInfo, exporting, onSubmit }) {
  const [targetName, setTargetName] = useState('')
  // custom[rank] = { forward?: string, reverse?: string }
  // Presence of a string value means the user has edited that field — it stops
  // following targetName until they reset it.
  const [custom, setCustom] = useState({})
  const mapDivRef = useRef(null)

  // Reset state on the close → open transition only. We intentionally don't
  // include templateInfo / pairs as deps: those props can change reference on
  // every parent render and would clobber the user's edits mid-keystroke.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setTargetName(templateInfo?.name || '')
      setCustom({})
    }
    wasOpenRef.current = open
  }, [open, templateInfo?.name])

  const sortedPairs = useMemo(
    () => (pairs ? [...pairs].sort((a, b) => a.rank - b.rank) : []),
    [pairs],
  )

  if (!open) return null

  function nameFor(rank, dir) {
    const key = dir === 'F' ? 'forward' : 'reverse'
    const override = custom[rank]?.[key]
    return override != null ? override : defaultPrimerName(targetName, rank, dir)
  }

  function isDirty(rank, dir) {
    const key = dir === 'F' ? 'forward' : 'reverse'
    return custom[rank]?.[key] != null
  }

  function setName(rank, dir, value) {
    const key = dir === 'F' ? 'forward' : 'reverse'
    setCustom((prev) => {
      const next = { ...prev }
      next[rank] = { ...(next[rank] || {}), [key]: value }
      return next
    })
  }

  function resetRow(rank, dir) {
    const key = dir === 'F' ? 'forward' : 'reverse'
    setCustom((prev) => {
      const next = { ...prev }
      if (next[rank]) {
        const row = { ...next[rank] }
        delete row[key]
        if (Object.keys(row).length === 0) delete next[rank]
        else next[rank] = row
      }
      return next
    })
  }

  function resetAll() {
    setCustom({})
  }

  function captureMapSvg() {
    const svgEl = mapDivRef.current?.querySelector('svg')
    if (!svgEl) return null
    const clone = svgEl.cloneNode(true)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const viewBox = clone.getAttribute('viewBox') || '0 0 800 200'
    const parts = viewBox.split(/\s+/)
    const vbW = Number(parts[2]) || 800
    const vbH = Number(parts[3]) || 200
    clone.setAttribute('width', String(vbW))
    clone.setAttribute('height', String(vbH))
    return new XMLSerializer().serializeToString(clone)
  }

  async function handleExport() {
    // Build the primer_names override payload — only include entries that differ
    // from the auto-generated default (after sanitization), so the backend can
    // still fall back cleanly.
    const primerNames = {}
    for (const pair of sortedPairs) {
      const fwd = sanitizeName(nameFor(pair.rank, 'F'))
      const rev = sanitizeName(nameFor(pair.rank, 'R'))
      const fwdDefault = defaultPrimerName(targetName, pair.rank, 'F')
      const revDefault = defaultPrimerName(targetName, pair.rank, 'R')
      const entry = {}
      if (fwd !== fwdDefault) entry.forward = fwd
      if (rev !== revDefault) entry.reverse = rev
      if (Object.keys(entry).length > 0) primerNames[String(pair.rank)] = entry
    }

    const mapSvg = captureMapSvg()

    await onSubmit({
      targetName: targetName.trim() || null,
      primerNames: Object.keys(primerNames).length > 0 ? primerNames : null,
      mapSvg,
    })
  }

  const dirtyCount = Object.values(custom).reduce(
    (n, row) => n + (row?.forward != null ? 1 : 0) + (row?.reverse != null ? 1 : 0),
    0,
  )
  const canExport = !exporting && targetName.trim().length > 0 && sortedPairs.length > 0

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h2 className="font-semibold">Export {sortedPairs.length} primer pair{sortedPairs.length === 1 ? '' : 's'}</h2>
            <p className="text-xs text-muted-foreground">
              Review names and the position map before downloading.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={exporting}
            className="text-muted-foreground hover:text-foreground text-xl leading-none disabled:opacity-50"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="overflow-y-auto px-4 py-3 space-y-4 flex-1">
          {/* Target name */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Target name (used as the default prefix)
            </label>
            <input
              type="text"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="e.g. Lambda"
              className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={exporting}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Names are sanitized to alphanumeric, underscore, and hyphen on export (max 50 chars).
              Editing this field updates any primer names you haven&rsquo;t customized below.
            </p>
          </div>

          {/* Map preview */}
          {templateInfo?.length > 0 && sortedPairs.length > 0 && (
            <div ref={mapDivRef} className="border rounded p-2 bg-muted/20">
              <TemplateMap
                pairs={sortedPairs}
                templateLength={templateInfo.length}
                targetRegion={templateInfo.target_region || null}
                selectedRank={null}
                onSelect={() => {}}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                This map will be saved as <code>{sanitizeName(targetName) || '<target>'}_primer_map_*.svg</code> inside the export zip.
              </p>
            </div>
          )}

          {/* Per-primer rename table */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-medium text-foreground">
                Primer names
              </h3>
              {dirtyCount > 0 && (
                <button
                  onClick={resetAll}
                  disabled={exporting}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline disabled:opacity-50"
                >
                  Reset all to default ({dirtyCount} edited)
                </button>
              )}
            </div>
            <div className="border rounded overflow-hidden">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="px-2 py-1.5 text-center w-10">#</th>
                    <th className="px-2 py-1.5 text-center w-12">Dir</th>
                    <th className="px-2 py-1.5 text-left">Sequence (5&rsquo;-3&rsquo;)</th>
                    <th className="px-2 py-1.5 text-left">Name</th>
                    <th className="px-2 py-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPairs.map((pair) => (
                    <React.Fragment key={pair.rank}>
                      {[
                        { dir: 'F', primer: pair.forward, label: 'Fwd' },
                        { dir: 'R', primer: pair.reverse, label: 'Rev' },
                      ].map(({ dir, primer, label }) => {
                        const dirty = isDirty(pair.rank, dir)
                        return (
                          <tr key={`${pair.rank}-${dir}`} className="border-t">
                            <td className="px-2 py-1 text-center font-medium">
                              {dir === 'F' ? pair.rank : ''}
                            </td>
                            <td className="px-2 py-1 text-center text-muted-foreground">{label}</td>
                            <td
                              className="px-2 py-1 font-mono max-w-[180px] truncate"
                              title={primer.sequence}
                            >
                              {primer.sequence}
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="text"
                                value={nameFor(pair.rank, dir)}
                                onChange={(e) => setName(pair.rank, dir, e.target.value)}
                                disabled={exporting}
                                className={`w-full font-mono text-xs border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring ${
                                  dirty ? 'border-primary/40 bg-primary/5' : ''
                                }`}
                              />
                            </td>
                            <td className="px-2 py-1 text-center">
                              {dirty && (
                                <button
                                  onClick={() => resetRow(pair.rank, dir)}
                                  disabled={exporting}
                                  className="text-[10px] text-muted-foreground hover:text-foreground"
                                  title="Reset to default"
                                >
                                  ↺
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-muted/10">
          <button
            onClick={onClose}
            disabled={exporting}
            className="px-3 py-1.5 text-sm border rounded hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={!canExport}
            className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export zip'}
          </button>
        </div>
      </div>
    </div>
  )
}
