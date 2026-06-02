function simpleHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h |= 0
  }
  return 'h' + Math.abs(h).toString(36)
}

async function getUsers(env) {
  const raw = await env.HUNT_DATA.get('users', { type: 'json' })
  return raw || []
}

async function saveUsers(env, users) {
  await env.HUNT_DATA.put('users', JSON.stringify(users))
}

async function getRequests(env) {
  const raw = await env.HUNT_DATA.get('requests', { type: 'json' })
  return raw || []
}

async function saveRequests(env, requests) {
  await env.HUNT_DATA.put('requests', JSON.stringify(requests))
}

async function ensureAdmin(env) {
  const adminName = env.ADMIN_USERNAME
  const adminPass = env.ADMIN_PASSWORD
  if (!adminName || !adminPass) return
  const users = await getUsers(env)
  if (users.some(u => u.username === adminName)) return
  users.push({
    id: 'user-admin',
    username: adminName,
    passwordHash: simpleHash(adminPass),
    role: 'dm',
    playerId: null,
    createdAt: Date.now(),
  })
  await saveUsers(env, users)
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

async function requireSession(request, env) {
  const token = request.headers.get('X-Session-Token')
  return await getSession(env, token)
}

function jsonResponse(data, status = 200, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function handleAuth(request, env, corsHeaders, url) {
  await ensureAdmin(env)

  const path = url.pathname

  if (path === '/auth/register' && request.method === 'POST') {
    const { username, password, playerId } = await request.json()
    if (!username || username.length < 2) return jsonResponse({ ok: false, error: 'Username must be at least 2 characters' }, 400, corsHeaders)
    if (!password || password.length < 4) return jsonResponse({ ok: false, error: 'Password must be at least 4 characters' }, 400, corsHeaders)
    const adminName = env.ADMIN_USERNAME
    if (adminName && username.toLowerCase() === adminName.toLowerCase()) return jsonResponse({ ok: false, error: 'That username is reserved' }, 400, corsHeaders)
    if (!playerId) return jsonResponse({ ok: false, error: 'You must select a character to play' }, 400, corsHeaders)

    const users = await getUsers(env)
    if (users.find(u => u.username === username)) return jsonResponse({ ok: false, error: 'Username already taken' }, 409, corsHeaders)
    if (users.find(u => u.playerId === playerId)) return jsonResponse({ ok: false, error: 'That character is already claimed' }, 409, corsHeaders)

    const user = {
      id: 'user-' + Date.now(),
      username,
      passwordHash: simpleHash(password),
      role: 'player',
      playerId,
      createdAt: Date.now(),
    }
    users.push(user)
    await saveUsers(env, users)

    const session = await createSession(env, user)
    return jsonResponse({ ok: true, session }, 201, corsHeaders)
  }

  if (path === '/auth/login' && request.method === 'POST') {
    const { username, password } = await request.json()
    if (!username || !password) return jsonResponse({ ok: false, error: 'Username and password required' }, 400, corsHeaders)

    const users = await getUsers(env)
    const user = users.find(u => u.username === username)
    if (!user) return jsonResponse({ ok: false, error: 'User not found' }, 401, corsHeaders)
    if (user.passwordHash !== simpleHash(password)) return jsonResponse({ ok: false, error: 'Incorrect password' }, 401, corsHeaders)

    const session = await createSession(env, user)
    return jsonResponse({ ok: true, session })
  }

  if (path === '/auth/session' && request.method === 'GET') {
    const session = await requireSession(request, env)
    if (!session) return jsonResponse({ ok: false, error: 'No session' }, 401, corsHeaders)
    return jsonResponse({ ok: true, session })
  }

  if (path === '/auth/logout' && request.method === 'POST') {
    const token = request.headers.get('X-Session-Token')
    await deleteSession(env, token)
    return jsonResponse({ ok: true })
  }

  if (path === '/auth/users' && request.method === 'GET') {
    const session = await requireSession(request, env)
    if (!session || session.role !== 'dm') return jsonResponse({ ok: false, error: 'Unauthorized' }, 403, corsHeaders)
    const users = await getUsers(env)
    return jsonResponse({ ok: true, users })
  }

  if (path.startsWith('/auth/users/') && request.method === 'DELETE') {
    const session = await requireSession(request, env)
    if (!session || session.role !== 'dm') return jsonResponse({ ok: false, error: 'Unauthorized' }, 403, corsHeaders)
    const userId = path.replace('/auth/users/', '')
    const users = await getUsers(env)
    const target = users.find(u => u.id === userId)
    if (!target) return jsonResponse({ ok: false, error: 'User not found' }, 404, corsHeaders)
    if (target.username === env.ADMIN_USERNAME) return jsonResponse({ ok: false, error: 'Cannot delete admin' }, 403, corsHeaders)
    await saveUsers(env, users.filter(u => u.id !== userId))
    return jsonResponse({ ok: true })
  }

  if (path === '/auth/requests' && request.method === 'GET') {
    const session = await requireSession(request, env)
    if (!session || session.role !== 'dm') return jsonResponse({ ok: false, error: 'Unauthorized' }, 403, corsHeaders)
    const requests = await getRequests(env)
    return jsonResponse({ ok: true, requests })
  }

  if (path === '/auth/requests' && request.method === 'POST') {
    const session = await requireSession(request, env)
    if (!session) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, corsHeaders)
    const { playerId, message } = await request.json()
    const requests = await getRequests(env)
    const req = {
      id: 'req-' + Date.now(),
      username: session.username,
      playerId: playerId || null,
      message: message || '',
      status: 'pending',
      createdAt: Date.now(),
    }
    requests.push(req)
    await saveRequests(env, requests)
    return jsonResponse({ ok: true, request: req }, 201, corsHeaders)
  }

  if (path.endsWith('/approve') && request.method === 'PUT') {
    const reqId = path.replace('/auth/requests/', '').replace('/approve', '')
    const session = await requireSession(request, env)
    if (!session || session.role !== 'dm') return jsonResponse({ ok: false, error: 'Unauthorized' }, 403, corsHeaders)
    const { playerId } = await request.json()
    const requests = await getRequests(env)
    const req = requests.find(r => r.id === reqId)
    if (!req) return jsonResponse({ ok: false, error: 'Request not found' }, 404, corsHeaders)
    req.status = 'approved'
    await saveRequests(env, requests)
    const users = await getUsers(env)
    const user = users.find(u => u.username === req.username)
    if (user && playerId) {
      user.playerId = playerId
      await saveUsers(env, users)
    }
    return jsonResponse({ ok: true })
  }

  if (path.endsWith('/deny') && request.method === 'PUT') {
    const reqId = path.replace('/auth/requests/', '').replace('/deny', '')
    const session = await requireSession(request, env)
    if (!session || session.role !== 'dm') return jsonResponse({ ok: false, error: 'Unauthorized' }, 403, corsHeaders)
    const requests = await getRequests(env)
    const req = requests.find(r => r.id === reqId)
    if (!req) return jsonResponse({ ok: false, error: 'Request not found' }, 404, corsHeaders)
    req.status = 'denied'
    await saveRequests(env, requests)
    return jsonResponse({ ok: true })
  }

  if (path === '/auth/migrate' && request.method === 'POST') {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey || apiKey !== env.API_KEY) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, corsHeaders)
    const { users: incomingUsers, requests: incomingRequests } = await request.json()
    const existingUsers = await getUsers(env)
    const merged = [...existingUsers]
    for (const u of incomingUsers || []) {
      const idx = merged.findIndex(m => m.username === u.username)
      if (idx >= 0) merged[idx] = u
      else merged.push(u)
    }
    await saveUsers(env, merged)
    const existingReqs = await getRequests(env)
    const mergedReqs = [...existingReqs]
    for (const r of incomingRequests || []) {
      const idx = mergedReqs.findIndex(m => m.id === r.id)
      if (idx >= 0) mergedReqs[idx] = r
      else mergedReqs.push(r)
    }
    await saveRequests(env, mergedReqs)
    return jsonResponse({ ok: true })
  }

  if (path === '/auth/claimed' && request.method === 'GET') {
    const users = await getUsers(env)
    const claimed = {}
    users.forEach(u => { if (u.playerId) claimed[u.playerId] = u.username })
    return jsonResponse({ ok: true, claimed })
  }

  if (path === '/auth/player/unclaim' && request.method === 'PUT') {
    const session = await requireSession(request, env)
    if (!session) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, corsHeaders)
    const { playerId } = await request.json()
    if (!playerId) return jsonResponse({ ok: false, error: 'playerId required' }, 400, corsHeaders)
    const users = await getUsers(env)
    let changed = false
    users.forEach(u => {
      if (u.playerId === playerId) {
        u.playerId = null
        changed = true
      }
    })
    if (changed) await saveUsers(env, users)
    return jsonResponse({ ok: true })
  }

  if (path === '/auth/check-admin' && request.method === 'GET') {
    const users = await getUsers(env)
    const adminName = env.ADMIN_USERNAME
    const exists = adminName ? users.some(u => u.username === adminName) : false
    return jsonResponse({ ok: true, adminExists: exists })
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404, corsHeaders)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Session-Token',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    const now = Date.now()
    const hourKey = 'usage:' + new Date(now).toISOString().slice(0, 13)

    async function getUsage() {
      const raw = await env.HUNT_USAGE.get(hourKey)
      return raw ? JSON.parse(raw) : { reads: 0, writes: 0 }
    }

    async function saveUsage(u) {
      const ttl = 3600 - Math.floor((now / 1000) % 3600)
      await env.HUNT_USAGE.put(hourKey, JSON.stringify(u), { expirationTtl: ttl + 600 })
    }

    if (url.pathname.startsWith('/auth/')) {
      return handleAuth(request, env, corsHeaders, url)
    }

    if (url.pathname === '/data') {
      if (request.method === 'GET') {
        const raw = await env.HUNT_DATA.get('campaign-data', { type: 'json' })
        const usage = await getUsage()
        usage.reads++
        await saveUsage(usage)
        const data = raw || { campaign: {}, users: [], requests: [] }
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (request.method === 'PUT') {
        const apiKey = request.headers.get('X-API-Key')
        if (!apiKey || apiKey !== env.API_KEY) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const body = await request.json()
        await env.HUNT_DATA.put('campaign-data', JSON.stringify(body))
        const usage = await getUsage()
        usage.writes++
        await saveUsage(usage)
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (url.pathname === '/usage' && request.method === 'GET') {
      const apiKey = request.headers.get('X-API-Key')
      if (!apiKey || apiKey !== env.API_KEY) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const usage = await getUsage()
      return new Response(JSON.stringify({
        reads: usage.reads,
        writes: usage.writes,
        limit: 5000,
        periodStart: new Date(now).toISOString().slice(0, 13),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not found', { status: 404, headers: corsHeaders })
  },
}
