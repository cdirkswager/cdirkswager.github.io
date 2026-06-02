const AUTH_KEY = 'hunt-auth-session'
const USERS_KEY = 'hunt-users'

const ADMIN_USERNAME = import.meta.env.VITE_ADMIN_USERNAME || 'admin'
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123'

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return 'h' + Math.abs(h).toString(36);
}

const ADMIN_PASS_HASH = hash(ADMIN_PASSWORD)

function getUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  return []
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function seedAdmin() {
  const users = getUsers()
  if (users.some(u => u.username === ADMIN_USERNAME)) return
  users.push({
    id: 'user-admin',
    username: ADMIN_USERNAME,
    passwordHash: ADMIN_PASS_HASH,
    role: 'dm',
    playerId: null,
    createdAt: Date.now(),
  })
  saveUsers(users)
}

seedAdmin()

export function isPlayerClaimed(playerId) {
  if (!playerId) return false
  const users = getUsers()
  return users.some(u => u.playerId === playerId)
}

export function getClaimedPlayerIds() {
  const users = getUsers()
  const ids = {}
  users.forEach(u => { if (u.playerId) ids[u.playerId] = u.username })
  return ids
}

export function getPlayerOwner(playerId) {
  const users = getUsers()
  const user = users.find(u => u.playerId === playerId)
  return user || null
}

export function register(username, password, playerId) {
  const users = getUsers()
  if (users.find(u => u.username === username)) {
    return { ok: false, error: 'Username already taken' }
  }
  if (username.length < 2) {
    return { ok: false, error: 'Username must be at least 2 characters' }
  }
  if (password.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters' }
  }
  if (username.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
    return { ok: false, error: 'That username is reserved' }
  }
  if (!playerId) {
    return { ok: false, error: 'You must select a character to play' }
  }
  if (isPlayerClaimed(playerId)) {
    return { ok: false, error: 'That character is already claimed by another player' }
  }
  const user = {
    id: 'user-' + Date.now(),
    username,
    passwordHash: hash(password),
    role: 'player',
    playerId,
    createdAt: Date.now(),
  }
  users.push(user)
  saveUsers(users)
  return { ok: true, user, isDM: false }
}

export function login(username, password) {
  const users = getUsers()
  const user = users.find(u => u.username === username)
  if (!user) {
    return { ok: false, error: 'User not found' }
  }
  if (user.passwordHash !== hash(password)) {
    return { ok: false, error: 'Incorrect password' }
  }
  const session = { userId: user.id, username: user.username, role: user.role, playerId: user.playerId }
  localStorage.setItem(AUTH_KEY, JSON.stringify(session))
  return { ok: true, session }
}

export function logout() {
  localStorage.removeItem(AUTH_KEY)
}

export function getSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
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

export function getAccessRequests() {
  try {
    const raw = localStorage.getItem('hunt-access-requests')
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  return []
}

export function saveAccessRequest(req) {
  const requests = getAccessRequests()
  if (!req.id) {
    req.id = 'req-' + Date.now()
    req.createdAt = Date.now()
    req.status = 'pending'
  }
  const idx = requests.findIndex(r => r.id === req.id)
  if (idx >= 0) requests[idx] = req
  else requests.push(req)
  localStorage.setItem('hunt-access-requests', JSON.stringify(requests))
  return req
}

export function approveRequest(reqId, playerId, username) {
  const requests = getAccessRequests()
  const req = requests.find(r => r.id === reqId)
  if (!req) return
  req.status = 'approved'
  localStorage.setItem('hunt-access-requests', JSON.stringify(requests))

  const users = getUsers()
  const user = users.find(u => u.username === req.username)
  if (user) {
    user.playerId = playerId
    saveUsers(users)
  }
}

export function denyRequest(reqId) {
  const requests = getAccessRequests()
  const req = requests.find(r => r.id === reqId)
  if (!req) return
  req.status = 'denied'
  localStorage.setItem('hunt-access-requests', JSON.stringify(requests))
}

export function getAllUsers() {
  return getUsers()
}

export function deleteUser(userId) {
  const users = getUsers()
  const target = users.find(u => u.id === userId)
  if (!target || target.username === ADMIN_USERNAME) return
  saveUsers(users.filter(u => u.id !== userId))
}

export function unclaimPlayerId(playerId) {
  const users = getUsers()
  users.forEach(u => {
    if (u.playerId === playerId) u.playerId = null
  })
  saveUsers(users)
}

export function getAllAccessRequests() {
  return getAccessRequests()
}

export function setPlayerIdForUser(username, playerId) {
  const users = getUsers()
  const user = users.find(u => u.username === username)
  if (user) {
    user.playerId = playerId
    saveUsers(users)
    const session = getSession()
    if (session && session.userId === user.id) {
      session.playerId = playerId
      localStorage.setItem(AUTH_KEY, JSON.stringify(session))
    }
  }
}
