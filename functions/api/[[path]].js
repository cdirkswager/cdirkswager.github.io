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

// ─── D1 campaign-data helpers ──────────────────────────────────

function tn(name) { return 'campaign_' + name }

async function d1Rows(env, table, extra = '') {
  const r = await env.HUNT_DB.prepare(`SELECT data FROM ${tn(table)} ${extra}`).all()
  return (r.results || []).map(row => JSON.parse(row.data))
}

async function d1Insert(env, table, id, extra, data, now) {
  const d = JSON.stringify(data)
  const cols = ['id', 'data', 'updated_at']
  const vals = [id, d, now]
  const phs = ['?','?','?']
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      cols.push(k); vals.push(v); phs.push('?')
    }
  }
  return env.HUNT_DB.prepare(
    `INSERT OR REPLACE INTO ${tn(table)} (${cols.join(',')}) VALUES (${phs.join(',')})`
  ).bind(...vals).run()
}

async function d1Delete(env, table, id) {
  return env.HUNT_DB.prepare(`DELETE FROM ${tn(table)} WHERE id = ?`).bind(id).run()
}

// Assemble the full campaign-data JSON shape from D1 rows
async function assembleCampaignFromD1(env) {
  const [players, npcs, maps, pins, qs, rs, dcs, notifs, comments, calE, calC, calS] =
    await Promise.all([
      d1Rows(env, 'players'),
      d1Rows(env, 'npcs'),
      d1Rows(env, 'maps'),
      d1Rows(env, 'map_pins'),
      d1Rows(env, 'questionnaires'),
      d1Rows(env, 'responses'),
      d1Rows(env, 'downtime_chronicles'),
      d1Rows(env, 'notifications'),
      env.HUNT_DB.prepare(
        'SELECT player_id, data FROM campaign_comments ORDER BY timestamp ASC'
      ).all(),
      d1Rows(env, 'calendar_events'),
      env.HUNT_DB.prepare(
        'SELECT date_key, data FROM campaign_calendar_comments ORDER BY updated_at ASC'
      ).all(),
      env.HUNT_DB.prepare('SELECT data FROM campaign_calendar_state LIMIT 1').first(),
    ])

  const rebuildMap = (rows, keyField) => {
    const map = {}
    for (const r of (rows.results || [])) {
      const obj = JSON.parse(r.data)
      const k = r[keyField]
      if (!map[k]) map[k] = []
      map[k].push(obj)
    }
    return map
  }

  return {
    players,
    npcs,
    maps,
    mapPins: pins,
    questionnaires: qs,
    responses: rs,
    downtimeChronicles: dcs,
    notifications: notifs,
    comments: rebuildMap(comments, 'player_id'),
    calendar: {
      events: calE,
      state: calS ? JSON.parse(calS.data) : { year: 3102, month: 0, day: 1 },
      comments: rebuildMap(calC, 'date_key'),
    },
  }
}

// Flatten the full blob into D1 rows (idempotent via INSERT OR REPLACE)
async function writeBlobToD1(env, data) {
  const now = Date.now()

  const insert = async (table, items, idFn, extraFn) => {
    if (!items || !items.length) return
    for (const item of items) {
      await d1Insert(env, table, idFn(item), extraFn ? extraFn(item) : undefined, item, now)
    }
  }

  await insert('players', data.players, p => p.id, p => ({ name: p.name || '' }))
  await insert('npcs', data.npcs, n => n.id, n => ({ name: n.name || '' }))
  await insert('maps', data.maps, m => m.id, m => ({ name: m.name || '' }))
  await insert('map_pins', data.mapPins, p => p.id, p => ({ map_id: p.mapId || null }))
  await insert('questionnaires', data.questionnaires, q => q.id, q => ({ name: q.title || q.name || '' }))
  await insert('responses', data.responses, r => r.id)

  const dcItems = data.downtimeChronicles || []
  for (const dc of dcItems) {
    await d1Insert(env, 'downtime_chronicles', dc.id, { player_id: dc.playerId || null }, dc, now)
  }

  const notifItems = data.notifications || []
  for (const n of notifItems) {
    await d1Insert(env, 'notifications', n.id, { player_id: n.playerId || null }, n, now)
  }

  // Flatten comments { playerId: [...] }
  const commentEntries = Object.entries(data.comments || {})
  for (const [playerId, arr] of commentEntries) {
    for (const c of arr) {
      await d1Insert(env, 'comments', c.id, { player_id: playerId, timestamp: c.timestamp || now }, c, now)
    }
  }

  const cal = data.calendar || {}
  await insert('calendar_events', cal.events, e => e.id)
  await insert('calendar_state', [cal.state].filter(Boolean), () => 'singleton')

  // Flatten calendar.comments { dateKey: [...] }
  const calCommentEntries = Object.entries(cal.comments || {})
  for (const [dateKey, arr] of calCommentEntries) {
    for (const cc of arr) {
      await d1Insert(env, 'calendar_comments', cc.id, { date_key: dateKey }, cc, now)
    }
  }
}

async function d1HasData(env) {
  try {
    const r = await env.HUNT_DB.prepare('SELECT COUNT(*) as cnt FROM campaign_players').first()
    return r && r.cnt > 0
  } catch { return false }
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
      const users = await getFromKv(env, 'users', [])
      const user = users.find(u => u.id === session.userId)
      if (user && user.playerId !== session.playerId) {
        session.playerId = user.playerId
        await env.HUNT_DATA.put('session:' + sessionToken, JSON.stringify(session), { expirationTtl: 86400 })
      }
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
// PUT /api/auth/users/:id/assign-player (DM only)
const assignPlayerMatch = path.match(/^\/auth\/users\/(.+)\/assign-player$/)
if (assignPlayerMatch && method === 'PUT') {
  if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
  const userId = assignPlayerMatch[1]
  const { playerId } = body
  const users = await getFromKv(env, 'users', [])
  const user = users.find(u => u.id === userId)
  if (!user) return json({ ok: false, error: 'User not found' }, 404)
  user.playerId = playerId || null
  await saveToKv(env, 'users', users)
  return json({ ok: true })
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

    // GET /api/data — full campaign data (assembled from D1 if migrated, otherwise KV)
    if (path === '/data' && method === 'GET') {
      const migrated = await d1HasData(env)
      let data
      if (migrated) {
        data = await assembleCampaignFromD1(env)
      } else {
        data = await getFromKv(env, 'campaign-data', null)
        if (!data) {
          data = { players: [], maps: [], mapPins: [], questionnaires: [], responses: [], comments: {} }
        } else if (data.campaign && !data.players) {
          data = data.campaign
          await saveToKv(env, 'campaign-data', data)
        }
      }
      return json({ ok: true, ...data })
    }

    // POST /api/data — save full campaign data (dual-write: D1 + KV)
    if (path === '/data' && method === 'POST') {
      const apiKey = request.headers.get('X-API-Key')
      const authorized = (session && (session.role === 'dm' || session.role === 'player')) || (apiKey && apiKey === env.API_KEY)
      if (!authorized) return json({ ok: false, error: 'Unauthorized' }, 401)
      const toSave = (body.campaign && !body.players) ? body.campaign : body

      const hasRealContent =
        (toSave.players && toSave.players.length > 0) ||
        (toSave.npcs && toSave.npcs.length > 0) ||
        (toSave.maps && toSave.maps.length > 0) ||
        (toSave.mapPins && toSave.mapPins.length > 0) ||
        (toSave.questionnaires && toSave.questionnaires.length > 0) ||
        (toSave.responses && toSave.responses.length > 0) ||
        (toSave.downtimeChronicles && toSave.downtimeChronicles.length > 0) ||
        (toSave.notifications && toSave.notifications.length > 0) ||
        (toSave.comments && Object.keys(toSave.comments).length > 0)

      if (!hasRealContent) {
        const existing = await getFromKv(env, 'campaign-data', null)
        const hasExisting =
          existing && (
            (existing.players && existing.players.length > 0) ||
            (existing.npcs && existing.npcs.length > 0) ||
            (existing.maps && existing.maps.length > 0) ||
            (existing.mapPins && existing.mapPins.length > 0) ||
            (existing.questionnaires && existing.questionnaires.length > 0) ||
            (existing.responses && existing.responses.length > 0) ||
            (existing.downtimeChronicles && existing.downtimeChronicles.length > 0) ||
            (existing.notifications && existing.notifications.length > 0) ||
            (existing.comments && Object.keys(existing.comments).length > 0)
          )
        if (hasExisting) {
          return json({ ok: false, error: 'Refusing to overwrite existing campaign data with empty payload' }, 409)
        }
      }

      // Write to D1 (if tables exist and have players) and KV
      await writeBlobToD1(env, toSave)
      await saveToKv(env, 'campaign-data', toSave)
      return json({ ok: true })
    }

    // ─── ADMIN: MIGRATE KV → D1 ─────────────────────────────────
    if (path === '/admin/migrate-to-d1' && method === 'POST') {
      const apiKey = request.headers.get('X-API-Key')
      if (!apiKey || apiKey !== env.API_KEY) return json({ ok: false, error: 'Unauthorized' }, 401)
      const blob = await getFromKv(env, 'campaign-data', null)
      if (!blob) return json({ ok: false, error: 'No campaign data found in KV' }, 404)
      await writeBlobToD1(env, blob)
      return json({ ok: true, message: 'Migration complete' })
    }

    // ─── GRANULAR CRUD: PLAYERS ────────────────────────────────
    const pCreateMatch = path === '/players' && method === 'POST'
    if (pCreateMatch) {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const p = body
      if (!p.id) { p.id = 'player-' + Date.now(); p.createdAt = Date.now() }
      await d1Insert(env, 'players', p.id, { name: p.name || '' }, p, Date.now())
      return json({ ok: true, player: p })
    }

    const pMatch = path.match(/^\/players\/(.+)$/)
    if (pMatch && method === 'GET') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const rows = await d1Rows(env, 'players', `WHERE id = '${pMatch[1].replace(/'/g,"''")}'`)
      return json({ ok: true, player: rows[0] || null })
    }
    if (pMatch && method === 'PUT') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const p = { ...body, id: pMatch[1] }
      await d1Insert(env, 'players', p.id, { name: p.name || '' }, p, Date.now())
      return json({ ok: true, player: p })
    }
    if (pMatch && method === 'DELETE') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      await d1Delete(env, 'players', pMatch[1])
      return json({ ok: true })
    }

    // ─── GRANULAR CRUD: NPCS ───────────────────────────────────
    const nCreateMatch = path === '/npcs' && method === 'POST'
    if (nCreateMatch) {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const n = body
      if (!n.id) { n.id = 'npc-' + Date.now(); n.createdAt = Date.now() }
      await d1Insert(env, 'npcs', n.id, { name: n.name || '' }, n, Date.now())
      return json({ ok: true, npc: n })
    }

    const nMatch = path.match(/^\/npcs\/(.+)$/)
    if (nMatch && method === 'GET') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const rows = await d1Rows(env, 'npcs', `WHERE id = '${nMatch[1].replace(/'/g,"''")}'`)
      return json({ ok: true, npc: rows[0] || null })
    }
    if (nMatch && method === 'PUT') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const n = { ...body, id: nMatch[1] }
      await d1Insert(env, 'npcs', n.id, { name: n.name || '' }, n, Date.now())
      return json({ ok: true, npc: n })
    }
    if (nMatch && method === 'DELETE') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      await d1Delete(env, 'npcs', nMatch[1])
      // Also delete npc's comment bucket
      const commentRows = await env.HUNT_DB.prepare(
        `SELECT id FROM campaign_comments WHERE player_id = ?`).bind(nMatch[1]).all()
      for (const r of (commentRows.results || [])) {
        await d1Delete(env, 'comments', r.id)
      }
      return json({ ok: true })
    }

    // ─── GRANULAR CRUD: MAPS ───────────────────────────────────
    const mapCreateMatch = path === '/maps' && method === 'POST'
    if (mapCreateMatch) {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const m = body
      if (!m.id) { m.id = 'map-' + Date.now() }
      await d1Insert(env, 'maps', m.id, { name: m.name || '' }, m, Date.now())
      return json({ ok: true, map: m })
    }

    const mapMatch = path.match(/^\/maps\/(.+)$/)
    if (mapMatch && method === 'GET') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const rows = await d1Rows(env, 'maps', `WHERE id = '${mapMatch[1].replace(/'/g,"''")}'`)
      return json({ ok: true, map: rows[0] || null })
    }
    if (mapMatch && method === 'PUT') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const m = { ...body, id: mapMatch[1] }
      await d1Insert(env, 'maps', m.id, { name: m.name || '' }, m, Date.now())
      return json({ ok: true, map: m })
    }
    if (mapMatch && method === 'DELETE') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      await d1Delete(env, 'maps', mapMatch[1])
      // Cascade: delete pins for this map
      const pinRows = await env.HUNT_DB.prepare(
        `SELECT id FROM campaign_map_pins WHERE map_id = ?`).bind(mapMatch[1]).all()
      for (const r of (pinRows.results || [])) {
        await d1Delete(env, 'map_pins', r.id)
      }
      return json({ ok: true })
    }

    // ─── GRANULAR CRUD: MAP PINS ───────────────────────────────
    const pinCreateMatch = path === '/pins' && method === 'POST'
    if (pinCreateMatch) {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const p = body
      if (!p.id) { p.id = 'pin-' + Date.now(); p.timestamp = Date.now() }
      await d1Insert(env, 'map_pins', p.id, { map_id: p.mapId || null }, p, Date.now())
      return json({ ok: true, pin: p })
    }

    const pinMatch = path.match(/^\/pins\/(.+)$/)
    if (pinMatch && method === 'GET') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const rows = await d1Rows(env, 'map_pins', `WHERE id = '${pinMatch[1].replace(/'/g,"''")}'`)
      return json({ ok: true, pin: rows[0] || null })
    }
    if (pinMatch && method === 'PUT') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const p = { ...body, id: pinMatch[1] }
      await d1Insert(env, 'map_pins', p.id, { map_id: p.mapId || null }, p, Date.now())
      return json({ ok: true, pin: p })
    }
    if (pinMatch && method === 'DELETE') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      await d1Delete(env, 'map_pins', pinMatch[1])
      return json({ ok: true })
    }

    // ─── GRANULAR CRUD: QUESTIONNAIRES ─────────────────────────
    if (path === '/questionnaires' && method === 'POST') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      const q = body
      if (!q.id) { q.id = 'q-' + Date.now(); q.createdAt = Date.now() }
      await d1Insert(env, 'questionnaires', q.id, { name: q.title || q.name || '' }, q, Date.now())
      return json({ ok: true, questionnaire: q })
    }

    const qMatch = path.match(/^\/questionnaires\/(.+)$/)
    if (qMatch && method === 'PUT') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      const q = { ...body, id: qMatch[1] }
      await d1Insert(env, 'questionnaires', q.id, { name: q.title || q.name || '' }, q, Date.now())
      return json({ ok: true, questionnaire: q })
    }
    if (qMatch && method === 'DELETE') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      await d1Delete(env, 'questionnaires', qMatch[1])
      return json({ ok: true })
    }

    // ─── GRANULAR CRUD: RESPONSES ──────────────────────────────
    if (path === '/responses' && method === 'POST') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const r = body
      r.id = 'r-' + Date.now()
      r.submittedAt = Date.now()
      await d1Insert(env, 'responses', r.id, {}, r, Date.now())
      return json({ ok: true, response: r })
    }

    // ─── GRANULAR CRUD: DOWNTIME CHRONICLES ───────────────────
    if (path === '/downtime-chronicles' && method === 'POST') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      const dc = body
      const now = Date.now()
      if (!dc.id) { dc.id = 'dc-' + now + '-' + Math.random().toString(36).slice(2, 6); dc.openedAt = now }
      dc.updatedAt = now
      await d1Insert(env, 'downtime_chronicles', dc.id, { player_id: dc.playerId || null }, dc, now)
      return json({ ok: true, chronicle: dc })
    }

    // POST /downtime-chronicles/batch — open for multiple players
    if (path === '/downtime-chronicles/batch' && method === 'POST') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      const { playerIds, dmNotes } = body
      if (!playerIds || !playerIds.length) return json({ ok: false, error: 'playerIds required' }, 400)
      const now = Date.now()
      const created = []
      for (const pid of playerIds) {
        const existing = await env.HUNT_DB.prepare(
          `SELECT data FROM campaign_downtime_chronicles WHERE player_id = ? LIMIT 1`
        ).bind(pid).first()
        if (existing) {
          const dc = JSON.parse(existing.data)
          dc.status = 'pending'
          dc.dmNotes = dmNotes || ''
          dc.updatedAt = now
          await d1Insert(env, 'downtime_chronicles', dc.id, { player_id: pid }, dc, now)
          created.push(dc)
        } else {
          const dc = {
            id: 'dc-' + now + '-' + Math.random().toString(36).slice(2, 6),
            playerId: pid,
            status: 'pending',
            dmNotes: dmNotes || '',
            openedAt: now,
            submittedAt: null,
            updatedAt: now,
            data: {
              name: '',
              years: Array.from({ length: 5 }, () => ({
                objectives: ['', '', ''],
                events: Array.from({ length: 5 }, () => ({ name: '', memory: '' })),
                scars: ['', ''],
              })),
              relationships: { romantic: { name: '', desc: '' }, work: { name: '', desc: '' }, friend: { name: '', desc: '' } },
              factions: [{ name: '', note: '' }, { name: '', note: '' }, { name: '', note: '' }],
              party: Array.from({ length: 5 }, () => ({ name: '', note: '' })),
              hobby: '',
              memories: ['', '', ''],
              threads: ['', ''],
            },
          }
          await d1Insert(env, 'downtime_chronicles', dc.id, { player_id: pid }, dc, now)
          created.push(dc)
        }
      }
      return json({ ok: true, chronicles: created })
    }

    // PUT /downtime-chronicles/:id — update
    const dcMatch = path.match(/^\/downtime-chronicles\/([^/]+)$/)
    if (dcMatch && method === 'PUT') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const dc = { ...body, id: dcMatch[1], updatedAt: Date.now() }
      await d1Insert(env, 'downtime_chronicles', dc.id, { player_id: dc.playerId || null }, dc, Date.now())
      return json({ ok: true, chronicle: dc })
    }

    // PUT /downtime-chronicles/:id/close
    const dcCloseMatch = path.match(/^\/downtime-chronicles\/([^/]+)\/close$/)
    if (dcCloseMatch && method === 'PUT') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      const existing = await env.HUNT_DB.prepare(
        `SELECT data FROM campaign_downtime_chronicles WHERE id = ?`
      ).bind(dcCloseMatch[1]).first()
      if (!existing) return json({ ok: false, error: 'Not found' }, 404)
      const dc = JSON.parse(existing.data)
      dc.status = 'closed'
      dc.updatedAt = Date.now()
      await d1Insert(env, 'downtime_chronicles', dc.id, { player_id: dc.playerId || null }, dc, Date.now())
      return json({ ok: true, chronicle: dc })
    }

    // ─── GRANULAR CRUD: NOTIFICATIONS ──────────────────────────
    if (path === '/notifications' && method === 'POST') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const n = {
        id: 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        ...body,
        read: false,
        createdAt: Date.now(),
      }
      await d1Insert(env, 'notifications', n.id, { player_id: n.playerId || null }, n, Date.now())
      return json({ ok: true, notification: n })
    }

    // PUT /notifications/read-all
    if (path === '/notifications/read-all' && method === 'PUT') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const rows = await env.HUNT_DB.prepare(
        `SELECT id, data FROM campaign_notifications WHERE player_id = ?`
      ).bind(session.playerId || '').all()
      const now = Date.now()
      for (const r of (rows.results || [])) {
        const n = JSON.parse(r.data)
        n.read = true
        n.readAt = now
        await d1Insert(env, 'notifications', n.id, { player_id: n.playerId || null }, n, now)
      }
      return json({ ok: true })
    }

    const notifMatch = path.match(/^\/notifications\/([^/]+)$/)
    if (notifMatch && method === 'PUT') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const n = { ...body, id: notifMatch[1] }
      await d1Insert(env, 'notifications', n.id, { player_id: n.playerId || null }, n, Date.now())
      return json({ ok: true, notification: n })
    }
    if (notifMatch && method === 'DELETE') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      await d1Delete(env, 'notifications', notifMatch[1])
      return json({ ok: true })
    }

    // DELETE /notifications — clear all
    if (path === '/notifications' && method === 'DELETE') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      if (session.playerId) {
        await env.HUNT_DB.prepare(
          `DELETE FROM campaign_notifications WHERE player_id = ?`
        ).bind(session.playerId).run()
      }
      return json({ ok: true })
    }

    // ─── GRANULAR CRUD: COMMENTS ───────────────────────────────
    if (path === '/comments' && method === 'POST') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const c = {
        id: 'c-' + Date.now(),
        ...body,
        timestamp: Date.now(),
      }
      const pid = c.playerId
      if (!pid) return json({ ok: false, error: 'playerId required' }, 400)
      await d1Insert(env, 'comments', c.id, { player_id: pid, timestamp: c.timestamp }, c, Date.now())
      return json({ ok: true, comment: c })
    }

    const cMatch = path.match(/^\/comments\/(.+)$/)
    if (cMatch && method === 'DELETE') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      await d1Delete(env, 'comments', cMatch[1])
      return json({ ok: true })
    }

    // ─── GRANULAR CRUD: CALENDAR STATE ─────────────────────────
    if (path === '/calendar/state' && method === 'GET') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const row = await env.HUNT_DB.prepare(
        `SELECT data FROM campaign_calendar_state WHERE id = 'singleton'`
      ).first()
      return json({ ok: true, state: row ? JSON.parse(row.data) : { year: 3102, month: 0, day: 1 } })
    }
    if (path === '/calendar/state' && method === 'PUT') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      await d1Insert(env, 'calendar_state', 'singleton', {}, body, Date.now())
      return json({ ok: true })
    }

    // ─── GRANULAR CRUD: CALENDAR EVENTS ───────────────────────
    if (path === '/calendar/events' && method === 'POST') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const e = body
      if (!e.id) e.id = 'evt-' + Date.now()
      await d1Insert(env, 'calendar_events', e.id, {}, e, Date.now())
      return json({ ok: true, event: e })
    }

    const ceMatch = path.match(/^\/calendar\/events\/(.+)$/)
    if (ceMatch && method === 'DELETE') {
      if (!session || session.role !== 'dm') return json({ ok: false, error: 'Unauthorized' }, 403)
      await d1Delete(env, 'calendar_events', ceMatch[1])
      return json({ ok: true })
    }

    // ─── GRANULAR CRUD: CALENDAR COMMENTS ─────────────────────
    if (path === '/calendar/comments' && method === 'POST') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      const cc = {
        id: 'cc-' + Date.now(),
        ...body,
        timestamp: Date.now(),
      }
      const dateKey = cc.dateKey || (cc.year !== undefined ? `${cc.year}-${cc.month}-${cc.day}` : `${cc.month}-${cc.day}`)
      if (!dateKey) return json({ ok: false, error: 'dateKey or month+day required' }, 400)
      await d1Insert(env, 'calendar_comments', cc.id, { date_key: dateKey }, cc, Date.now())
      return json({ ok: true, comment: cc })
    }

    const ccMatch = path.match(/^\/calendar\/comments\/(.+)$/)
    if (ccMatch && method === 'DELETE') {
      if (!session) return json({ ok: false, error: 'Unauthorized' }, 401)
      await d1Delete(env, 'calendar_comments', ccMatch[1])
      return json({ ok: true })
    }

    return json({ ok: false, error: 'Not found' }, 404)
  } catch (e) {
    return json({ ok: false, error: e.message || 'Internal error' }, 500)
  }
}
