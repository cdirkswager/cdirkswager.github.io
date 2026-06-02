const WORKER_URL_KEY = 'hunt-worker-url'
const API_KEY_KEY = 'hunt-worker-api-key'
const USAGE_KEY = 'hunt-worker-usage'

let statusListeners = []
let syncStatus = { status: 'disconnected', lastSynced: null, error: null, localChanges: false }
let usageListeners = []

function notifyListeners() {
  statusListeners.forEach(fn => fn({ ...syncStatus }))
}

function notifyUsageListeners() {
  const state = getUsageState()
  usageListeners.forEach(fn => fn(state))
}

function getStoredUsage() {
  try {
    const raw = localStorage.getItem(USAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

export function onStatusChange(fn) {
  statusListeners.push(fn)
  fn({ ...syncStatus })
  return () => { statusListeners = statusListeners.filter(f => f !== fn) }
}

export function onUsageChange(fn) {
  usageListeners.push(fn)
  const state = getUsageState()
  if (state) fn(state)
  return () => { usageListeners = usageListeners.filter(f => f !== fn) }
}

export function getUsageState() {
  return getStoredUsage()
}

export function getWorkerUrl() {
  try { return localStorage.getItem(WORKER_URL_KEY) } catch { return null }
}

export function getApiKey() {
  try { return localStorage.getItem(API_KEY_KEY) } catch { return null }
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

function setStatus(partial) {
  syncStatus = { ...syncStatus, ...partial }
  notifyListeners()
}

function workerFetch(path, options = {}) {
  const url = getWorkerUrl()
  if (!url) throw new Error('Not connected')
  return fetch(url + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

function saveUsageFromResponse(data) {
  if (!data || data.reads == null) return
  const state = { reads: data.reads, writes: data.writes, limit: data.limit, periodStart: data.periodStart, lastChecked: Date.now() }
  localStorage.setItem(USAGE_KEY, JSON.stringify(state))
  notifyUsageListeners()
}

export async function pullFromWorker() {
  try {
    setStatus({ status: 'syncing', error: null })
    const res = await workerFetch('/data')
    if (!res.ok) throw new Error(`Worker returned ${res.status}`)
    const data = await res.json()
    if (!data.campaign) throw new Error('Invalid format')
    localStorage.setItem('hunt-campaign-data', JSON.stringify(data.campaign))
    localStorage.setItem('hunt-users', JSON.stringify(data.users || '[]'))
    localStorage.setItem('hunt-access-requests', JSON.stringify(data.requests || '[]'))
    clearLocalChanges()
    setStatus({ status: 'synced', lastSynced: Date.now(), error: null })
    return data
  } catch (e) {
    setStatus({ status: 'error', error: e.message || 'Pull failed' })
    return null
  }
}

export async function pushToWorker() {
  const apiKey = getApiKey()
  if (!apiKey) return { ok: false, error: 'API key not configured' }
  try {
    setStatus({ status: 'syncing', error: null })
    const campaign = JSON.parse(localStorage.getItem('hunt-campaign-data') || '{}')
    let users = []
    let requests = []
    try { users = JSON.parse(localStorage.getItem('hunt-users') || '[]') } catch {}
    try { requests = JSON.parse(localStorage.getItem('hunt-access-requests') || '[]') } catch {}
    const body = { campaign, users, requests }
    const res = await workerFetch('/data', {
      method: 'PUT',
      headers: { 'X-API-Key': apiKey },
      body: JSON.stringify(body),
    })
    if (res.status === 401) return { ok: false, error: 'Invalid API key — check your Worker config' }
    if (res.status === 429) {
      const usage = await res.json().catch(() => ({}))
      saveUsageFromResponse(usage)
      return { ok: false, error: 'Rate limited — try again later', rateLimited: true }
    }
    if (!res.ok) {
      const info = await res.json().catch(() => ({}))
      return { ok: false, error: info.error || `Worker returned ${res.status}` }
    }
    clearLocalChanges()
    setStatus({ status: 'synced', lastSynced: Date.now(), error: null })
    return { ok: true }
  } catch (e) {
    setStatus({ status: 'error', error: e.message || 'Push failed' })
    return { ok: false, error: e.message || 'Push failed' }
  }
}

export async function checkUsage() {
  const apiKey = getApiKey()
  if (!apiKey) return null
  try {
    const res = await workerFetch('/usage', {
      headers: { 'X-API-Key': apiKey },
    })
    if (!res.ok) return null
    const data = await res.json()
    saveUsageFromResponse(data)
    return data
  } catch {
    return null
  }
}

export async function testConnection(url, apiKey) {
  try {
    const res = await fetch(url + '/data')
    if (!res.ok) return { ok: false, error: `Worker returned ${res.status}` }
    const data = await res.json()
    if (!data || typeof data.campaign === 'undefined') return { ok: false, error: 'Not a valid sync endpoint' }
    localStorage.setItem(WORKER_URL_KEY, url)
    localStorage.setItem(API_KEY_KEY, apiKey)
    setStatus({ status: 'synced', lastSynced: Date.now(), error: null, localChanges: false })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message || 'Could not reach Worker' }
  }
}

export function disconnect() {
  localStorage.removeItem(WORKER_URL_KEY)
  localStorage.removeItem(API_KEY_KEY)
  localStorage.removeItem(USAGE_KEY)
  setStatus({ status: 'disconnected', lastSynced: null, error: null, localChanges: false })
  notifyUsageListeners()
}
