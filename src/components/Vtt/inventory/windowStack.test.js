import { describe, it, expect } from 'vitest'
import { windowStackReducer, resolveHotkey, HOTKEYS } from './windowStack.js'

describe('windowStackReducer', () => {
  it('opens by pushing on top and de-duplicates', () => {
    let s = windowStackReducer([], { type: 'open', id: 'inventory' })
    expect(s).toEqual(['inventory'])
    s = windowStackReducer(s, { type: 'open', id: 'loot' })
    expect(s).toEqual(['inventory', 'loot'])
    // re-opening moves it to the top rather than duplicating
    s = windowStackReducer(s, { type: 'open', id: 'inventory' })
    expect(s).toEqual(['loot', 'inventory'])
  })

  it('closeTop pops only the top window', () => {
    const s = windowStackReducer(['inventory', 'loot'], { type: 'closeTop' })
    expect(s).toEqual(['inventory'])
  })

  it('close removes a specific window from anywhere in the stack', () => {
    const s = windowStackReducer(['inventory', 'loot', 'party'], { type: 'close', id: 'loot' })
    expect(s).toEqual(['inventory', 'party'])
  })

  it('toggle opens then closes', () => {
    let s = windowStackReducer([], { type: 'toggle', id: 'party' })
    expect(s).toEqual(['party'])
    s = windowStackReducer(s, { type: 'toggle', id: 'party' })
    expect(s).toEqual([])
  })

  it('closeAll empties the stack', () => {
    expect(windowStackReducer(['a', 'b'], { type: 'closeAll' })).toEqual([])
  })
})

describe('resolveHotkey', () => {
  it('maps letter keys to toggles', () => {
    expect(resolveHotkey('i', { hasTop: false })).toEqual({ type: 'toggle', id: 'inventory' })
    expect(resolveHotkey('L', { hasTop: false })).toEqual({ type: 'toggle', id: 'loot' })
    expect(resolveHotkey('p', { hasTop: true })).toEqual({ type: 'toggle', id: 'party' })
    expect(resolveHotkey('c', { hasTop: false })).toEqual({ type: 'toggle', id: 'inventory' })
  })

  it('Escape closes the top only when something is open', () => {
    expect(resolveHotkey('Escape', { hasTop: true })).toEqual({ type: 'closeTop' })
    expect(resolveHotkey('Escape', { hasTop: false })).toBe(null)
  })

  it('ignores unrelated keys', () => {
    expect(resolveHotkey('x', { hasTop: true })).toBe(null)
  })

  it('exposes the key map', () => {
    expect(HOTKEYS.i).toBe('inventory')
    expect(HOTKEYS.p).toBe('party')
  })
})
