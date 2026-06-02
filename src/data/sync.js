const WORKER_URL_KEY = 'hunt-worker-url'
const API_KEY_KEY = 'hunt-worker-api-key'

export function getWorkerUrl() {
  try { return localStorage.getItem(WORKER_URL_KEY) } catch { return null }
}

export function getApiKey() {
  try { return localStorage.getItem(API_KEY_KEY) } catch { return null }
}

function workerFetch(path, options = {}) {
  const url = getWorkerUrl()
  if (!url) throw new Error('Not connected')
  return fetch(url + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
}

export async function pullFromWorker() {
  try {
    const res = await workerFetch('/data')
    if (!res.ok) throw new Error(`Worker returned ${res.status}`)
    const data = await res.json()
    if (!data.campaign) throw new Error('Invalid format')
    localStorage.setItem('hunt-campaign-data', JSON.stringify(data.campaign))
    localStorage.setItem('hunt-users', JSON.stringify(data.users || '[]'))
    localStorage.setItem('hunt-access-requests', JSON.stringify(data.requests || '[]'))
    return data
  } catch (e) {
    console.warn('Worker pull failed:', e.message)
    return null
  }
}

export async function pushToWorker() {
  const apiKey = getApiKey()
  if (!apiKey) return
  try {
    const campaign = JSON.parse(localStorage.getItem('hunt-campaign-data') || '{}')
    let users = []
    let requests = []
    try { users = JSON.parse(localStorage.getItem('hunt-users') || '[]') } catch {}
    try { requests = JSON.parse(localStorage.getItem('hunt-access-requests') || '[]') } catch {}
    await workerFetch('/data', {
      method: 'PUT',
      headers: { 'X-API-Key': apiKey },
      body: JSON.stringify({ campaign, users, requests }),
    })
  } catch (e) {
    console.warn('Worker push failed:', e.message)
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
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message || 'Could not reach Worker' }
  }
}

export function disconnect() {
  localStorage.removeItem(WORKER_URL_KEY)
  localStorage.removeItem(API_KEY_KEY)
}
