import React, { useState } from 'react'
import { createProfile, updateProfile, deleteProfile } from '../api/client'

function ProfileForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    id: '', name: '', na_mm: 50, k_mm: 0, tris_mm: 0, mg_mm: 2, dntps_mm: 0.8, primer_nm: 200
  })

  function field(key, label, step = 0.1) {
    return (
      <div key={key}>
        <label className="text-xs text-muted-foreground">{label}</label>
        <input
          type="number"
          step={step}
          className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3 p-3 border rounded bg-muted/10">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">ID (no spaces)</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={form.id}
            disabled={!!initial}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Display Name</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {field('na_mm', 'Na+ (mM)')}
        {field('k_mm', 'K+ (mM)')}
        {field('tris_mm', 'Tris (mM)')}
        {field('mg_mm', 'Mg++ (mM)')}
        {field('dntps_mm', 'dNTPs (mM)')}
        {field('primer_nm', 'Primer (nM)', 10)}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1 text-sm border rounded hover:bg-muted">
          Cancel
        </button>
        <button
          onClick={() => onSave(form)}
          className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          Save
        </button>
      </div>
    </div>
  )
}

export default function ProfileManager({ profiles, onProfilesChange }) {
  const [editingId, setEditingId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  async function handleSaveNew(form) {
    setError('')
    try {
      const created = await createProfile(form)
      onProfilesChange([...profiles, created])
      setAdding(false)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleUpdate(id, form) {
    setError('')
    try {
      const updated = await updateProfile(id, form)
      onProfilesChange(profiles.map((p) => (p.id === id ? updated : p)))
      setEditingId(null)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm(`Delete profile "${id}"?`)) return
    setError('')
    try {
      await deleteProfile(id)
      onProfilesChange(profiles.filter((p) => p.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {profiles.map((p) => (
        <div key={p.id}>
          {editingId === p.id ? (
            <ProfileForm
              initial={p}
              onSave={(form) => handleUpdate(p.id, { ...p, ...form })}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className="flex items-center justify-between px-3 py-2 border rounded hover:bg-muted/20">
              <div>
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  Na {p.na_mm} / Mg {p.mg_mm} / dNTPs {p.dntps_mm} / {p.primer_nm} nM
                </span>
                {p.is_default && (
                  <span className="ml-2 text-[10px] bg-primary/10 text-primary rounded px-1 py-0.5">primary</span>
                )}
              </div>
              <div className="flex gap-1">
                {p.editable && (
                  <button
                    onClick={() => setEditingId(p.id)}
                    className="text-xs px-2 py-0.5 border rounded hover:bg-muted"
                  >
                    Edit
                  </button>
                )}
                {p.editable && (
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-xs px-2 py-0.5 border border-destructive text-destructive rounded hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
      {adding ? (
        <ProfileForm onSave={handleSaveNew} onCancel={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full text-sm border-2 border-dashed rounded py-2 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          + Add profile
        </button>
      )}
    </div>
  )
}
