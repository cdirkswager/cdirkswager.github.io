import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * key-store — JSON-file-backed generic record store.
 *
 * Performance characteristics (post-audit):
 *   - Reads are O(1): each kind keeps a Map<id, record> alongside the
 *     insertion-ordered array used for persistence.
 *   - Writes are debounced: mutations mark the kind dirty and flush to
 *     disk FLUSH_DELAY_MS after the last mutation, instead of a
 *     synchronous whole-file rewrite per message (which blocked the
 *     event loop for every connected socket during token drags).
 *   - Persistence is atomic: write to <kind>.json.tmp, then rename.
 *   - Call flush() on shutdown to persist any pending changes.
 *
 * The public API is unchanged and remains synchronous against the
 * in-memory state, so callers never observe stale reads.
 */
const FLUSH_DELAY_MS = 250

export function createStore(dataDir) {
  const storeDir = resolve(dataDir, 'records')
  if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true })

  const indexes = new Map()   // kind -> record[]
  const byId = new Map()      // kind -> Map<id, record>
  const dirty = new Set()     // kinds with unpersisted changes
  let flushTimer = null

  function _filePath(kind) {
    return join(storeDir, `${kind}.json`)
  }

  function _loadIndex(kind) {
    if (indexes.has(kind)) return indexes.get(kind)
    const fp = _filePath(kind)
    let records = []
    if (existsSync(fp)) {
      try { records = JSON.parse(readFileSync(fp, 'utf-8')) } catch {}
    }
    indexes.set(kind, records)
    byId.set(kind, new Map(records.map(r => [r.id, r])))
    return records
  }

  function _idMap(kind) {
    _loadIndex(kind)
    return byId.get(kind)
  }

  function _persistKind(kind) {
    const records = indexes.get(kind)
    if (!records) return
    const fp = _filePath(kind)
    const tmp = fp + '.tmp'
    try {
      writeFileSync(tmp, JSON.stringify(records))
      renameSync(tmp, fp)
    } catch (e) {
      console.error(`[store] failed to persist ${kind}:`, e.message)
    }
  }

  function _markDirty(kind) {
    dirty.add(kind)
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, FLUSH_DELAY_MS)
    /* Don't keep the process alive just for a pending flush. */
    if (flushTimer.unref) flushTimer.unref()
  }

  /** Persist all dirty kinds immediately. Safe to call any time. */
  function flush() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
    for (const kind of dirty) _persistKind(kind)
    dirty.clear()
  }

  function insert(kind, record) {
    const records = _loadIndex(kind)
    records.push(record)
    _idMap(kind).set(record.id, record)
    _markDirty(kind)
    return record
  }

  function getAll(kind) {
    return [..._loadIndex(kind)]
  }

  function getById(kind, id) {
    return _idMap(kind).get(id) || null
  }

  function update(kind, id, changes) {
    const records = _loadIndex(kind)
    const map = _idMap(kind)
    const existing = map.get(id)
    if (!existing) return null
    const idx = records.indexOf(existing)
    const updated = { ...existing, ...changes, updatedAt: Date.now() }
    if (idx !== -1) records[idx] = updated
    map.set(id, updated)
    _markDirty(kind)
    return updated
  }

  function remove(kind, id) {
    const records = _loadIndex(kind)
    const map = _idMap(kind)
    const existing = map.get(id)
    if (!existing) return false
    const idx = records.indexOf(existing)
    if (idx !== -1) records.splice(idx, 1)
    map.delete(id)
    _markDirty(kind)
    return true
  }

  function defineSchema(kind, schema) {
    const records = _loadIndex(kind)
    records._schema = schema
    return records
  }

  function getAllTypes() {
    /* Union of on-disk kinds and in-memory kinds: with debounced writes,
       a kind created since the last flush has no file yet but absolutely
       must appear (init payloads for new joiners depend on this). */
    const kinds = new Set(indexes.keys())
    if (existsSync(storeDir)) {
      for (const f of readdirSync(storeDir)) {
        if (f.endsWith('.json')) kinds.add(f.slice(0, -5))
      }
    }
    const result = {}
    for (const kind of kinds) {
      const records = _loadIndex(kind)
      if (records.length > 0) result[kind] = [...records]
    }
    return result
  }

  function deleteKind(kind) {
    const fp = _filePath(kind)
    if (existsSync(fp)) {
      try { writeFileSync(fp, '[]') } catch {}
    }
    indexes.delete(kind)
    byId.delete(kind)
    dirty.delete(kind)
  }

  return { insert, getAll, getById, update, remove, defineSchema, getAllTypes, deleteKind, flush }
}
