import { all, first, run, newId, now, getOrCreateCampaign } from "./_db.js"

const EPSILON = 1e-9

function fractionRemaining(r) {
  if (r.max_value <= 0) return 0
  return Math.max(0, Math.min(1, r.current_value / r.max_value))
}

function categoryAggregate(resources, weightKey) {
  let contribution = 0
  let maxContribution = 0
  for (const r of resources) {
    const w = r[weightKey]
    if (w <= 0) continue
    maxContribution += w
    contribution += fractionRemaining(r) * w
  }
  return { contribution, maxContribution }
}

function pct(contribution, maxContribution) {
  if (maxContribution < EPSILON) return 100
  return Math.round((contribution / maxContribution) * 100)
}

function scoreResources(resources) {
  const off = categoryAggregate(resources, "weight_damage_boost")
  const def = categoryAggregate(resources, "weight_damage_reduction")
  const sus = categoryAggregate(resources, "weight_healing")
  return {
    offense: pct(off.contribution, off.maxContribution),
    defense: pct(def.contribution, def.maxContribution),
    sustain: pct(sus.contribution, sus.maxContribution),
  }
}

function blendOverall(scores, w) {
  const total = w.offense + w.defense + w.healing
  if (total < EPSILON) return Math.round((scores.offense + scores.defense + scores.sustain) / 3)
  return Math.round(
    (scores.offense * w.offense +
      scores.defense * w.defense +
      scores.sustain * w.healing) / total
  )
}

function exhaustionMultiplier(level) {
  const table = [1.0, 0.95, 0.85, 0.65, 0.45, 0.25, 0.0]
  const clamped = Math.max(0, Math.min(6, Math.round(level)))
  return table[clamped]
}

function resourcesRemainingPct(resources) {
  const pools = resources.filter(r => r.max_value > 0)
  if (pools.length === 0) return 100
  const sum = pools.reduce((acc, r) => acc + fractionRemaining(r), 0)
  return Math.round((sum / pools.length) * 100)
}

function shortRestHelps(all) {
  const shortRest = all.filter(r => r.recovery_type === "short_rest" && r.max_value > 0)
  const longRest = all.filter(r => r.recovery_type === "long_rest" && r.max_value > 0)
  if (shortRest.length === 0) return false
  const shortAvg = shortRest.reduce((a, r) => a + fractionRemaining(r), 0) / shortRest.length
  const longAvg = longRest.length === 0
    ? 1
    : longRest.reduce((a, r) => a + fractionRemaining(r), 0) / longRest.length
  return shortAvg < 0.5 && longAvg - shortAvg > 0.2
}

function riskFromOverall(overall) {
  if (overall > 75) return { tier: "well_rested", label: "Well Rested", color: "ok", guidance: "Push hard. The party can take it.", safeEncounter: "Hard / Deadly within reach" }
  if (overall > 50) return { tier: "engaged", label: "Engaged", color: "warn", guidance: "Good stakes. Watch HP and concentration.", safeEncounter: "Medium comfortably, Hard with risk" }
  if (overall > 25) return { tier: "tested", label: "Tested", color: "risk", guidance: "Real danger. Every decision matters now.", safeEncounter: "Easy safely, Medium is risky" }
  return { tier: "critical", label: "Critical", color: "crit", guidance: "Back off or finish it. TPK territory.", safeEncounter: "Even Easy is dangerous — consider a rest" }
}

function computeEffectiveness(party, weights, opts) {
  const partyWithHP = party.map(({ player, resources }) => ({
    player,
    resources: [
      {
        max_value: player.max_hp || 1,
        current_value: player.current_hp ?? player.max_hp ?? 0,
        weight_damage_boost: 0,
        weight_damage_reduction: 1,
        weight_healing: 1,
        recovery_type: 'long_rest',
      },
      ...resources,
    ],
  }))

  const allResources = partyWithHP.flatMap(p => p.resources)
  const category = scoreResources(allResources)

  const perPlayer = partyWithHP.map(({ player, resources }) => {
    const scores = scoreResources(resources)
    let overall = blendOverall(scores, weights)
    overall = Math.round(overall * exhaustionMultiplier(player.exhaustion_level))
    const fails = opts?.deathSaveFailures?.[player.id] ?? 0
    if (fails >= 2) overall = Math.round(overall * 0.5)
    else if (fails === 1) overall = Math.round(overall * 0.8)
    return {
      playerId: player.id,
      name: player.name,
      scores,
      overall,
      resourcesRemainingPct: resourcesRemainingPct(resources),
    }
  })

  const overall = perPlayer.length === 0
    ? overallRaw
    : Math.round(perPlayer.reduce((a, p) => a + p.overall, 0) / perPlayer.length)

  let spotlightPlayerId = null
  let depletedPlayerId = null
  if (perPlayer.length > 0) {
    const sorted = [...perPlayer].sort((a, b) => b.resourcesRemainingPct - a.resourcesRemainingPct)
    spotlightPlayerId = sorted[0].playerId
    depletedPlayerId = sorted[sorted.length - 1].playerId
    if (sorted[sorted.length - 1].resourcesRemainingPct > 40) depletedPlayerId = null
  }

  return {
    category,
    overall,
    overallRaw,
    risk: riskFromOverall(overall),
    perPlayer,
    spotlightPlayerId,
    depletedPlayerId,
    shortRestWouldHelp: shortRestHelps(allResources),
  }
}

export async function onRequest(context) {
  const { request, env } = context
  try {
    if (request.method === "GET") {
      const campaign = await getOrCreateCampaign(env)
      const session = await first(
        env,
        "SELECT * FROM combat_sessions WHERE campaign_id = ? AND state != 'ended' ORDER BY started_at DESC LIMIT 1",
        [campaign.id]
      )

      let combatants = []
      if (session) {
        combatants = await all(
          env,
          "SELECT * FROM combatants WHERE combat_session_id = ? ORDER BY display_order, initiative DESC",
          [session.id]
        )
      }

      const players = await all(
        env,
        "SELECT * FROM players WHERE campaign_id = ? ORDER BY display_order, name",
        [campaign.id]
      )
      const resources = await all(
        env,
        `SELECT pr.* FROM player_resources pr JOIN players p ON p.id = pr.player_id WHERE p.campaign_id = ?`,
        [campaign.id]
      )
      const resByPlayer = {}
      for (const r of resources) (resByPlayer[r.player_id] ??= []).push(r)

      const deathSaveFailures = {}
      for (const c of combatants) {
        if (c.is_player && c.player_id) deathSaveFailures[c.player_id] = c.death_saves_failures
      }

      const gauge = computeEffectiveness(
        players.map(p => ({ player: p, resources: resByPlayer[p.id] ?? [] })),
        { offense: campaign.weight_offense, defense: campaign.weight_defense, healing: campaign.weight_healing },
        { deathSaveFailures }
      )

      return Response.json({
        campaign, session, combatants, gauge,
        players: players.map(p => ({ ...p, resources: resByPlayer[p.id] ?? [] })),
      })
    }

    if (request.method === "POST") {
      const campaign = await getOrCreateCampaign(env)
      const b = await request.json().catch(() => ({}))
      const id = newId()
      const ts = now()
      await run(
        env,
        `INSERT INTO combat_sessions (id, campaign_id, encounter_id, session_id, round, current_turn_index, state, started_at, ended_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, campaign.id, b.encounter_id ?? null, null, 1, 0, "active", ts, null]
      )
      return Response.json({ id }, { status: 201 })
    }

    if (request.method === "PATCH") {
      const b = await request.json()
      if (!b.id) return Response.json({ error: "id required" }, { status: 400 })
      const fields = []
      const params = []
      if (b.round !== undefined) { fields.push("round = ?"); params.push(b.round) }
      if (b.current_turn_index !== undefined) { fields.push("current_turn_index = ?"); params.push(b.current_turn_index) }
      if (b.state !== undefined) {
        fields.push("state = ?"); params.push(b.state)
        if (b.state === "ended") { fields.push("ended_at = ?"); params.push(now()) }
      }
      if (fields.length === 0) return Response.json({ error: "no fields" }, { status: 400 })
      params.push(b.id)
      await run(env, `UPDATE combat_sessions SET ${fields.join(", ")} WHERE id = ?`, params)
      return Response.json({ ok: true })
    }

    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 })
  } catch (e) {
    return Response.json({ ok: false, error: e.message || "Internal error" }, { status: 500 })
  }
}
