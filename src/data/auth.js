const AUTH_KEY = 'hunt-auth-session'
const SESSION_TOKEN_KEY = 'hunt-session-token'
const CLAIMED_KEY = 'hunt-claimed-ids'

let sessionCache = null

function getWorkerUrl() {
  try {
    const fromStorage = localStorage.getItem('hunt-worker-url')
    if (fromStorage) return fromStorage
  } catch {}
  try {
    const envUrl = import.meta.env.VITE_WORKER_URL
    if (envUrl) {
      localStorage.setItem('hunt-worker-url', envUrl)
      return envUrl
    }
  } catch {}
  return null
}

async function authFetch(path, options = {}) {
  const url = getWorkerUrl()
  if (!url) return { ok: false, error: 'Worker not configured' }
  try {
    const res = await fetch(url + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
    return await res.json()
  } catch (e) {
    return { ok: false, error: e.message || 'Could not reach server' }
  }
}

export function getSession() {
  if (sessionCache) return sessionCache
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw) {
      sessionCache = JSON.parse(raw)
      return sessionCache
    }
  } catch {}
  return null
}

export function isLoggedIn() {
  return !!getSession()
}

export function isDM() {
  const s = getSession()
  return s && s.role === 'dm'
}

export function isPlayer() {
  const s = getSession()
  return s && s.role === 'player'
}

export function currentUser() {
  return getSession()
}

export async function login(username, password) {
  const data = await authFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (data.ok) {
    sessionCache = data.session
    localStorage.setItem(AUTH_KEY, JSON.stringify(data.session))
    localStorage.setItem(SESSION_TOKEN_KEY, data.session.token)
  }
  return data
}

export async function register(username, password, playerId) {
  return await authFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, playerId }),
  })
}

export async function logout() {
  const token = localStorage.getItem(SESSION_TOKEN_KEY)
  if (token) {
    await authFetch('/auth/logout', {
      method: 'POST',
      headers: { 'X-Session-Token': token },
    })
  }
  sessionCache = null
  localStorage.removeItem(AUTH_KEY)
  localStorage.removeItem(SESSION_TOKEN_KEY)
}

export async function initAuth() {
  await tryMigrate()
  await refreshClaimed()

  const token = localStorage.getItem(SESSION_TOKEN_KEY)
  if (token) {
    const data = await authFetch('/auth/session', {
      headers: { 'X-Session-Token': token },
    })
    if (data.ok) {
      sessionCache = data.session
      localStorage.setItem(AUTH_KEY, JSON.stringify(data.session))
      return data.session
    }
  }

  sessionCache = null
  localStorage.removeItem(AUTH_KEY)
  localStorage.removeItem(SESSION_TOKEN_KEY)
  return null
}

async function tryMigrate() {
  if (localStorage.getItem('hunt-auth-migrated')) return

  const usersRaw = localStorage.getItem('hunt-users')
  const requestsRaw = localStorage.getItem('hunt-access-requests')
  if (!usersRaw && !requestsRaw) {
    localStorage.setItem('hunt-auth-migrated', 'true')
    return
  }

  let parsedUsers = []
  let parsedRequests = []
  try { parsedUsers = usersRaw ? JSON.parse(usersRaw) : [] } catch {}
  try { parsedRequests = requestsRaw ? JSON.parse(requestsRaw) : [] } catch {}

  if (parsedUsers.length === 0 && parsedRequests.length === 0) {
    localStorage.setItem('hunt-auth-migrated', 'true')
    return
  }

  const envKey = import.meta.env.VITE_API_KEY
  if (!envKey) return

  const url = getWorkerUrl()
  if (!url) return

  try {
    const res = await fetch(url + '/auth/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': envKey },
      body: JSON.stringify({ users: parsedUsers, requests: parsedRequests }),
    })
    if (res.ok) {
      localStorage.removeItem('hunt-users')
      localStorage.removeItem('hunt-access-requests')
    }
  } catch {}
  localStorage.setItem('hunt-auth-migrated', 'true')
}

async function refreshClaimed() {
  const data = await authFetch('/auth/claimed')
  if (data.ok) {
    localStorage.setItem(CLAIMED_KEY, JSON.stringify(data.claimed))
  }
}

export function getClaimedPlayerIds() {
  try {
    const raw = localStorage.getItem(CLAIMED_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

export function isPlayerClaimed(playerId) {
  if (!playerId) return false
  const claimed = getClaimedPlayerIds()
  return !!claimed[playerId]
}

export function getPlayerOwner(playerId) {
  const claimed = getClaimedPlayerIds()
  const entry = Object.entries(claimed).find(([id]) => id === playerId)
  return entry ? { username: entry[1] } : null
}

export async function getAllUsers() {
  const token = localStorage.getItem(SESSION_TOKEN_KEY)
  const data = await authFetch('/auth/users', {
    headers: { 'X-Session-Token': token },
  })
  return data.ok ? data.users : []
}

export async function deleteUser(userId) {
  const token = localStorage.getItem(SESSION_TOKEN_KEY)
  const data = await authFetch('/auth/users/' + userId, {
    method: 'DELETE',
    headers: { 'X-Session-Token': token },
  })
  return data.ok
}

export async function unclaimPlayerId(playerId) {
  const token = localStorage.getItem(SESSION_TOKEN_KEY)
  const data = await authFetch('/auth/player/unclaim', {
    method: 'PUT',
    headers: { 'X-Session-Token': token },
    body: JSON.stringify({ playerId }),
  })
  return data.ok
}

export async function getAccessRequests() {
  const token = localStorage.getItem(SESSION_TOKEN_KEY)
  const data = await authFetch('/auth/requests', {
    headers: { 'X-Session-Token': token },
  })
  return data.ok ? data.requests : []
}

export const getAllAccessRequests = getAccessRequests

export async function saveAccessRequest(req) {
  const token = localStorage.getItem(SESSION_TOKEN_KEY)
  const data = await authFetch('/auth/requests', {
    method: 'POST',
    headers: { 'X-Session-Token': token },
    body: JSON.stringify({ playerId: req.playerId, message: req.message || '' }),
  })
  return data.request || req
}

export async function approveRequest(reqId, playerId) {
  const token = localStorage.getItem(SESSION_TOKEN_KEY)
  await authFetch('/auth/requests/' + reqId + '/approve', {
    method: 'PUT',
    headers: { 'X-Session-Token': token },
    body: JSON.stringify({ playerId }),
  })
}

export async function denyRequest(reqId) {
  const token = localStorage.getItem(SESSION_TOKEN_KEY)
  await authFetch('/auth/requests/' + reqId + '/deny', {
    method: 'PUT',
    headers: { 'X-Session-Token': token },
  })
}

export async function setPlayerIdForUser(username, playerId) {
  const session = getSession()
  if (session && session.username === username) {
    session.playerId = playerId
    sessionCache = session
    localStorage.setItem(AUTH_KEY, JSON.stringify(session))
  }
}
