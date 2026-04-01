/**
 * API client — thin fetch wrapper for the FastAPI backend.
 * All requests go to /api (proxied to localhost:8000 via Vite).
 */

const BASE = '/api'

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) {
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const err = await res.json()
      detail = err.detail || detail
    } catch (_) {}
    throw new Error(`${res.status} ${detail}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ── Design ────────────────────────────────────────────────────────────────────
export const designPrimers = (payload) => request('POST', '/design', payload)

// ── Primer Checker ───────────────────────────────────────────────────────────
export const checkPrimer = (payload) => request('POST', '/check', payload)

// ── Profiles ──────────────────────────────────────────────────────────────────
export const getProfiles = () => request('GET', '/profiles')
export const createProfile = (profile) => request('POST', '/profiles', profile)
export const updateProfile = (id, profile) => request('PUT', `/profiles/${id}`, profile)
export const deleteProfile = (id) => request('DELETE', `/profiles/${id}`)

// ── Genomes ───────────────────────────────────────────────────────────────────
export const getGenomes = () => request('GET', '/genomes')
export const addGenome = (payload) => request('POST', '/genomes', payload)
export const deleteGenome = (id) => request('DELETE', `/genomes/${id}`)

// ── Design configs (parameter presets) ───────────────────────────────────────
export const getConfigs = () => request('GET', '/configs')
export const saveConfigApi = (payload) => request('POST', '/configs', payload)
export const updateConfigApi = (id, payload) => request('PUT', `/configs/${id}`, payload)
export const deleteConfigApi = (id) => request('DELETE', `/configs/${id}`)

// ── Saved sequences ──────────────────────────────────────────────────────────
export const getSequences = () => request('GET', '/sequences')
export const saveSequence = (payload) => request('POST', '/sequences', payload)
export const deleteSequence = (id) => request('DELETE', `/sequences/${id}`)

// ── Sequence fetch ─────────────────────────────────────────────────────────────
export const fetchSequence = (accession) =>
  request('POST', '/sequence/fetch', { accession })
