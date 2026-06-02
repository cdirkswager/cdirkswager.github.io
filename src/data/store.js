const STORE_KEY = 'hunt-campaign-data'
const SEED_KEY = 'hunt-data-seeded'

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
      widgets: [
        { id: 'w-3', type: 'stats', content: { str: 8, dex: 12, con: 10, int: 16, wis: 14, cha: 12 } },
        { id: 'w-4', type: 'description', content: 'A studious elf who spends more time in libraries than in battle.' },
      ],
      createdAt: Date.now(),
    },
  ],
  maps: [
    { id: 'map-1', name: 'The Realm', imageUrl: '' },
  ],
  mapPins: [],
  questionnaires: [],
  responses: [],
  comments: {},
}

function migrateData(data) {
  if (!data) return data
  if (!data.maps) {
    data.maps = [{ id: 'map-1', name: 'The Realm', imageUrl: '' }]
    data.mapPins = (data.mapPins || []).map(pin => {
      if (!pin.mapId) pin.mapId = 'map-1'
      return pin
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
  return null
}

function saveData(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(migrateData(data)))
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

export function saveMap(map) {
  const data = getStore()
  if (map.id) {
    const idx = data.maps.findIndex(m => m.id === map.id)
    if (idx >= 0) data.maps[idx] = map
  } else {
    map.id = 'map-' + Date.now()
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
