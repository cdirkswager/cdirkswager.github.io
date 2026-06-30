import { describe, it, expect } from 'vitest'
import { euclidean, chebyshev, alternating, hex, measure, setActive, getActive, registerRule, listRules } from './DistanceRules.js'
import { Template, TEMPLATE_TYPES } from './Template.js'
import { getCoveredCells, testPointInShape, getBoundaryPolygon } from './CellCoverage.js'
import { EventBus } from './EventBus.js'

/* ─────────────────────────────────────────────────────────────────
   PART 1 — Distance Rules
   ───────────────────────────────────────────────────────────────── */

describe('DistanceRules', () => {
  it('euclidean returns straight-line world distance', () => {
    const d = euclidean(0, 0, 300, 400, 100)
    expect(d).toBeCloseTo(500, 9)
  })

  it('euclidean same point returns 0', () => {
    expect(euclidean(100, 200, 100, 200)).toBe(0)
  })

  it('chebyshev counts every diagonal as 1 cell', () => {
    /* Moving 3 cells right and 3 cells down = max(3,3) = 3 cells */
    const d = chebyshev(0, 0, 300, 300, 100)
    expect(d).toBe(3)
  })

  it('chebyshev straight line counts correctly', () => {
    /* Moving 5 cells right, 0 down = 5 cells */
    const d = chebyshev(0, 0, 500, 0, 100)
    expect(d).toBe(5)
  })

  it('alternating counts first diagonal 1, second 2', () => {
    /* 2 cells right, 2 cells down = 2 diagonal moves
       Alternating: first=1, second=2 => total=3 */
    const d = alternating(0, 0, 200, 200, 100)
    expect(d).toBe(3)
  })

  it('alternating mixed straight + diagonal', () => {
    /* 3 cells right, 1 cell down
       straight = |3-1| = 2, diag = 1 => cost = 2 + 1 = 3 */
    const d = alternating(0, 0, 300, 100, 100)
    expect(d).toBe(3)
  })

  it('hex distance works for basic hex movement', () => {
    /* Two hex centers adjacent */
    const d = hex(0, 0, 100, 0, 100)
    expect(d).toBeGreaterThan(0)
    /* Should be 1 hex */
    expect(d).toBe(1)
  })

  it('measure uses active rule', () => {
    setActive('chebyshev')
    const d = measure(0, 0, 100, 100, 100, 'square')
    expect(d).toBe(1)
  })

  it('measure with gridless uses euclidean', () => {
    setActive('chebyshev')
    const d = measure(0, 0, 300, 400, 100, 'none')
    /* gridless always uses euclidean/cellSize regardless of active rule */
    expect(d).toBeCloseTo(5, 5)
  })

  it('registerRule adds new distance strategy', () => {
    registerRule('alwaysOne', () => 1)
    setActive('alwaysOne')
    expect(measure(0, 0, 9999, 9999, 100, 'square')).toBe(1)
  })

  it('listRules returns all registered names', () => {
    const names = listRules()
    expect(names).toContain('euclidean')
    expect(names).toContain('chebyshev')
    expect(names).toContain('alternating')
    expect(names).toContain('hex')
  })
})

/* ─────────────────────────────────────────────────────────────────
   PART 2 — Template Data Model
   ───────────────────────────────────────────────────────────────── */

describe('Template', () => {
  it('creates a circle template with default radius', () => {
    const t = new Template({ type: 'circle', x: 100, y: 200 })
    expect(t.type).toBe('circle')
    expect(t.radius).toBe(100)
    expect(t.x).toBe(100)
    expect(t.y).toBe(200)
  })

  it('creates a cone template with configurable angle', () => {
    const t = new Template({ type: 'cone', angle: Math.PI / 2, length: 300 })
    expect(t.angle).toBeCloseTo(Math.PI / 2)
    expect(t.length).toBe(300)
  })

  it('creates a line template', () => {
    const t = new Template({ type: 'line', length: 200, width: 50 })
    expect(t.length).toBe(200)
    expect(t.width).toBe(50)
  })

  it('creates a rectangle template', () => {
    const t = new Template({ type: 'rectangle', width: 150, height: 100 })
    expect(t.width).toBe(150)
    expect(t.height).toBe(100)
  })

  it('throws for unknown type', () => {
    expect(() => new Template({ type: 'invalid' })).toThrow()
  })

  it('sets default owner to null', () => {
    const t = new Template({ type: 'circle' })
    expect(t.owner).toBeNull()
  })

  it('sets owner when provided', () => {
    const t = new Template({ type: 'circle', owner: 'player-42' })
    expect(t.owner).toBe('player-42')
  })

  it('toJSON serializes all shape-specific fields', () => {
    const t = new Template({ type: 'cone', x: 10, y: 20, rotation: 0.5, angle: 1.0, length: 300, owner: 'alice' })
    const json = t.toJSON()
    expect(json.type).toBe('cone')
    expect(json.angle).toBe(1.0)
    expect(json.length).toBe(300)
    expect(json.owner).toBe('alice')
    expect(json.x).toBe(10)
    expect(json.y).toBe(20)
  })

  it('toJSON for circle includes radius', () => {
    const t = new Template({ type: 'circle', radius: 80 })
    expect(t.toJSON().radius).toBe(80)
  })
})

/* ─────────────────────────────────────────────────────────────────
   PART 3 — Cell Coverage
   ───────────────────────────────────────────────────────────────── */

describe('CellCoverage (square grid)', () => {
  it('circle covers cells within radius', () => {
    const t = new Template({ type: 'circle', x: 250, y: 250, radius: 150 })
    const cells = getCoveredCells(t, 'square', 100)
    /* Should cover roughly a 3x3 area */
    expect(cells.length).toBeGreaterThanOrEqual(4)
    expect(cells.length).toBeLessThanOrEqual(16)
    /* Center cell should be included */
    const centerCell = cells.find(c => c.gx === 2 && c.gy === 2)
    expect(centerCell).toBeDefined()
  })

  it('circle far corner cell not covered', () => {
    const t = new Template({ type: 'circle', x: 50, y: 50, radius: 40 })
    const cells = getCoveredCells(t, 'square', 100)
    /* With small radius, only cell (0,0) should be covered */
    const far = cells.find(c => c.gx > 1 || c.gy > 1)
    expect(far).toBeUndefined()
  })

  it('rectangle covers exact axis-aligned cells', () => {
    const t = new Template({ type: 'rectangle', x: 200, y: 200, width: 200, height: 200 })
    const cells = getCoveredCells(t, 'square', 100)
    /* Should cover 2x2 = 4 cells centered on (2,2) */
    expect(cells).toHaveLength(4)
    const topLeft = cells.find(c => c.gx === 1 && c.gy === 1)
    expect(topLeft).toBeDefined()
  })

  it('cone covers fan-shaped area', () => {
    const t = new Template({ type: 'cone', x: 0, y: 0, rotation: 0, angle: Math.PI / 2, length: 200 })
    const cells = getCoveredCells(t, 'square', 100)
    /* Should cover cells to the right of origin */
    expect(cells.length).toBeGreaterThan(0)
    /* Close cells along the center should be covered */
    const near = cells.find(c => c.gx === 1 && c.gy === 0)
    expect(near).toBeDefined()
  })

  it('line covers thin corridor', () => {
    const t = new Template({ type: 'line', x: 0, y: 50, rotation: 0, length: 300, width: 50 })
    const cells = getCoveredCells(t, 'square', 100)
    /* Should cover cells along x axis */
    expect(cells.length).toBeGreaterThanOrEqual(2)
    expect(cells.every(c => c.gy === 0)).toBe(true)
  })
})

describe('CellCoverage (gridless — boundary polygon)', () => {
  it('circle returns 32-gon approximation', () => {
    const t = new Template({ type: 'circle', x: 0, y: 0, radius: 100 })
    const poly = getCoveredCells(t, 'none', 0)
    expect(poly).toHaveLength(32)
    /* All points should be ~100 from origin */
    for (const p of poly) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(100, 0)
    }
  })

  it('rectangle returns 4 corners', () => {
    const t = new Template({ type: 'rectangle', x: 0, y: 0, width: 200, height: 100 })
    const poly = getCoveredCells(t, 'none', 0)
    expect(poly).toHaveLength(4)
  })
})

describe('testPointInShape', () => {
  it('circle: point inside', () => {
    const t = new Template({ type: 'circle', x: 100, y: 100, radius: 50 })
    expect(testPointInShape(t, 100, 100)).toBe(true)
    expect(testPointInShape(t, 140, 100)).toBe(true)
    expect(testPointInShape(t, 200, 100)).toBe(false)
  })

  it('rectangle: point inside rotated rect', () => {
    const t = new Template({ type: 'rectangle', x: 200, y: 200, width: 200, height: 100 })
    expect(testPointInShape(t, 200, 200)).toBe(true)
    expect(testPointInShape(t, 300, 200)).toBe(true)
    expect(testPointInShape(t, 400, 200)).toBe(false)
  })

  it('line: point inside', () => {
    const t = new Template({ type: 'line', x: 0, y: 0, rotation: 0, length: 200, width: 40 })
    expect(testPointInShape(t, 100, 0)).toBe(true)
    expect(testPointInShape(t, 100, 19)).toBe(true)
    expect(testPointInShape(t, 100, 21)).toBe(false)
    expect(testPointInShape(t, -10, 0)).toBe(false)
    expect(testPointInShape(t, 210, 0)).toBe(false)
  })
})

/* ─────────────────────────────────────────────────────────────────
   PART 4 — EventBus
   ───────────────────────────────────────────────────────────────── */

describe('EventBus', () => {
  it('emits and receives events', () => {
    const bus = new EventBus()
    let received = null
    bus.on('test', (data) => { received = data })
    bus.emit('test', { value: 42 })
    expect(received).toEqual({ value: 42 })
  })

  it('off removes listener', () => {
    const bus = new EventBus()
    let count = 0
    const unsub = bus.on('test', () => { count++ })
    bus.emit('test')
    expect(count).toBe(1)
    unsub()
    bus.emit('test')
    expect(count).toBe(1)
  })

  it('emitRecord fires specific and generic events', () => {
    const bus = new EventBus()
    const events = []
    bus.on('template:created', (d) => events.push({ ev: 'specific', d }))
    bus.on('record:changed', (d) => events.push({ ev: 'generic', d }))
    bus.emitRecord('template', 'created', { id: 'tmpl-1' })
    expect(events).toHaveLength(2)
    expect(events[0].ev).toBe('specific')
    expect(events[1].ev).toBe('generic')
  })

  it('emitEphemeral fires with type', () => {
    const bus = new EventBus()
    let msg = null
    bus.on('ephemeral', (m) => { msg = m })
    bus.emitEphemeral('ruler-update', { waypoints: [{ x: 0, y: 0 }] })
    expect(msg.type).toBe('ruler-update')
    expect(msg.waypoints[0].x).toBe(0)
  })

  it('destroy clears all listeners', () => {
    const bus = new EventBus()
    let count = 0
    bus.on('test', () => { count++ })
    bus.destroy()
    bus.emit('test')
    expect(count).toBe(0)
  })
})
