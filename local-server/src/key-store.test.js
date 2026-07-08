import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from './key-store.js'

let dir, store

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'keystore-'))
  store = createStore(dir)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('key-store — reads against in-memory state', () => {
  it('insert / getById / getAll are consistent without a flush', () => {
    store.insert('token', { id: 't1', name: 'A' })
    store.insert('token', { id: 't2', name: 'B' })
    expect(store.getById('token', 't1').name).toBe('A')
    expect(store.getAll('token')).toHaveLength(2)
  })

  it('update merges changes and getById reflects them immediately', () => {
    store.insert('token', { id: 't1', name: 'A', x: 0 })
    const updated = store.update('token', 't1', { x: 42 })
    expect(updated.x).toBe(42)
    expect(updated.name).toBe('A')
    expect(store.getById('token', 't1').x).toBe(42)
  })

  it('update on a missing record returns null; remove returns false', () => {
    expect(store.update('token', 'nope', { x: 1 })).toBeNull()
    expect(store.remove('token', 'nope')).toBe(false)
  })

  it('remove drops the record from array and index', () => {
    store.insert('token', { id: 't1' })
    expect(store.remove('token', 't1')).toBe(true)
    expect(store.getById('token', 't1')).toBeNull()
    expect(store.getAll('token')).toHaveLength(0)
  })
})

describe('key-store — debounced persistence', () => {
  it('does not write synchronously per mutation, but flush() persists', () => {
    store.insert('token', { id: 't1', name: 'A' })
    const fp = join(dir, 'records', 'token.json')
    /* Mutation alone must not have produced the file yet (debounced). */
    expect(existsSync(fp)).toBe(false)
    store.flush()
    expect(existsSync(fp)).toBe(true)
    const onDisk = JSON.parse(readFileSync(fp, 'utf-8'))
    expect(onDisk).toHaveLength(1)
    expect(onDisk[0].name).toBe('A')
  })

  it('flushes automatically after the debounce window', async () => {
    store.insert('token', { id: 't1' })
    await new Promise(r => setTimeout(r, 400))
    const fp = join(dir, 'records', 'token.json')
    expect(existsSync(fp)).toBe(true)
  })

  it('coalesces many mutations into one on-disk state', () => {
    for (let i = 0; i < 100; i++) store.update('token', 't1', { x: i })
    store.insert('token', { id: 't1', x: -1 })
    for (let i = 0; i < 100; i++) store.update('token', 't1', { x: i })
    store.flush()
    const onDisk = JSON.parse(readFileSync(join(dir, 'records', 'token.json'), 'utf-8'))
    expect(onDisk).toHaveLength(1)
    expect(onDisk[0].x).toBe(99)
  })

  it('a fresh store loads persisted records with a working index', () => {
    store.insert('actor', { id: 'a1', name: 'Hero' })
    store.flush()
    const reopened = createStore(dir)
    expect(reopened.getById('actor', 'a1').name).toBe('Hero')
    expect(reopened.getAllTypes().actor).toHaveLength(1)
  })

  it('leaves no .tmp files behind after flush (atomic rename)', () => {
    store.insert('token', { id: 't1' })
    store.flush()
    expect(existsSync(join(dir, 'records', 'token.json.tmp'))).toBe(false)
  })
})
