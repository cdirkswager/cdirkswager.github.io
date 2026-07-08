import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export function createStore(dataDir) {
  const storeDir = resolve(dataDir, 'records')
  if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true })

  const indexes = new Map()

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
    return records
  }

  function _saveIndex(kind) {
    const records = indexes.get(kind)
    if (records) {
      writeFileSync(_filePath(kind), JSON.stringify(records, null, 2))
    }
  }

  function insert(kind, record) {
    const records = _loadIndex(kind)
    records.push(record)
    _saveIndex(kind)
    return record
  }

  function getAll(kind) {
    return [..._loadIndex(kind)]
  }

  function getById(kind, id) {
    return _loadIndex(kind).find(r => r.id === id) || null
  }

  function update(kind, id, changes) {
    const records = _loadIndex(kind)
    const idx = records.findIndex(r => r.id === id)
    if (idx === -1) return null
    records[idx] = { ...records[idx], ...changes, updatedAt: Date.now() }
    _saveIndex(kind)
    return records[idx]
  }

  function remove(kind, id) {
    const records = _loadIndex(kind)
    const idx = records.findIndex(r => r.id === id)
    if (idx === -1) return false
    records.splice(idx, 1)
    _saveIndex(kind)
    return true
  }

  function defineSchema(kind, schema) {
    const records = _loadIndex(kind)
    records._schema = schema
    return records
  }

  function getAllTypes() {
    if (!existsSync(storeDir)) return {}
    const files = readdirSync(storeDir).filter(f => f.endsWith('.json'))
    const result = {}
    for (const file of files) {
      const kind = file.slice(0, -5)
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
  }

  return { insert, getAll, getById, update, remove, defineSchema, getAllTypes, deleteKind }
}
