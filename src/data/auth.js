import api, { get, post, put, del } from './api'

const AUTH_KEY = 'hunt-auth-session'
const CLAIMED_KEY = 'hunt-claimed-ids'

let sessionCache = null

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
  const data = await post('/auth/login', { username, password })
  if (data.ok) {
    sessionCache = data.session
    localStorage.setItem(AUTH_KEY, JSON.stringify(data.session))
  }
  return data
}

export async function register(username, password, proposedName) {
  return await post('/auth/register', { username, password, proposedName })
}

export async function approvePendingUser(userId) {
  const data = await api('/auth/approve-registration/' + userId, { method: 'POST' })
  return data
}

export async function logout() {
  await post('/auth/logout')
  sessionCache = null
  localStorage.removeItem(AUTH_KEY)
}

export async function initAuth() {
  await refreshClaimed()

  const data = await get('/auth/session')
  if (data.ok) {
    sessionCache = data.session
    localStorage.setItem(AUTH_KEY, JSON.stringify(data.session))
    return data.session
  }

  sessionCache = null
  localStorage.removeItem(AUTH_KEY)
  return null
}

async function refreshClaimed() {
  const data = await get('/auth/claimed')
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
  const data = await get('/auth/users')
  return data.ok ? data.users : []
}

export async function deleteUser(userId) {
  const data = await del('/auth/users/' + userId)
  return data.ok
}

export async function unclaimPlayerId(playerId) {
  const data = await put('/auth/player/unclaim', { playerId })
  return data.ok
}

export async function getAccessRequests() {
  const data = await get('/auth/requests')
  return data.ok ? data.requests : []
}

export const getAllAccessRequests = getAccessRequests

export async function saveAccessRequest(req) {
  const data = await post('/auth/requests', { playerId: req.playerId, message: req.message || '' })
  return data.request || req
}

export async function approveRequest(reqId, playerId) {
  await put('/auth/requests/' + reqId + '/approve', { playerId })
}

export async function denyRequest(reqId) {
  await put('/auth/requests/' + reqId + '/deny', {})
}

export async function setPlayerIdForUser(username, playerId) {
  const session = getSession()
  if (session && session.username === username) {
    session.playerId = playerId
    sessionCache = session
    localStorage.setItem(AUTH_KEY, JSON.stringify(session))
  }
}
export async function assignPlayerToUser(userId, playerId) {
  const data = await put('/auth/users/' + userId + '/assign-player', { playerId })
  return data.ok
}
export async function getVttToken() {
  const data = await post('/auth/vtt-token')
  return data.ok ? data : null
}

export async function getVttJwks() {
  const data = await get('/auth/vtt-jwks')
  return data.ok ? data : null
}

export async function checkAdminStatus() {
  return await get('/auth/check-admin')
}

export async function resetAdmin(username, password) {
  return await api('/auth/bootstrap', {
    method: 'POST',
    body: { username, password },
    useApiKey: false,
  })
}
