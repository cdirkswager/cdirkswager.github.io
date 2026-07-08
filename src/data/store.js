import api from './api'
import calendarSeed from '../../data/calendar-3101.json'

export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter']

const defaultData = {
  players: [],
  npcs: [],
  maps: [],
  mapPins: [],
  questionnaires: [],
  responses: [],
  downtimeChronicles: [],
  notifications: [],
  comments: {},
  calendar: {
    events: [],
    state: { year: 3102, month: 0, day: 1 },
    comments: {},
  },
}

let dataCache = null

async function fallbackSave() {
  if (dataCache) {
    const res = await api('/data', { method: 'POST', body: dataCache })
    if (!res.ok) console.warn('fallback save failed:', res.error)
  }
}

function hasContent(data) {
  if (!data) return false
  return (
    (data.players && data.players.length > 0) ||
    (data.npcs && data.npcs.length > 0) ||
    (data.maps && data.maps.length > 0) ||
    (data.mapPins && data.mapPins.length > 0) ||
    (data.questionnaires && data.questionnaires.length > 0) ||
    (data.responses && data.responses.length > 0) ||
    (data.downtimeChronicles && data.downtimeChronicles.length > 0) ||
    (data.notifications && data.notifications.length > 0) ||
    (data.comments && Object.keys(data.comments).length > 0)
    // intentionally exclude calendar.events — build-time seed data should never
    // trick the guard into treating empty payloads as having real content
  )
}

function migrateData(data) {
  if (!data) return data
  if (!data.npcs) data.npcs = []
  if (!data.maps) {
    data.maps = [
      { id: 'map-1', name: 'The Realm', imageUrl: '', year: 1, season: 0 },
    ]
    data.mapPins = (data.mapPins || []).map(pin => {
      if (!pin.mapId) pin.mapId = 'map-1'
      return pin
    })
  } else {
    data.maps = data.maps.map((m, i) => {
      const migrated = { ...m }
      if (migrated.year === undefined || typeof migrated.year === 'string') {
        migrated.year = 0
      }
      if (migrated.season === undefined) {
        migrated.season = i
      }
      return migrated
    })
  }
  if (!data.calendar) {
    data.calendar = { ...defaultData.calendar }
  }
  if (!data.calendar.state) {
    data.calendar.state = { year: 3102, month: 0, day: 1 }
  }
  if (!data.calendar.comments) {
    data.calendar.comments = {}
  }
  return data
}

function getStore() {
  if (!dataCache) {
    dataCache = { ...defaultData, players: [], maps: [], mapPins: [], questionnaires: [], responses: [], comments: {}, calendar: { ...defaultData.calendar } }
  }
  return dataCache
}

async function saveData(data, force = false) {
  dataCache = migrateData(data)
  if (!force && !hasContent(dataCache)) {
    console.warn('saveData: skipping save of empty/default data to preserve server state')
    return
  }
  const res = await api('/data', { method: 'POST', body: dataCache })
  if (!res.ok) console.warn('Failed to save to server:', res.error)
}

async function loadFromServer() {
  const res = await api('/data')
  if (res && res.players) {
    if (hasContent(res) || !dataCache || !hasContent(dataCache)) {
      dataCache = migrateData(res)
    } else {
      console.warn('loadFromServer: server returned empty data, preserving existing cache')
    }
  } else {
    if (!dataCache || !hasContent(dataCache)) {
      dataCache = migrateData({ ...defaultData })
    } else {
      console.warn('loadFromServer: request failed, preserving existing cache')
    }
  }
  return dataCache
}

export async function initStore() {
  await loadFromServer()
  // Only seed calendar if the cache has genuine user content — prevents
  // seed events from being injected into an empty cache after a failed load,
  // which would otherwise defeat the hasContent guard and allow empty-data saves
  if (hasContent(dataCache)) {
    initCalendar()
  }
  return dataCache
}

export function sanitizeHtml(str) {
  const maxLen = 100000
  if (!str) return ''
  if (str.length > maxLen) str = str.slice(0, maxLen)
  str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  str = str.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  str = str.replace(/javascript\s*:/gi, 'noop:')
  str = str.replace(/<\/?(?:iframe|object|embed|applet|base|form|input|select|textarea|button|meta|link)\b[^>]*>/gi, '')
  return str
}

export function sanitizeCss(str) {
  const maxLen = 100000
  if (!str) return ''
  if (str.length > maxLen) str = str.slice(0, maxLen)
  str = str.replace(/@import\s+/gi, '@invalid-import ')
  str = str.replace(/behavior\s*:/gi, 'invalid-behavior:')
  str = str.replace(/expression\s*\(/gi, 'invalid-expression(')
  return str
}

function escapeHtml(str) {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

export function generatePageSource(player) {
  if (!player) return { html: '', css: '' }
  const t = player.theme || {}
  const w = player.widgets || []
  const anims = player.widgetAnimations || {}
  const isTwoCol = player.layout === 'two-column'

  const css = `
:root {
  --bg: ${t.bgColor || '#0d0d0d'};
  --text: ${t.textColor || '#e0d5c1'};
  --accent: ${t.accentColor || '#c9a84c'};
  --font: ${t.fontFamily || 'IM Fell English, serif'};
}

body {
  margin: 0;
  padding: 20px;
  background: ${t.bgColor || '#0d0d0d'}${t.bgImage ? ` url(${t.bgImage})` : ''};
  background-size: cover;
  background-position: center;
  color: ${t.textColor || '#e0d5c1'};
  font-family: ${t.fontFamily || 'IM Fell English, serif'};
  min-height: 100vh;
}

.page-header {
  text-align: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.char-name {
  font-size: 2rem;
  font-weight: 700;
  color: var(--accent);
  margin: 0 0 4px;
}

.char-title {
  font-size: 1rem;
  color: var(--accent);
  opacity: 0.8;
  margin: 0 0 8px;
}

.char-class {
  font-size: 0.85rem;
  color: var(--text);
  opacity: 0.7;
  margin: 0;
}

.widget-section {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.widget-title {
  font-family: var(--font);
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent);
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.stat-item {
  text-align: center;
  padding: 10px 8px;
  background: rgba(0,0,0,0.2);
  border-radius: 6px;
}

.stat-label {
  display: block;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text);
  opacity: 0.6;
  margin-bottom: 4px;
}

.stat-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent);
}

img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

p { line-height: 1.6; margin: 0 0 8px; }

${isTwoCol ? `
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 600px) {
  .two-col { grid-template-columns: 1fr; }
}
` : ''}
`.trim()

  const renderWidget = (widget) => {
    const anim = anims[widget.id]
    const animClass = anim ? ` animate__animated animate__${anim}` : ''
    const section = (content) =>
      `<div class="widget-section${animClass}" data-widget-id="${widget.id}" data-type="${widget.type}">${content}</div>`

    if (widget.type === 'stats') {
      let grid = ''
      Object.entries(widget.content || {}).forEach(([stat, val]) => {
        grid += `<div class="stat-item"><span class="stat-label">${escapeHtml(stat.toUpperCase())}</span><span class="stat-value">${escapeHtml(String(val))}</span></div>`
      })
      return section(`<div class="widget-title">📊 Stats</div><div class="stats-grid">${grid}</div>`)
    }
    if (widget.type === 'description') {
      return section(`<div class="widget-title">📜 Description</div><p>${escapeHtml(widget.content)}</p>`)
    }
    if (widget.type === 'bio') {
      return section(`<div class="widget-title">📖 Biography</div><p>${escapeHtml(widget.content)}</p>`)
    }
    if (widget.type === 'image') {
      return section(`<div class="widget-title">🖼️ Image</div>${widget.content ? `<img src="${escapeHtml(widget.content)}" alt="Character image" />` : '<p style="opacity:0.5">No image configured.</p>'}`)
    }
    if (widget.type === 'music') {
      let mc = `<div class="widget-title">🎵 Music</div>`
      if (widget.musicUrl) mc += `<p><em>Audio URL: ${escapeHtml(widget.musicUrl)}</em></p>`
      if (widget.content) mc += `<p>${escapeHtml(widget.content)}</p>`
      if (!widget.musicUrl && !widget.content) mc += '<p style="opacity:0.5">No music configured.</p>'
      return section(mc)
    }
    if (widget.type === 'custom') {
      return section(`${widget.title ? `<div class="widget-title">${escapeHtml(widget.title)}</div>` : ''}<div>${widget.content || ''}</div>`)
    }
    return ''
  }

  const headerHtml = `<div class="page-header"><h1 class="char-name">${escapeHtml(player.name)}</h1>${player.title ? `<p class="char-title">${escapeHtml(player.title)}</p>` : ''}<p class="char-class">${escapeHtml(player.race)} ${escapeHtml(player.class)} &middot; Level ${player.level || 1}</p></div>`

  let bodyHtml
  if (isTwoCol) {
    const left = []
    const right = []
    w.forEach(wgt => {
      if (wgt.column === 'left') left.push(wgt)
      else if (wgt.column === 'right') right.push(wgt)
      else {
        if (left.length <= right.length) left.push(wgt)
        else right.push(wgt)
      }
    })
    bodyHtml = `<div class="two-col"><div>${left.map(renderWidget).join('')}</div><div>${right.map(renderWidget).join('')}</div></div>`
  } else {
    bodyHtml = w.map(renderWidget).join('')
  }

  const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">
<style>
${css}
</style>
</head>
<body>
${headerHtml}
${bodyHtml || '<p style="text-align:center;opacity:0.5">No widgets configured yet.</p>'}
</body>
</html>`

  return { html: htmlDoc, css }
}

export function getPlayers() {
  return getStore().players
}

export function getPlayer(id) {
  return getStore().players.find(p => p.id === id) || null
}

export async function savePlayer(player) {
  const data = getStore()
  const idx = data.players.findIndex(p => p.id === player.id)
  let widgetCounter = Date.now()
  player.widgets = (player.widgets || []).map(w => {
    if (!w.id) w.id = 'wid-' + (widgetCounter++)
    return w
  })
  if (player.layout === undefined) player.layout = 'single'
  if (player.widgetBorder === undefined) player.widgetBorder = 'default'
  if (player.musicUrl === undefined) player.musicUrl = ''
  if (player.commentsEnabled === undefined) player.commentsEnabled = true
  if (player.avatarUrl === undefined) player.avatarUrl = ''
  if (!player.customCode) player.customCode = { enabled: false, html: '', css: '' }
  if (player.customCode.html) player.customCode.html = sanitizeHtml(player.customCode.html)
  if (player.customCode.css) player.customCode.css = sanitizeCss(player.customCode.css)
  if (player.widgetAnimations && typeof Object.keys(player.widgetAnimations)[0] === 'string' && /^\d+$/.test(Object.keys(player.widgetAnimations)[0])) {
    const migrated = {}
    player.widgets.forEach((w, i) => {
      if (player.widgetAnimations[i]) migrated[w.id] = player.widgetAnimations[i]
    })
    player.widgetAnimations = migrated
  }
  if (idx >= 0) {
    data.players[idx] = player
  } else {
    player.id = 'player-' + Date.now()
    player.createdAt = Date.now()
    data.players.push(player)
  }
  const res = idx >= 0
    ? await api('/players/' + player.id, { method: 'PUT', body: player })
    : await api('/players', { method: 'POST', body: player })
  if (!res.ok) await fallbackSave()
  return player
}

export async function deletePlayer(id) {
  const data = getStore()
  data.players = data.players.filter(p => p.id !== id)
  const res = await api('/players/' + id, { method: 'DELETE' })
  if (!res.ok) await fallbackSave()
}

export function getNPCs() {
  return getStore().npcs || []
}

export function getNPC(id) {
  return (getStore().npcs || []).find(n => n.id === id) || null
}

export function getCharacter(id) {
  const data = getStore()
  return data.players.find(p => p.id === id) || (data.npcs || []).find(n => n.id === id) || null
}

export function getAllCharacters() {
  const data = getStore()
  return [...(data.players || []), ...(data.npcs || [])]
}

export async function saveNPC(npc) {
  const data = getStore()
  if (!data.npcs) data.npcs = []
  const idx = data.npcs.findIndex(n => n.id === npc.id)
  let widgetCounter = Date.now()
  npc.widgets = (npc.widgets || []).map(w => {
    if (!w.id) w.id = 'wid-' + (widgetCounter++)
    return w
  })
  if (npc.layout === undefined) npc.layout = 'single'
  if (npc.musicUrl === undefined) npc.musicUrl = ''
  if (npc.commentsEnabled === undefined) npc.commentsEnabled = true
  if (npc.avatarUrl === undefined) npc.avatarUrl = ''
  if (!npc.customCode) npc.customCode = { enabled: false, html: '', css: '' }
  if (npc.customCode.html) npc.customCode.html = sanitizeHtml(npc.customCode.html)
  if (npc.customCode.css) npc.customCode.css = sanitizeCss(npc.customCode.css)
  if (npc.widgetAnimations && typeof Object.keys(npc.widgetAnimations)[0] === 'string' && /^\d+$/.test(Object.keys(npc.widgetAnimations)[0])) {
    const migrated = {}
    npc.widgets.forEach((w, i) => {
      if (npc.widgetAnimations[i]) migrated[w.id] = npc.widgetAnimations[i]
    })
    npc.widgetAnimations = migrated
  }
  if (idx >= 0) {
    data.npcs[idx] = npc
  } else {
    npc.id = 'npc-' + Date.now()
    npc.createdAt = Date.now()
    data.npcs.push(npc)
  }
  const res = idx >= 0
    ? await api('/npcs/' + npc.id, { method: 'PUT', body: npc })
    : await api('/npcs', { method: 'POST', body: npc })
  if (!res.ok) await fallbackSave()
  return npc
}

export async function deleteNPC(id) {
  const data = getStore()
  if (data.npcs) data.npcs = data.npcs.filter(n => n.id !== id)
  if (data.comments) delete data.comments[id]
  const res = await api('/npcs/' + id, { method: 'DELETE' })
  if (!res.ok) await fallbackSave()
}

export function getMaps() {
  return getStore().maps
}

export function getSortedMaps() {
  const data = getStore()
  return [...data.maps].sort((a, b) => {
    const ya = a.year ?? 0
    const yb = b.year ?? 0
    if (ya !== yb) return ya - yb
    return (a.season ?? 0) - (b.season ?? 0)
  })
}

export function getYears() {
  const data = getStore()
  const groups = {}
  data.maps.forEach(m => {
    const y = m.year ?? 0
    if (!groups[y]) groups[y] = []
    groups[y].push(m)
  })
  return Object.entries(groups)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, maps]) => ({
      year: Number(year),
      seasons: maps.sort((a, b) => (a.season ?? 0) - (b.season ?? 0)),
    }))
}

export async function addYear(startYear) {
  const data = getStore()
  let newYear
  if (startYear !== undefined) {
    newYear = startYear
  } else {
    newYear = Math.max(data.maps.reduce((max, m) => Math.max(max, m.year ?? 0), 0) + 1, 1)
  }
  for (let i = 0; i < SEASON_NAMES.length; i++) {
    const map = { name: SEASON_NAMES[i], imageUrl: '', year: newYear, season: i }
    await saveMap(map)
  }
  return newYear
}

export async function deleteYear(year) {
  const data = getStore()
  const idsToDelete = data.maps.filter(m => m.year === year).map(m => m.id)
  for (const id of idsToDelete) {
    await deleteMap(id)
  }
}

export async function saveMap(map) {
  const data = getStore()
  const isUpdate = !!map.id
  if (map.id) {
    const idx = data.maps.findIndex(m => m.id === map.id)
    if (idx >= 0) data.maps[idx] = map
  } else {
    map.id = 'map-' + Date.now()
    if (map.year === undefined) map.year = 0
    if (map.season === undefined) map.season = data.maps.filter(m => m.year === map.year).length
    data.maps.push(map)
  }
  const res = isUpdate
    ? await api('/maps/' + map.id, { method: 'PUT', body: map })
    : await api('/maps', { method: 'POST', body: map })
  if (!res.ok) await fallbackSave()
  return map
}

export async function deleteMap(id) {
  const data = getStore()
  data.maps = data.maps.filter(m => m.id !== id)
  data.mapPins = data.mapPins.filter(p => p.mapId !== id)
  const res = await api('/maps/' + id, { method: 'DELETE' })
  if (!res.ok) await fallbackSave()
}

export function getMapPins(mapId) {
  const pins = getStore().mapPins
  if (mapId) return pins.filter(p => p.mapId === mapId)
  return pins
}

export async function saveMapPin(pin) {
  const data = getStore()
  const isUpdate = !!pin.id
  if (pin.id) {
    const idx = data.mapPins.findIndex(p => p.id === pin.id)
    if (idx >= 0) data.mapPins[idx] = pin
  } else {
    pin.id = 'pin-' + Date.now()
    pin.timestamp = Date.now()
    data.mapPins.push(pin)
  }
  const res = isUpdate
    ? await api('/pins/' + pin.id, { method: 'PUT', body: pin })
    : await api('/pins', { method: 'POST', body: pin })
  if (!res.ok) await fallbackSave()
  return pin
}

export async function deleteMapPin(id) {
  const data = getStore()
  data.mapPins = data.mapPins.filter(p => p.id !== id)
  const res = await api('/pins/' + id, { method: 'DELETE' })
  if (!res.ok) await fallbackSave()
}

export function getQuestionnaires() {
  return getStore().questionnaires
}

export function getQuestionnaire(id) {
  return getStore().questionnaires.find(q => q.id === id) || null
}

export async function saveQuestionnaire(q) {
  const data = getStore()
  const isUpdate = !!q.id
  if (q.id) {
    const idx = data.questionnaires.findIndex(x => x.id === q.id)
    if (idx >= 0) data.questionnaires[idx] = q
  } else {
    q.id = 'q-' + Date.now()
    q.createdAt = Date.now()
    data.questionnaires.push(q)
  }
  const res = isUpdate
    ? await api('/questionnaires/' + q.id, { method: 'PUT', body: q })
    : await api('/questionnaires', { method: 'POST', body: q })
  if (!res.ok) await fallbackSave()
  return q
}

export async function deleteQuestionnaire(id) {
  const data = getStore()
  data.questionnaires = data.questionnaires.filter(q => q.id !== id)
  const res = await api('/questionnaires/' + id, { method: 'DELETE' })
  if (!res.ok) await fallbackSave()
}

/* ── DOWNTIME CHRONICLES ── */

export function getDowntimeChronicle(playerId) {
  const data = getStore()
  return (data.downtimeChronicles || []).find(c => c.playerId === playerId) || null
}

export function getAllDowntimeChronicles() {
  return getStore().downtimeChronicles || []
}

export async function saveDowntimeChronicle(chronicle) {
  const data = getStore()
  if (!data.downtimeChronicles) data.downtimeChronicles = []
  const existing = data.downtimeChronicles.find(c => c.id === chronicle.id)
  chronicle.updatedAt = Date.now()
  if (existing) {
    Object.assign(existing, chronicle)
  } else {
    chronicle.id = 'dc-' + Date.now()
    data.downtimeChronicles.push(chronicle)
  }
  const res = await api('/downtime-chronicles/' + chronicle.id, { method: 'PUT', body: chronicle })
  if (!res.ok) await fallbackSave()
  return chronicle
}

export async function openDowntimeChronicle(playerIds, dmNotes = '') {
  const data = getStore()
  if (!data.downtimeChronicles) data.downtimeChronicles = []
  if (!data.notifications) data.notifications = []
  const now = Date.now()
  const created = []
  for (const playerId of playerIds) {
    const existing = data.downtimeChronicles.find(c => c.playerId === playerId)
    if (existing) {
      const wasClosed = existing.status === 'closed' || existing.status === 'submitted'
      existing.status = 'pending'
      existing.dmNotes = dmNotes
      existing.updatedAt = now
      created.push(existing)
      if (wasClosed) {
        data.notifications.push({
          id: 'n-' + now + '-' + Math.random().toString(36).slice(2, 6),
          playerId,
          type: 'downtime',
          title: '📜 Downtime Chronicle reopened',
          message: dmNotes || 'Your downtime chronicle has been reopened. The DM would like you to revisit it.',
          link: `/player/${playerId}/downtime`,
          read: false,
          createdAt: Date.now(),
        })
      }
    } else {
      const chronicle = {
        id: 'dc-' + now + '-' + Math.random().toString(36).slice(2, 6),
        playerId,
        status: 'pending',
        dmNotes,
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
      data.downtimeChronicles.push(chronicle)
      created.push(chronicle)
      const p = data.players.find(pl => pl.id === playerId)
      data.notifications.push({
        id: 'n-' + now + '-' + Math.random().toString(36).slice(2, 6),
        playerId,
        type: 'downtime',
        title: '📜 Downtime Chronicle is open',
        message: dmNotes || 'The DM has opened the four-year downtime chronicle for your character.',
        link: `/player/${playerId}/downtime`,
        read: false,
        createdAt: Date.now(),
      })
    }
  }
  const res = await api('/downtime-chronicles/batch', { method: 'POST', body: { playerIds, dmNotes } })
  if (!res.ok) await fallbackSave()
  return created
}

export async function closeDowntimeChronicle(playerId) {
  const data = getStore()
  if (!data.downtimeChronicles) return null
  const idx = data.downtimeChronicles.findIndex(c => c.playerId === playerId)
  if (idx >= 0) {
    data.downtimeChronicles[idx].status = 'closed'
    data.downtimeChronicles[idx].updatedAt = Date.now()
    const res = await api('/downtime-chronicles/' + data.downtimeChronicles[idx].id + '/close', { method: 'PUT' })
    if (!res.ok) await fallbackSave()
    return data.downtimeChronicles[idx]
  }
  return null
}

export async function saveResponse(response) {
  const data = getStore()
  response.id = 'r-' + Date.now()
  response.submittedAt = Date.now()
  data.responses.push(response)
  const res = await api('/responses', { method: 'POST', body: response })
  if (!res.ok) await fallbackSave()
  return response
}

export function getResponses(questionnaireId) {
  const data = getStore()
  return data.responses.filter(r => r.questionnaireId === questionnaireId)
}

export function getAllResponses() {
  return getStore().responses || []
}

/* ── NOTIFICATIONS ── */

export function getNotifications(playerId, unreadOnly = true) {
  const data = getStore()
  const all = (data.notifications || []).filter(n => n.playerId === playerId)
  return unreadOnly ? all.filter(n => !n.read) : all
}

export function getUnreadNotificationCount(playerId) {
  return getNotifications(playerId, true).length
}

export async function createNotification(notif) {
  const data = getStore()
  if (!data.notifications) data.notifications = []
  const n = {
    id: 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    ...notif,
    read: false,
    createdAt: Date.now(),
  }
  data.notifications.push(n)
  const res = await api('/notifications', { method: 'POST', body: n })
  if (!res.ok) await fallbackSave()
  return n
}

export async function markNotificationRead(notifId) {
  const data = getStore()
  const n = (data.notifications || []).find(x => x.id === notifId)
  if (n) {
    n.read = true
    n.readAt = Date.now()
    const res = await api('/notifications/' + notifId, { method: 'PUT', body: n })
    if (!res.ok) await fallbackSave()
  }
  return n
}

export async function markAllNotificationsRead(playerId) {
  const data = getStore()
  let changed = false
  ;(data.notifications || []).forEach(n => {
    if (n.playerId === playerId && !n.read) {
      n.read = true
      n.readAt = Date.now()
      changed = true
    }
  })
  if (changed) {
    const res = await api('/notifications/read-all', { method: 'PUT' })
    if (!res.ok) await fallbackSave()
  }
}

export async function deleteNotification(notifId) {
  const data = getStore()
  data.notifications = (data.notifications || []).filter(n => n.id !== notifId)
  const res = await api('/notifications/' + notifId, { method: 'DELETE' })
  if (!res.ok) await fallbackSave()
}

export async function clearAllNotifications() {
  const data = getStore()
  data.notifications = []
  const res = await api('/notifications', { method: 'DELETE' })
  if (!res.ok) await fallbackSave()
}

export function getComments(playerId) {
  const data = getStore()
  return data.comments?.[playerId] || []
}

export async function addComment(playerId, author, text, authorId) {
  const data = getStore()
  if (!data.comments) data.comments = {}
  if (!data.comments[playerId]) data.comments[playerId] = []
  const comment = {
    id: 'c-' + Date.now(),
    author,
    text,
    timestamp: Date.now(),
    playerId,
  }
  if (authorId) comment.authorId = authorId
  data.comments[playerId].push(comment)
  const res = await api('/comments', { method: 'POST', body: comment })
  if (!res.ok) await fallbackSave()

  // Notify the page owner if someone else commented
  if (authorId && authorId !== playerId && playerId) {
    const p = getPlayer(playerId) || getNPC(playerId)
    if (p) {
      const notif = {
        playerId,
        type: 'comment',
        title: `New message from ${author}`,
        message: text.length > 120 ? text.slice(0, 120) + '...' : text,
        link: `/player/${playerId}`,
      }
      await createNotification(notif)
    }
  }

  return comment
}

export async function deleteComment(commentId, playerId) {
  const data = getStore()
  if (!data.comments?.[playerId]) return
  data.comments[playerId] = data.comments[playerId].filter(c => c.id !== commentId)
  const res = await api('/comments/' + commentId, { method: 'DELETE' })
  if (!res.ok) await fallbackSave()
}

export function getAllComments() {
  const data = getStore()
  const all = []
  if (data.comments) {
    Object.values(data.comments).forEach(arr => {
      arr.forEach(c => all.push(c))
    })
  }
  return all.sort((a, b) => b.timestamp - a.timestamp)
}

// ─── CALENDAR ───────────────────────────────────────────────

export function initCalendar() {
  const data = getStore()
  if (!data.calendar) data.calendar = { ...defaultData.calendar }
  if (calendarSeed?.events && (!data.calendar.events || data.calendar.events.length === 0)) {
    data.calendar.events = calendarSeed.events
  }
  return data.calendar
}

export function getCalendarData() {
  const data = getStore()
  return data.calendar || defaultData.calendar
}

export function getCalendarState() {
  const cal = getCalendarData()
  return cal.state || { year: 3102, month: 0, day: 1 }
}

export function getDayEvents(month, day) {
  const cal = getCalendarData()
  return (cal.events || []).filter(e => e.month === month && e.day === day)
}

export async function setCalendarState(state) {
  const data = getStore()
  if (!data.calendar) data.calendar = { ...defaultData.calendar }
  data.calendar.state = { ...data.calendar.state, ...state }
  const res = await api('/calendar/state', { method: 'PUT', body: data.calendar.state })
  if (!res.ok) await fallbackSave()
}

export async function advanceCalendarDay(direction = 1) {
  const data = getStore()
  if (!data.calendar) data.calendar = { ...defaultData.calendar }
  if (!data.calendar.state) data.calendar.state = { year: 3102, month: 0, day: 1 }
  let { year, month, day } = data.calendar.state
  day += direction
  if (day > 30) { day = 1; month++
    if (month > 11) { month = 0; year++ } }
  else if (day < 1) { day = 30; month--
    if (month < 0) { month = 11; year-- } }
  data.calendar.state = { year, month, day }
  const res = await api('/calendar/state', { method: 'PUT', body: data.calendar.state })
  if (!res.ok) await fallbackSave()
  return data.calendar.state
}

export function getCalendarComments(month, day, year) {
  const data = getStore()
  const cal = data.calendar || {}
  const key = year !== undefined ? `${year}-${month}-${day}` : `${month}-${day}`
  return cal.comments?.[key] || []
}

export async function addCalendarComment(month, day, author, text, year) {
  const data = getStore()
  if (!data.calendar) data.calendar = { ...defaultData.calendar }
  if (!data.calendar.comments) data.calendar.comments = {}
  const key = year !== undefined ? `${year}-${month}-${day}` : `${month}-${day}`
  if (!data.calendar.comments[key]) data.calendar.comments[key] = []
  const comment = { id: 'cc-' + Date.now(), author, text, timestamp: Date.now(), month, day, year, dateKey: key }
  data.calendar.comments[key].push(comment)
  const res = await api('/calendar/comments', { method: 'POST', body: comment })
  if (!res.ok) await fallbackSave()
  return comment
}

export async function deleteCalendarComment(commentId, month, day, year) {
  const data = getStore()
  if (!data.calendar?.comments) return
  const key = year !== undefined ? `${year}-${month}-${day}` : `${month}-${day}`
  if (!data.calendar.comments[key]) return
  data.calendar.comments[key] = data.calendar.comments[key].filter(c => c.id !== commentId)
  const res = await api('/calendar/comments/' + commentId, { method: 'DELETE' })
  if (!res.ok) await fallbackSave()
}

export function getAllCalendarComments() {
  const data = getStore()
  const all = []
  if (data.calendar?.comments) {
    Object.values(data.calendar.comments).forEach(arr => {
      arr.forEach(c => all.push(c))
    })
  }
  return all.sort((a, b) => b.timestamp - a.timestamp)
}

export function exportData() {
  return JSON.stringify(getStore(), null, 2)
}

export async function importData(jsonStr) {
  try {
    const data = JSON.parse(jsonStr)
    if (data.players && data.mapPins) {
      await saveData(data, true)
      return true
    }
  } catch (e) { /* ignore */ }
  return false
}

export async function resetData() {
  dataCache = { ...defaultData }
  await saveData(dataCache, true)
}

export async function exportFullData() {
  const users = await getAllUsers()
  const requests = await getAllAccessRequests()
  return JSON.stringify({ campaign: getStore(), users, requests }, null, 2)
}

export async function importFullData(jsonStr) {
  try {
    const data = JSON.parse(jsonStr)
    if (data.campaign && data.users && data.requests) {
      await saveData(data.campaign, true)
      return { ok: true, users: data.users, requests: data.requests }
    }
  } catch (e) { /* ignore */ }
  return { ok: false }
}

function getAllUsers() {
  try {
    const raw = localStorage.getItem('hunt-users')
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  return []
}

function getAllAccessRequests() {
  try {
    const raw = localStorage.getItem('hunt-access-requests')
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  return []
}
