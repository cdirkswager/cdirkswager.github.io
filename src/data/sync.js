const GIST_ID_KEY = 'hunt-gist-id'
const PAT_KEY = 'hunt-github-pat'
const RATE_LIMIT_KEY = 'hunt-rate-limit'

const RAW_BASE = 'https://raw.githubusercontent.com'
const API_BASE = 'https://api.github.com'

const FILENAME = 'hunt-campaign-data.json'

let statusListeners = []
let syncStatus = { status: 'disconnected', lastSynced: null, error: null, localChanges: false }
let rateLimitListeners = []

function notifyListeners() {
  statusListeners.forEach(fn => fn({ ...syncStatus }))
}

function getStoredRateLimit() {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function saveRateLimitFromHeaders(headers) {
  const remaining = parseInt(headers.get('X-RateLimit-Remaining'))
  const limit = parseInt(headers.get('X-RateLimit-Limit'))
  const reset = parseInt(headers.get('X-RateLimit-Reset'))
  if (isNaN(remaining) || isNaN(limit) || isNaN(reset)) return
  const state = { remaining, limit, reset, lastChecked: Date.now() }
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state))
  notifyRateLimitListeners()
}

function saveRateLimitFromBody(data) {
  const { limit, remaining, reset } = data
  if (limit == null || remaining == null || reset == null) return
  const state = { remaining, limit, reset, lastChecked: Date.now() }
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state))
  notifyRateLimitListeners()
}

function notifyRateLimitListeners() {
  const state = getRateLimitState()
  rateLimitListeners.forEach(fn => fn(state))
}

export function onStatusChange(fn) {
  statusListeners.push(fn)
  fn({ ...syncStatus })
  return () => { statusListeners = statusListeners.filter(f => f !== fn) }
}

export function onRateLimitChange(fn) {
  rateLimitListeners.push(fn)
  const state = getRateLimitState()
  if (state) fn(state)
  return () => { rateLimitListeners = rateLimitListeners.filter(f => f !== fn) }
}

export function getRateLimitState() {
  const stored = getStoredRateLimit()
  if (!stored) return null
  if (stored.remaining <= 0 && stored.reset) {
    const resetMs = stored.reset * 1000
    if (Date.now() >= resetMs) {
      localStorage.removeItem(RATE_LIMIT_KEY)
      notifyRateLimitListeners()
      return null
    }
  }
  return stored
}

export function isRateLimited() {
  const state = getRateLimitState()
  if (!state) return false
  if (state.remaining <= 0 && state.reset) {
    const resetMs = state.reset * 1000
    if (Date.now() < resetMs) return true
    localStorage.removeItem(RATE_LIMIT_KEY)
    notifyRateLimitListeners()
    return false
  }
  return state.remaining <= 0
}

export async function checkRateLimit() {
  const pat = getPat()
  if (!pat) return null
  try {
    const res = await fetch('https://api.github.com/rate_limit', {
      headers: { Authorization: `Bearer ${pat}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    const core = data.resources.core
    saveRateLimitFromBody(core)
    return core
  } catch {
    return null
  }
}

export function getPat() {
  try { return localStorage.getItem(PAT_KEY) } catch { return null }
}

export function getGistId() {
  try { return localStorage.getItem(GIST_ID_KEY) } catch { return null }
}

export function getRawUrl() {
  const id = getGistId()
  if (!id) return null
  return `${RAW_BASE}/gist/${id}/raw/${FILENAME}`
}

function setStatus(partial) {
  syncStatus = { ...syncStatus, ...partial }
  notifyListeners()
}

export function hasLocalChanges() {
  return syncStatus.localChanges
}

export function markLocalChanges() {
  if (syncStatus.status === 'disconnected') return
  setStatus({ localChanges: true, error: null })
}

function clearLocalChanges() {
  setStatus({ localChanges: false })
}

export async function pullFromGist() {
  const url = getRawUrl()
  if (!url) return null
  try {
    setStatus({ status: 'syncing', error: null })
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
    const data = await res.json()
    if (!data.campaign || !data.users || !data.requests) throw new Error('Invalid format')
    localStorage.setItem('hunt-campaign-data', JSON.stringify(data.campaign))
    localStorage.setItem('hunt-users', JSON.stringify(data.users))
    localStorage.setItem('hunt-access-requests', JSON.stringify(data.requests))
    clearLocalChanges()
    setStatus({ status: 'synced', lastSynced: Date.now(), error: null })
    return data
  } catch (e) {
    setStatus({ status: 'error', error: e.message || 'Pull failed' })
    return null
  }
}

export async function pushToGist() {
  const pat = getPat()
  const gistId = getGistId()
  if (!pat || !gistId) return { ok: false, error: 'Not connected' }
  try {
    setStatus({ status: 'syncing', error: null })
    const campaign = JSON.parse(localStorage.getItem('hunt-campaign-data') || '{}')
    let users = []
    let requests = []
    try { users = JSON.parse(localStorage.getItem('hunt-users') || '[]') } catch {}
    try { requests = JSON.parse(localStorage.getItem('hunt-access-requests') || '[]') } catch {}
    const body = { campaign, users, requests }
    const res = await fetch(`${API_BASE}/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        files: {
          [FILENAME]: { content: JSON.stringify(body, null, 2) },
        },
      }),
    })
    saveRateLimitFromHeaders(res.headers)
    if (!res.ok) {
      const info = await res.json().catch(() => ({}))
      if (res.status === 403 || res.status === 429) {
        return { ok: false, error: 'Rate limited by GitHub — try again later', rateLimited: true }
      }
      return { ok: false, error: info.message || `GitHub returned ${res.status}` }
    }
    clearLocalChanges()
    setStatus({ status: 'synced', lastSynced: Date.now(), error: null })
    return { ok: true }
  } catch (e) {
    setStatus({ status: 'error', error: e.message || 'Push failed' })
    return { ok: false, error: e.message || 'Push failed' }
  }
}

export async function createGist(pat) {
  const campaign = JSON.parse(localStorage.getItem('hunt-campaign-data') || '{}')
  let users = []
  let requests = []
  try { users = JSON.parse(localStorage.getItem('hunt-users') || '[]') } catch {}
  try { requests = JSON.parse(localStorage.getItem('hunt-access-requests') || '[]') } catch {}
  const body = { campaign, users, requests }
  const res = await fetch(`${API_BASE}/gists`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      description: 'Hunt Campaign Data — auto-synced',
      public: false,
      files: {
        [FILENAME]: { content: JSON.stringify(body, null, 2) },
      },
    }),
  })
  saveRateLimitFromHeaders(res.headers)
  if (!res.ok) {
    const info = await res.json().catch(() => ({}))
    if (res.status === 403 || res.status === 429) {
      throw new Error('Rate limited by GitHub. Wait and try again.')
    }
    throw new Error(info.message || `GitHub returned ${res.status}`)
  }
  const gist = await res.json()
  localStorage.setItem(PAT_KEY, pat)
  localStorage.setItem(GIST_ID_KEY, gist.id)
  clearLocalChanges()
  setStatus({ status: 'synced', lastSynced: Date.now(), error: null })
  return gist.id
}

export function disconnect() {
  localStorage.removeItem(PAT_KEY)
  localStorage.removeItem(GIST_ID_KEY)
  localStorage.removeItem(RATE_LIMIT_KEY)
  setStatus({ status: 'disconnected', lastSynced: null, error: null, localChanges: false })
  notifyRateLimitListeners()
}

export function storeGistId(id) {
  if (id) localStorage.setItem(GIST_ID_KEY, id)
}
