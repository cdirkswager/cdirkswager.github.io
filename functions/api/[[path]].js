function simpleHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h |= 0
  }
  return 'h' + Math.abs(h).toString(36)
}

async function getFromKv(env, key, fallback = null) {
  const raw = await env.HUNT_DATA.get(key, { type: 'json' })
  return raw ?? fallback
}

function saveToKv(env, key, data) {
  return env.HUNT_DATA.put(key, JSON.stringify(data))
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function getCookieValue(request, name) {
  const cookie = request.headers.get('Cookie')
  if (!cookie) return null
  const match = cookie.match(new RegExp('(?:^|;)\\s*' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[1]) : null
}

function setSessionCookie(name, value, maxAge = 86400) {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
}

function clearSessionCookie(name) {
  return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

async function createSession(env, user) {
  const token = crypto.randomUUID()
  const session = { userId: user.id, username: user.username, role: user.role, playerId: user.playerId }
  await env.HUNT_DATA.put('session:' + token, JSON.stringify(session), { expirationTtl: 86400 })
  return { ...session, token }
}

async function getSession(env, token) {
  if (!token) return null
  return await env.HUNT_DATA.get('session:' + token, { type: 'json' })
}

async function deleteSession(env, token) {
  if (!token) return
  await env.HUNT_DATA.delete('session:' + token)
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const path = url.pathname.replace('/api', '') || '/'

  const method = request.method

  const body = method === 'POST' || method === 'PUT' ? await request.json().catch(() => ({})) : {}

  const sessionToken = getCookieValue(request, 'session') || request.headers.get('X-Session-Token')
  const session = await getSession(env, sessionToken)

  try {
    // ─── AUTH ROUTES ───────────────────────────────────────────

      // POST /api/auth/register — submit registration for DM approval
      if (path === '/auth/register' && method === 'POST') {
        const { username, password, proposedName } = body
        if (!username || username.length < 2) return json({ ok: false, error: 'Username must be at least 2 characters' }, 400)
        if (!password || password.length < 4) return json({ ok: false, error: 'Password must be at least 4 characters' }, 400)
        if (!proposedName || !proposedName.trim()) return json({ ok: false, error: 'Please propose a character name' }, 400)

        const adminName = env.ADMIN_USERNAME
        if (adminName && username.toLowerCase() === adminName.toLowerCase()) {
          return json({ ok: false, error: 'That username is reserved' }, 400)
        }

        const users = await getFromKv(env, 'users', [])
        if (users.find(u => u.username === username)) return json({ ok: false, error: 'Username already taken' }, 409)

        users.push({
          id: 'user-' + Date.now(),
          username,
          passwordHash: simpleHash(password),
          role: 'pending',
          proposedName: proposedName.trim(),
          playerId: null,
          createdAt: Date.now(),
        })
        await saveToKv(env, 'users', users)
        return json({ ok: true, message: 'Registration submitted for DM approval!' }, 201)
      }

    // POST /api/auth/login
    if (path === '/auth/login' && method === 'POST') {
      const { username, password } = body
      if (!username || !password) return json({ ok: false, error: 'Username and password required' }, 400)

      const users = await getFromKv(env, 'users', [])
      const user = users.find(u => u.username === username)
      if (!user) return json({ ok: false, error: 'User not found' }, 401)
      if (user.passwordHash !== simpleHash(password)) return json({ ok: false, error: 'Incorrect password' }, 401)
      if (user.role === 'pending') return json({ ok: false, error: 'Your account is pending DM approval' }, 401)

      const s = await createSession(env, user)
      const headers = { 'Set-Cookie': setSessionCookie('session', s.token) }
      return json({ ok: true, session: s }, 200, headers)
    }

    // GET /api/auth/session
    if (path === '/auth/session' && method === 'GET') {
      if (!session) return json({ ok: false, error: 'No session' }, 401)
      return json({ ok: true, session })
    }

    // POST /api/auth/logout
    if (path === '/auth/logout' && method === 'POST') {
      await deleteSession(env, sessionToken)
      const headers = { 'Set-Cookie': clearSessionCookie('session') }
      return json({ ok: true }, 200, headers)
    }

    // POST /api/auth/bootstrap
    if (path === '/auth/bootstrap' && method === 'POST') {
      const users = await getFromKv(env, 'users', [])
      const hasAdmin = users.some(u => u.role === 'dm')
      const apiKey = request.headers.get('X-API-Key')
      if (hasAdmin && (!apiKey || apiKey !== env.API_KEY)) {
        return json({ ok: false, error: 'Unauthorized' }, 401)
      }

      const { username, password } = body
      if (!username || username.length < 2) return json({ ok: false, error: 'Username must be at least 2 characters' }, 400)
      if (!password || password.length < 4) return json({ ok: false, error: 'Password must be at least 4 characters' }, 400)

      const existing = users.find(u => u.username === username)
      if (existing) {
        existing.passwordHash = simpleHash(password)
        existing.role = 'dm'
      } else {
        users.push({
          id: 'user-admin',
          username,
          passwordHash: simpleHash(password),
          role: 'dm',
          playerId: null,
          createdAt: Date.now(),
        })
      }
      await saveToKv(env, 'users', users)
      return json({ ok: true, message: 'Admin account ready' })
    }

    // GET /api/auth/check-admin
    if (path === '/auth/check-admin' && method === 'GET') {
      const users = await getFromKv(env, 'users', [])
      const adminName = env.ADMIN_USERNAME
      const exists = adminName ? users.some(u => u.username === adminName) : users.some(u => u.role === 'dm')
      return json({ ok: true, adminExists: exists })
    }

    // GET /api/auth/claimed
    if (path === '/auth/claimed' && method === 'GET') {
      const users = await getFromKv(env, 'users', [])
      const claimed = {}
      users.forEach(u => { if (u.playerId) claimed[u.playerId] = u.username })
      return json({ ok: true, claimed })
    }

    // POST /api/auth/requests — save access request
    if (path === '/auth/requests' && method === 'POST') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const { playerId, message } = body
      const requests = await getFromKv(env, 'requests', [])
      const req = {
        id: 'req-' + Date.now(),
        username: session.username,
        playerId: playerId || null,
        message: message || '',
        status: 'pending',
        createdAt: Date.now(),
      }
      requests.push(req)
      await saveToKv(env, 'requests', requests)
      return json({ ok: true, request: req }, 201)
    }

    // GET /api/auth/requests — get all (DM only)
    if (path === '/auth/requests' && method === 'GET') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      const requests = await getFromKv(env, 'requests', [])
      return json({ ok: true, requests })
    }

    // PUT /api/auth/requests/:id/approve
    const approveMatch = path.match(/^\/auth\/requests\/(.+)\/approve$/)
    if (approveMatch && method === 'PUT') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      const reqId = approveMatch[1]
      const { playerId } = body
      const requests = await getFromKv(env, 'requests', [])
      const req = requests.find(r => r.id === reqId)
      if (!req) return json({ ok: false, error: 'Request not found' }, 404)
      req.status = 'approved'
      await saveToKv(env, 'requests', requests)
      const users = await getFromKv(env, 'users', [])
      const user = users.find(u => u.username === req.username)
      if (user && playerId) {
        user.playerId = playerId
        await saveToKv(env, 'users', users)
      }
      return json({ ok: true })
    }

    // PUT /api/auth/requests/:id/deny
    const denyMatch = path.match(/^\/auth\/requests\/(.+)\/deny$/)
    if (denyMatch && method === 'PUT') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      const reqId = denyMatch[1]
      const requests = await getFromKv(env, 'requests', [])
      const req = requests.find(r => r.id === reqId)
      if (!req) return json({ ok: false, error: 'Request not found' }, 404)
      req.status = 'denied'
      await saveToKv(env, 'requests', requests)
      return json({ ok: true })
    }

    // POST /api/auth/approve-registration/:userId — approve a pending registration (DM only)
    const approveRegMatch = path.match(/^\/auth\/approve-registration\/(.+)$/)
    if (approveRegMatch && method === 'POST') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      const userId = approveRegMatch[1]
      const users = await getFromKv(env, 'users', [])
      const user = users.find(u => u.id === userId)
      if (!user) return json({ ok: false, error: 'User not found' }, 404)
      if (user.role !== 'pending') return json({ ok: false, error: 'User is not pending' }, 400)

      let campaignData = await getFromKv(env, 'campaign-data', null)
      if (!campaignData || !campaignData.players) {
        campaignData = { players: [], maps: [], mapPins: [], questionnaires: [], responses: [], comments: {} }
      }

      const newPlayer = {
        id: 'player-' + Date.now(),
        name: user.proposedName || 'Unknown Adventurer',
        race: '',
        class: '',
        level: 1,
        title: '',
        theme: {},
        layout: 'single',
        widgets: [],
        widgetAnimations: {},
        musicUrl: '',
        commentsEnabled: true,
        avatarUrl: '',
        customCode: { enabled: false, html: '', css: '' },
        createdAt: Date.now(),
      }
      campaignData.players.push(newPlayer)
      await saveToKv(env, 'campaign-data', campaignData)

      user.role = 'player'
      user.playerId = newPlayer.id
      delete user.proposedName
      await saveToKv(env, 'users', users)

      return json({ ok: true, player: newPlayer })
    }

    // GET /api/auth/users (DM only)
    if (path === '/auth/users' && method === 'GET') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      const users = await getFromKv(env, 'users', [])
      return json({ ok: true, users })
    }

    // DELETE /api/auth/users/:id (DM only)
    const deleteUserMatch = path.match(/^\/auth\/users\/(.+)$/)
    if (deleteUserMatch && method === 'DELETE') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      const userId = deleteUserMatch[1]
      const users = await getFromKv(env, 'users', [])
      const target = users.find(u => u.id === userId)
      if (!target) return json({ ok: false, error: 'User not found' }, 404)
      if (target.username === env.ADMIN_USERNAME) return json({ ok: false, error: 'Cannot delete admin' }, 403)
      await saveToKv(env, 'users', users.filter(u => u.id !== userId))
      return json({ ok: true })
    }

    // PUT /api/auth/player/unclaim
    if (path === '/auth/player/unclaim' && method === 'PUT') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const { playerId } = body
      if (!playerId) return json({ ok: false, error: 'playerId required' }, 400)
      const users = await getFromKv(env, 'users', [])
      let changed = false
      users.forEach(u => {
        if (u.playerId === playerId) {
          u.playerId = null
          changed = true
        }
      })
      if (changed) await saveToKv(env, 'users', users)
      return json({ ok: true })
    }

    // ─── DATA ROUTES ───────────────────────────────────────────

    // GET /api/data — full campaign data (handles legacy format migration)
    if (path === '/data' && method === 'GET') {
      let data = await getFromKv(env, 'campaign-data', null)
      if (!data) {
        data = { players: [], maps: [], mapPins: [], questionnaires: [], responses: [], comments: {} }
      } else if (data.campaign && !data.players) {
        // Legacy format migration: old worker stored { campaign: {...}, users, requests }
        data = data.campaign
        // Save in new format for next time
        await saveToKv(env, 'campaign-data', data)
      }
      return json({ ok: true, ...data })
    }

    // POST /api/data — save full campaign data (requires API key or DM session)
    if (path === '/data' && method === 'POST') {
      const apiKey = request.headers.get('X-API-Key')
      const authorized = (session && (session.role === 'dm' || session.role === 'player')) || (apiKey && apiKey === env.API_KEY)
      if (!authorized) return json({ ok: false, error: 'Unauthorized' }, 401)
      // If body is in legacy format { campaign, users, requests }, unwrap it
      const toSave = (body.campaign && !body.players) ? body.campaign : body
      await saveToKv(env, 'campaign-data', toSave)
      return json({ ok: true })
    }

    return json({ ok: false, error: 'Not found' }, 404)
  } catch (e) {
    return json({ ok: false, error: e.message || 'Internal error' }, 500)
  }
}
