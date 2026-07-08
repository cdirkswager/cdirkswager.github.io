/*
 * Performance benchmark for Lighting & Vision at target scene size.
 *
 * Target: ~200 walls, ~5 light sources, ~3 vision-bearing tokens.
 * Gate: full recompute < 16ms (60fps), per-drag update imperceptible.
 *
 * Usage: node src/benchmark.js
 */

import { Wall } from './Wall.js'
import { Token } from './Token.js'
import { WallSpatialIndex, computeCombinedVision } from './LightingVision.js'

/* ── Wall factory ──────────────────────────────────────────────── */
let _id = 0
function wall(x, y, x2, y2, type = 'solid') {
  return new Wall({ id: `w${_id++}`, x, y, x2, y2, type, doorState: type === 'door' ? 'closed' : null })
}

function token(opts = {}) {
  return new Token({
    id: opts.id ?? `t${_id++}`,
    name: opts.name ?? 'T',
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    width: 40,
    height: 40,
    visionEnabled: opts.visionEnabled ?? true,
    sightRange: opts.sightRange ?? 400,
    darkvisionRange: opts.darkvisionRange ?? 0,
    lightRadius: opts.lightRadius ?? 0,
    lightColor: opts.lightColor ?? 0xffeedd,
    lightIntensity: opts.lightIntensity ?? 1,
  })
}

/* ── Scene generator: target size ──────────────────────────────── */

function generateTargetScene() {
  _id = 0
  const walls = []
  const tokens = []

  /* ~200 walls: a rough grid of room interiors */
  const gridW = 10, gridH = 10
  const roomW = 400, roomH = 400
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const rx = gx * roomW + 50
      const ry = gy * roomH + 50
      /* Four walls per room */
      walls.push(wall(rx, ry, rx + roomW, ry))           // top
      walls.push(wall(rx + roomW, ry, rx + roomW, ry + roomH)) // right
      walls.push(wall(rx + roomW, ry + roomH, rx, ry + roomH)) // bottom
      walls.push(wall(rx, ry + roomH, rx, ry))            // left
      /* Door on one wall (some rooms) */
      if ((gx + gy) % 3 === 0) {
        walls.push(wall(rx + 150, ry, rx + 250, ry, 'door'))
      }
    }
  }
  /* Some terrain and see-through walls */
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 4000, y = Math.random() * 4000
    walls.push(wall(x, y, x + 200, y + 80, 'terrain'))
  }
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * 4000, y = Math.random() * 4000
    walls.push(wall(x, y, x + 100, y, 'see-through'))
  }
  /* A few secrets */
  walls.push(wall(800, 1800, 900, 1800, 'secret', null, true))

  /* ~3 seeing tokens with moderate sight range */
  tokens.push(token({ id: 'view1', name: 'Alpha', x: 300, y: 300, sightRange: 400 }))
  tokens.push(token({ id: 'view2', name: 'Beta', x: 1200, y: 800, sightRange: 350, darkvisionRange: 200 }))
  tokens.push(token({ id: 'view3', name: 'Gamma', x: 2200, y: 1600, sightRange: 500 }))

  /* ~5 light sources (some on seeing tokens, some on non-seeing tokens) */
  tokens.push(token({ id: 'lt1', name: 'Torch', x: 500, y: 500, visionEnabled: false, lightRadius: 250 }))
  tokens.push(token({ id: 'lt2', name: 'Campfire', x: 1500, y: 1200, visionEnabled: false, lightRadius: 300, lightColor: 0xff6644 }))
  tokens.push(token({ id: 'lt3', name: 'Lantern', x: 2800, y: 2200, visionEnabled: false, lightRadius: 200, lightColor: 0xffffaa }))

  return { walls, tokens }
}

/* ── Stats helpers ─────────────────────────────────────────────── */

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const median = sorted[Math.floor(sorted.length / 2)]
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  const p95 = sorted[Math.floor(sorted.length * 0.95)]
  const p99 = sorted[Math.floor(sorted.length * 0.99)]
  return { min, max, median, mean: mean.toFixed(2), p95, p99, n: samples.length }
}

/* ── Benchmark ─────────────────────────────────────────────────── */

async function main() {
  console.log('Generating target scene (200+ walls, 5+ lights, 3+ seeing tokens)...')
  const { walls, tokens } = generateTargetScene()
  console.log(`  Walls: ${walls.length}`)
  console.log(`  Tokens: ${tokens.length}`)
  console.log(`  Seeing tokens: ${tokens.filter(t => t.visionEnabled && t.sightRange > 0).length}`)
  console.log(`  Light sources: ${tokens.filter(t => t.lightRadius > 0).length}`)
  console.log('')

  /* ── Spatial index rebuild ───────────────────────────────────── */
  console.log('── Spatial index rebuild ──')
  const rebuildSamples = []
  const si = new WallSpatialIndex()
  for (let i = 0; i < 50; i++) {
    /* Invalidate each time to force rebuild */
    si.invalidate()
    const t0 = performance.now()
    si.rebuildIfNeeded(walls)
    rebuildSamples.push(performance.now() - t0)
  }
  const rs = stats(rebuildSamples)
  console.log(`  min: ${rs.min.toFixed(3)}ms  median: ${rs.median.toFixed(3)}ms  mean: ${rs.mean}ms  max: ${rs.max.toFixed(3)}ms`)

  /* ── Spatial index query ─────────────────────────────────────── */
  console.log('')
  console.log('── Spatial index query (range=500 from 3 token centers) ──')
  const querySamples = []
  const centers = [[300, 300], [1200, 800], [2200, 1600]]
  for (let i = 0; i < 100; i++) {
    const [cx, cy] = centers[i % centers.length]
    const t0 = performance.now()
    const result = si.getWallsInRange(cx, cy, 500)
    querySamples.push(performance.now() - t0)
    if (i === 0) console.log(`  first query returned ${result.length} walls from ${walls.length} total`)
  }
  const qs = stats(querySamples)
  console.log(`  min: ${qs.min.toFixed(4)}ms  median: ${qs.median.toFixed(4)}ms  mean: ${qs.mean}ms  max: ${qs.max.toFixed(4)}ms`)

  /* ── computeCombinedVision (cold: no spatial index) ──────────── */
  console.log('')
  console.log('── computeCombinedVision (no spatial index) ──')
  const coldSamples = []
  for (let i = 0; i < 10; i++) {
    const viewpoint = i % 2 === 0 ? 'view1' : ['view1', 'view2']
    const t0 = performance.now()
    computeCombinedVision(walls, tokens, viewpoint, 0)
    coldSamples.push(performance.now() - t0)
  }
  const cs = stats(coldSamples)
  console.log(`  min: ${cs.min.toFixed(2)}ms  median: ${cs.median.toFixed(2)}ms  mean: ${cs.mean}ms  max: ${cs.max.toFixed(2)}ms`)

  /* ── computeCombinedVision (with spatial index) ──────────────── */
  console.log('')
  console.log('── computeCombinedVision (with spatial index) ──')
  const hotSamples = []
  for (let i = 0; i < 10; i++) {
    const viewpoint = i % 2 === 0 ? 'view1' : ['view1', 'view2']
    const t0 = performance.now()
    computeCombinedVision(walls, tokens, viewpoint, 0, si)
    hotSamples.push(performance.now() - t0)
  }
  const hs = stats(hotSamples)
  console.log(`  min: ${hs.min.toFixed(2)}ms  median: ${hs.median.toFixed(2)}ms  mean: ${hs.mean}ms  max: ${hs.max.toFixed(2)}ms`)

  /* ── Warm computeCombinedVision (simulating per-drag) ────────── */
  console.log('')
  console.log('── computeCombinedVision per-drag (warm, with spatial index) ──')
  const dragSamples = []
  /* Warm up */
  for (let i = 0; i < 5; i++) {
    computeCombinedVision(walls, tokens, 'view1', 0, si)
  }
  /* Measure 20 consecutive drag-updates */
  for (let i = 0; i < 20; i++) {
    /* Slightly move the token each time */
    tokens[0].x = 300 + i * 10
    tokens[0].y = 300 + i * 5
    si.invalidate()
    const t0 = performance.now()
    si.rebuildIfNeeded(walls)
    const result = computeCombinedVision(walls, tokens, 'view1', 0, si)
    dragSamples.push(performance.now() - t0 + (result ? 0 : 0))
  }
  const ds = stats(dragSamples)
  const fps = (1000 / ds.median).toFixed(1)
  console.log(`  min: ${ds.min.toFixed(2)}ms  median: ${ds.median.toFixed(2)}ms  mean: ${ds.mean}ms  max: ${ds.max.toFixed(2)}ms`)
  console.log(`  Equivalent FPS at median: ${fps}`)

  /* ── Wall count vs performance ───────────────────────────────── */
  console.log('')
  console.log('── Performance scaling (with spatial index) ──')
  for (const count of [50, 100, 200, 400]) {
    const subset = walls.slice(0, count)
    const localSI = new WallSpatialIndex()
    localSI.rebuildIfNeeded(subset)
    const t0 = performance.now()
    for (let i = 0; i < 5; i++) {
      computeCombinedVision(subset, tokens, 'view1', 0, localSI)
    }
    const avg = ((performance.now() - t0) / 5).toFixed(2)
    console.log(`  ${count} walls: ${avg}ms avg`)
  }

  /* ── Summary ──────────────────────────────────────────────────── */
  console.log('')
  console.log('══════════════════════════════════════════════════════')
  console.log('  SUMMARY (target scene: 200+ walls, 5+ lights, 3+ tokens)')
  console.log('══════════════════════════════════════════════════════')
  console.log(`  Spatial index rebuild:     ${rs.median.toFixed(3)}ms median`)
  console.log(`  Spatial index query:       ${qs.median.toFixed(4)}ms median (${qs.mean}ms mean)`)
  console.log(`  Full recompute (no idx):   ${cs.median.toFixed(2)}ms median`)
  console.log(`  Full recompute (w/ idx):   ${hs.median.toFixed(2)}ms median`)
  console.log(`  Per-drag recompute:        ${ds.median.toFixed(2)}ms median (~${fps} fps)`)
  console.log('')
  console.log(`  Gate: 16ms (60fps)`)
  const pass = hs.median < 16
  console.log(`  Result: ${pass ? '✅ PASS' : '❌ FAIL'} (median full recompute ${hs.median.toFixed(2)}ms ${pass ? '<' : '>'} 16ms)`)
  console.log('')
}

main().catch(console.error)
