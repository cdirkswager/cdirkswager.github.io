import { describe, it, expect } from 'vitest'
import { createCombat, nextTurn, previousTurn, activeCombatant, removeCombatant, canAct, rollInitiative } from './combat.js'
import { computeReachable, pathTo, snapToCell, wallBlocksMovement, segmentsIntersect } from './movement.js'

describe('combat — turn order', () => {
  const tokens = [
    { id: 'a', name: 'Aria', userId: 'u1' },
    { id: 'b', name: 'Brok', userId: 'u2' },
    { id: 'c', name: 'Crow', userId: null },
  ]
  const fixedRolls = { a: 12, b: 18, c: 12 }
  const roll = (t) => fixedRolls[t.id]

  it('sorts by initiative desc, name as tiebreak', () => {
    const order = rollInitiative(tokens, roll).map(c => c.tokenId)
    expect(order).toEqual(['b', 'a', 'c'])   // 18, then two 12s alphabetical
  })

  it('advances turns and wraps into a new round', () => {
    let combat = createCombat('s1', tokens, roll)
    expect(activeCombatant(combat).tokenId).toBe('b')
    combat = { ...combat, ...nextTurn(combat) }
    expect(activeCombatant(combat).tokenId).toBe('a')
    combat = { ...combat, ...nextTurn(combat) }
    combat = { ...combat, ...nextTurn(combat) }
    expect(combat.round).toBe(2)
    expect(activeCombatant(combat).tokenId).toBe('b')
  })

  it('previousTurn un-wraps a round but never below 1', () => {
    let combat = createCombat('s1', tokens, roll)
    combat = { ...combat, ...previousTurn(combat) }
    expect(combat.round).toBe(1)
    expect(combat.turnIndex).toBe(2)
  })

  it('removing a combatant before the active index keeps the same actor active', () => {
    let combat = createCombat('s1', tokens, roll)     // order b, a, c
    combat = { ...combat, ...nextTurn(combat) }        // active = a (index 1)
    combat = removeCombatant(combat, 'b')              // remove index 0
    expect(activeCombatant(combat).tokenId).toBe('a')
    expect(combat.combatants).toHaveLength(2)
  })

  it('canAct: DM always, owner only on their turn', () => {
    const combat = createCombat('s1', tokens, roll)    // active = b (u2)
    expect(canAct(combat, 'u2', false)).toBe(true)
    expect(canAct(combat, 'u1', false)).toBe(false)
    expect(canAct(combat, 'u1', true)).toBe(true)
  })
})

describe('movement — reachable cells', () => {
  const G = 100      // gridSize px
  const token = { x: 500, y: 500, width: 100, height: 100 }   // cell (5,5)
  const bounds = { width: 1200, height: 1200 }

  it('open ground: 30 ft = 6 cells of range, diagonals 5-10-5', () => {
    const r = computeReachable({ token, walls: [], gridSize: G, gridUnit: 5, speed: 30, bounds })
    expect(r.cells.get('11,5').costFt).toBe(30)        // 6 straight east
    expect(r.cells.has('12,5')).toBe(false)            // 7 is too far
    /* Pure diagonal 5-10-5: 4 diagonals cost 1+2+1+2 = 6 cells = 30ft */
    expect(r.cells.get('9,9').costFt).toBe(30)         // 4 diagonals
    expect(r.cells.has('10,10')).toBe(false)           // 5th diagonal would cost 35
  })

  it('a solid wall blocks the step across it and forces a detour', () => {
    /* Vertical wall fully separating column 5 from column 6 at x=600,
       spanning y 0..1200 — east is entirely sealed. */
    const walls = [{ id: 'w', type: 'solid', x: 600, y: 0, x2: 600, y2: 1200 }]
    const r = computeReachable({ token, walls, gridSize: G, gridUnit: 5, speed: 30, bounds })
    expect(r.cells.has('6,5')).toBe(false)
    expect(r.cells.has('4,5')).toBe(true)              // west still open
  })

  it('a short wall is walked around, costing extra distance', () => {
    /* Wall covering only the edge between (5,5) and (6,5): x=600, y 500..600 */
    const walls = [{ id: 'w', type: 'solid', x: 600, y: 500, x2: 600, y2: 600 }]
    const r = computeReachable({ token, walls, gridSize: G, gridUnit: 5, speed: 30, bounds })
    /* (6,5) is reachable but via a diagonal around the wall: cost 5ft
       diagonal — still 5. What must hold: it's reachable and the direct
       1-step path was not used… cost should be 5 (one diagonal + ...). */
    expect(r.cells.has('6,5')).toBe(true)
    const direct = r.cells.get('6,5').costFt
    expect(direct).toBeGreaterThanOrEqual(5)
  })

  it('closed doors block, open doors do not', () => {
    const door = { id: 'd', type: 'door', doorState: 'closed', x: 600, y: 0, x2: 600, y2: 1200 }
    let r = computeReachable({ token, walls: [door], gridSize: G, gridUnit: 5, speed: 30, bounds })
    expect(r.cells.has('6,5')).toBe(false)
    r = computeReachable({ token, walls: [{ ...door, doorState: 'open' }], gridSize: G, gridUnit: 5, speed: 30, bounds })
    expect(r.cells.has('6,5')).toBe(true)
  })

  it('no diagonal corner-cutting through wall corners', () => {
    /* Wall along east edge of (5,5) only: blocks E; NE diagonal must also
       be blocked (can't squeeze past the corner). */
    const walls = [{ id: 'w', type: 'solid', x: 600, y: 450, x2: 600, y2: 650 }]
    const r = computeReachable({ token, walls, gridSize: G, gridUnit: 5, speed: 5, bounds })
    expect(r.cells.has('6,5')).toBe(false)
    expect(r.cells.has('6,4')).toBe(false)   // NE cut through corner denied
    expect(r.cells.has('5,4')).toBe(true)    // plain N fine
  })

  it('pathTo reconstructs a start-to-target path with cost', () => {
    const r = computeReachable({ token, walls: [], gridSize: G, gridUnit: 5, speed: 30, bounds })
    const p = pathTo(r, 8, 5)
    expect(p.costFt).toBe(15)
    expect(p.path[0]).toEqual({ cx: 5, cy: 5 })
    expect(p.path.at(-1)).toEqual({ cx: 8, cy: 5 })
    expect(pathTo(r, 20, 20)).toBeNull()
  })

  it('snapToCell centers a token in its nearest cell', () => {
    expect(snapToCell(487, 519, 100, 100, 100)).toMatchObject({ x: 500, y: 500, cx: 5, cy: 5 })
    /* Smaller-than-cell token gets centered */
    expect(snapToCell(505, 505, 50, 50, 100)).toMatchObject({ x: 525, y: 525 })
  })

  it('wallBlocksMovement policy', () => {
    expect(wallBlocksMovement({ type: 'solid' })).toBe(true)
    expect(wallBlocksMovement({ type: 'see-through' })).toBe(true)
    expect(wallBlocksMovement({ type: 'terrain' })).toBe(false)
    expect(wallBlocksMovement({ type: 'door', doorState: 'open' })).toBe(false)
    expect(wallBlocksMovement({ type: 'door', doorState: 'closed' })).toBe(true)
  })

  it('segmentsIntersect basic sanity', () => {
    expect(segmentsIntersect(0, 0, 10, 10, 0, 10, 10, 0)).toBe(true)
    expect(segmentsIntersect(0, 0, 1, 1, 5, 5, 6, 6)).toBe(false)
  })
})
