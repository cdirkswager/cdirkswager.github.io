const STORE_KEY = 'hunt-campaign-data'
const SEED_KEY = 'hunt-data-seeded'

export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter']

const defaultData = {
  players: [
    {
      id: 'player-1',
      name: 'Player One',
      class: 'Fighter',
      race: 'Human',
      level: 1,
      bio: 'A brave adventurer beginning their journey...',
      title: 'The Wanderer',
      layout: 'single',
      musicUrl: '',
      commentsEnabled: true,
      avatarUrl: '',
      theme: {
        bgColor: '#0d0d0d',
        textColor: '#e0d5c1',
        accentColor: '#c9a84c',
        fontFamily: 'IM Fell English, serif',
        bgImage: '',
      },
      customCode: { enabled: false, html: '', css: '' },
      widgets: [
        { id: 'w-1', type: 'stats', content: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } },
        { id: 'w-2', type: 'description', content: 'A mysterious figure from a distant land.' },
      ],
      createdAt: Date.now(),
    },
    {
      id: 'player-2',
      name: 'Player Two',
      class: 'Wizard',
      race: 'Elf',
      level: 1,
      bio: 'A student of the arcane arts...',
      title: 'The Scholar',
      layout: 'single',
      musicUrl: '',
      commentsEnabled: true,
      avatarUrl: '',
      theme: {
        bgColor: '#0a0a1a',
        textColor: '#c1d0e0',
        accentColor: '#6a4cc9',
        fontFamily: 'IM Fell English, serif',
        bgImage: '',
      },
      customCode: { enabled: false, html: '', css: '' },
      widgets: [
        { id: 'w-3', type: 'stats', content: { str: 8, dex: 12, con: 10, int: 16, wis: 14, cha: 12 } },
        { id: 'w-4', type: 'description', content: 'A studious elf who spends more time in libraries than in battle.' },
      ],
      createdAt: Date.now(),
    },
  ],
  maps: [
    { id: 'map-1', name: 'Spring', imageUrl: '', year: 1, season: 0 },
    { id: 'map-2', name: 'Summer', imageUrl: '', year: 1, season: 1 },
    { id: 'map-3', name: 'Autumn', imageUrl: '', year: 1, season: 2 },
    { id: 'map-4', name: 'Winter', imageUrl: '', year: 1, season: 3 },
  ],
  mapPins: [],
  questionnaires: [],
  responses: [],
  comments: {},
}

function migrateData(data) {
  if (!data) return data
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
  return data
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return migrateData(data)
    }
  } catch (e) { /* ignore */ }
  return { players: [], maps: [], mapPins: [], questionnaires: [], responses: [], comments: {} }
}

function saveData(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(migrateData(data)))
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

export function seedIfNeeded() {
  if (!localStorage.getItem(SEED_KEY)) {
    saveData(defaultData)
    localStorage.setItem(SEED_KEY, 'true')
  }
}

export function getStore() {
  return loadData()
}

export function getPlayers() {
  return getStore().players
}

export function getPlayer(id) {
  return getStore().players.find(p => p.id === id) || null
}

export function savePlayer(player) {
  const data = getStore()
  const idx = data.players.findIndex(p => p.id === player.id)
  let widgetCounter = Date.now()
  player.widgets = (player.widgets || []).map(w => {
    if (!w.id) w.id = 'wid-' + (widgetCounter++)
    return w
  })
  if (player.layout === undefined) player.layout = 'single'
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
  saveData(data)
  return player
}

export function deletePlayer(id) {
  const data = getStore()
  data.players = data.players.filter(p => p.id !== id)
  saveData(data)
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

export function addYear(startYear) {
  const data = getStore()
  let newYear
  if (startYear !== undefined) {
    newYear = startYear
  } else {
    newYear = Math.max(data.maps.reduce((max, m) => Math.max(max, m.year ?? 0), 0) + 1, 1)
  }
  SEASON_NAMES.forEach((name, i) => {
    const map = { name, imageUrl: '', year: newYear, season: i }
    saveMap(map)
  })
  return newYear
}

export function deleteYear(year) {
  const data = getStore()
  const idsToDelete = data.maps.filter(m => m.year === year).map(m => m.id)
  idsToDelete.forEach(id => deleteMap(id))
}

export function saveMap(map) {
  const data = getStore()
  if (map.id) {
    const idx = data.maps.findIndex(m => m.id === map.id)
    if (idx >= 0) data.maps[idx] = map
  } else {
    map.id = 'map-' + Date.now()
    if (map.year === undefined) map.year = 0
    if (map.season === undefined) map.season = data.maps.filter(m => m.year === map.year).length
    data.maps.push(map)
  }
  saveData(data)
  return map
}

export function deleteMap(id) {
  const data = getStore()
  data.maps = data.maps.filter(m => m.id !== id)
  data.mapPins = data.mapPins.filter(p => p.mapId !== id)
  saveData(data)
}

export function getMapPins(mapId) {
  const pins = getStore().mapPins
  if (mapId) return pins.filter(p => p.mapId === mapId)
  return pins
}

export function saveMapPin(pin) {
  const data = getStore()
  if (pin.id) {
    const idx = data.mapPins.findIndex(p => p.id === pin.id)
    if (idx >= 0) data.mapPins[idx] = pin
  } else {
    pin.id = 'pin-' + Date.now()
    pin.timestamp = Date.now()
    data.mapPins.push(pin)
  }
  saveData(data)
  return pin
}

export function deleteMapPin(id) {
  const data = getStore()
  data.mapPins = data.mapPins.filter(p => p.id !== id)
  saveData(data)
}

export function getQuestionnaires() {
  return getStore().questionnaires
}

export function getQuestionnaire(id) {
  return getStore().questionnaires.find(q => q.id === id) || null
}

export function saveQuestionnaire(q) {
  const data = getStore()
  if (q.id) {
    const idx = data.questionnaires.findIndex(x => x.id === q.id)
    if (idx >= 0) data.questionnaires[idx] = q
  } else {
    q.id = 'q-' + Date.now()
    q.createdAt = Date.now()
    data.questionnaires.push(q)
  }
  saveData(data)
  return q
}

export function deleteQuestionnaire(id) {
  const data = getStore()
  data.questionnaires = data.questionnaires.filter(q => q.id !== id)
  saveData(data)
}

export function saveResponse(response) {
  const data = getStore()
  response.id = 'r-' + Date.now()
  response.submittedAt = Date.now()
  data.responses.push(response)
  saveData(data)
  return response
}

export function getResponses(questionnaireId) {
  const data = getStore()
  return data.responses.filter(r => r.questionnaireId === questionnaireId)
}

export function getComments(playerId) {
  const data = getStore()
  return data.comments?.[playerId] || []
}

export function addComment(playerId, author, text) {
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
  data.comments[playerId].push(comment)
  saveData(data)
  return comment
}

export function deleteComment(commentId, playerId) {
  const data = getStore()
  if (!data.comments?.[playerId]) return
  data.comments[playerId] = data.comments[playerId].filter(c => c.id !== commentId)
  saveData(data)
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

export function exportData() {
  return JSON.stringify(getStore(), null, 2)
}

export function importData(jsonStr) {
  try {
    const data = JSON.parse(jsonStr)
    if (data.players && data.mapPins && data.questionnaires) {
      saveData(data)
      localStorage.setItem(SEED_KEY, 'true')
      return true
    }
  } catch (e) { /* ignore */ }
  return false
}

export function resetData() {
  localStorage.removeItem(STORE_KEY)
  localStorage.removeItem(SEED_KEY)
  seedIfNeeded()
}

export function exportFullData() {
  const users = getAllUsers()
  const requests = getAllAccessRequests()
  return JSON.stringify({ campaign: getStore(), users, requests }, null, 2)
}

export function importFullData(jsonStr) {
  try {
    const data = JSON.parse(jsonStr)
    if (data.campaign && data.users && data.requests) {
      saveData(data.campaign)
      localStorage.setItem(SEED_KEY, 'true')
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
