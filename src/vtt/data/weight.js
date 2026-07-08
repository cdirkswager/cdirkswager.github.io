import { carryCapacity, encumbranceFor } from './fivee.js'

export function itemOwnWeight(item) {
  if (!item) return 0
  const w = Number(item.weight) || 0
  const q = Number(item.quantity) || 1
  return w * q
}

export function indexItems(items) {
  const byId = new Map()
  const byParent = new Map()
  for (const it of items || []) {
    byId.set(it.id, it)
    const key = it.parentItemId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(it)
  }
  return { byId, byParent }
}

export function isContainer(item) {
  return !!item && item.itemType === 'container' && !!item.container
}

function childrenOf(itemId, index) {
  return index.byParent.get(itemId) || []
}

export function containerFill(container, index) {
  if (!isContainer(container)) return 0
  let sum = 0
  for (const child of childrenOf(container.id, index)) {
    sum += itemExternalWeight(child, index)
  }
  return round2(sum)
}

export function itemExternalWeight(item, index) {
  if (!item) return 0
  const own = itemOwnWeight(item)
  if (isContainer(item)) {
    if (item.container.weightless) return round2(own)
    return round2(own + containerFill(item, index))
  }
  return round2(own)
}

export function actorCarriedWeight(items) {
  const index = indexItems(items)
  const topLevel = index.byParent.get(null) || []
  let sum = 0
  for (const it of topLevel) sum += itemExternalWeight(it, index)
  return round2(sum)
}

export function containerCanAccept(container, incomingWeight, index, movingItemId = null) {
  if (!isContainer(container)) return { ok: false, reason: 'not-a-container' }
  const cap = Number(container.container.capacity)
  if (!Number.isFinite(cap) || cap <= 0) return { ok: true }
  let current = 0
  for (const child of childrenOf(container.id, index)) {
    if (child.id === movingItemId) continue
    current += itemExternalWeight(child, index)
  }
  const after = round2(current + (Number(incomingWeight) || 0))
  if (after > cap) return { ok: false, reason: 'over-capacity', current: round2(current), capacity: cap, after }
  return { ok: true, current: round2(current), capacity: cap, after }
}

export function carrySummary(attributes, items) {
  const str = attributes?.abilities?.str ?? 10
  const size = attributes?.biography?.size ?? 'medium'
  const carried = actorCarriedWeight(items)
  const capacity = attributes?.carry?.capacityOverride ?? carryCapacity(str, size)
  const encumbrance = encumbranceFor(str, carried, size)
  return {
    carried,
    capacity: round2(capacity),
    pct: capacity > 0 ? round2(carried / capacity) : 0,
    over: carried > capacity,
    encumbrance: encumbrance.level,
    speedPenalty: encumbrance.speedPenalty,
  }
}

export function wouldCycle(itemId, newParentId, index) {
  let cur = newParentId
  const guard = new Set()
  while (cur != null) {
    if (cur === itemId) return true
    if (guard.has(cur)) return true
    guard.add(cur)
    cur = index.byId.get(cur)?.parentItemId ?? null
  }
  return false
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }