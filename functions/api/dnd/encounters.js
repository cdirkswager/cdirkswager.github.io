import { all, first, run, batch, newId, now, getOrCreateCampaign } from "./_db.js"

const XP_THRESHOLDS = {
  1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
  2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
  3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
  4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
  5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
  6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
  7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
  8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
  9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
  10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
  11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
  12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
  13: { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },
  14: { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },
  15: { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },
  16: { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },
  17: { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },
  18: { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },
  19: { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },
  20: { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 },
}

function encounterMultiplier(monsterCount) {
  if (monsterCount <= 1) return 1
  if (monsterCount === 2) return 1.5
  if (monsterCount <= 6) return 2
  if (monsterCount <= 10) return 2.5
  if (monsterCount <= 14) return 3
  return 4
}

function calcDifficulty(monsters, players) {
  if (players.length === 0) return null
  const count = monsters.reduce((a, m) => a + m.quantity, 0)
  const baseXp = monsters.reduce((a, m) => a + (m.xp ?? 0) * m.quantity, 0)
  const adjustedXp = Math.round(baseXp * encounterMultiplier(count))

  const sum = { easy: 0, medium: 0, hard: 0, deadly: 0 }
  for (const p of players) {
    const t = XP_THRESHOLDS[Math.max(1, Math.min(20, p.level))]
    sum.easy += t.easy; sum.medium += t.medium; sum.hard += t.hard; sum.deadly += t.deadly
  }
  let rating = "trivial"
  if (adjustedXp >= sum.deadly) rating = "deadly"
  else if (adjustedXp >= sum.hard) rating = "hard"
  else if (adjustedXp >= sum.medium) rating = "medium"
  else if (adjustedXp >= sum.easy) rating = "easy"

  return { rating, adjustedXp, thresholds: sum }
}

export async function onRequest(context) {
  const { request, env } = context
  try {
    if (request.method === "GET") {
      const url = new URL(request.url)
      const id = url.searchParams.get("id")
      const campaign = await getOrCreateCampaign(env)

      if (id) {
        const enc = await first(env, "SELECT * FROM encounters WHERE id = ?", [id])
        if (!enc) return Response.json({ error: "not found" }, { status: 404 })
        const monsters = await all(
          env,
          `SELECT em.*, m.name, m.xp FROM encounter_monsters em
           JOIN monsters m ON m.id = em.monster_id WHERE em.encounter_id = ?`,
          [id]
        )
        const players = await all(
          env,
          "SELECT * FROM players WHERE campaign_id = ?",
          [campaign.id]
        )
        const difficulty = calcDifficulty(monsters, players)
        return Response.json({ ...enc, monsters, difficulty })
      }

      const encounters = await all(
        env,
        "SELECT * FROM encounters WHERE campaign_id = ? ORDER BY updated_at DESC",
        [campaign.id]
      )
      return Response.json({ encounters })
    }

    if (request.method === "POST") {
      const campaign = await getOrCreateCampaign(env)
      const b = await request.json()
      const id = newId()
      const ts = now()
      const stmts = [
        {
          sql: `INSERT INTO encounters (id, campaign_id, scene_id, name, difficulty, notes, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?)`,
          params: [id, campaign.id, b.scene_id ?? null, b.name ?? "New Encounter", b.difficulty ?? null, b.notes ?? null, ts, ts],
        },
      ]
      for (const m of b.monsters ?? []) {
        stmts.push({
          sql: `INSERT INTO encounter_monsters (id, encounter_id, monster_id, quantity, hp_override, notes)
                VALUES (?,?,?,?,?,?)`,
          params: [newId(), id, m.monster_id, m.quantity ?? 1, null, null],
        })
      }
      await batch(env, stmts)
      return Response.json({ id }, { status: 201 })
    }

    if (request.method === "PATCH") {
      const b = await request.json()
      if (!b.id) return Response.json({ error: "id required" }, { status: 400 })

      if (b._addMonster) {
        const mId = b._addMonster.monster_id
        const qty = b._addMonster.quantity ?? 1
        await run(env,
          "INSERT INTO encounter_monsters (id, encounter_id, monster_id, quantity) VALUES (?,?,?,?)",
          [newId(), b.id, mId, qty]
        )
        return Response.json({ ok: true })
      }

      if (b._removeMonster) {
        await run(env, "DELETE FROM encounter_monsters WHERE id = ?", [b._removeMonster])
        return Response.json({ ok: true })
      }

      if (b._startCombat) {
        const enc = await first(env, "SELECT * FROM encounters WHERE id = ?", [b.id])
        if (!enc) return Response.json({ error: "encounter not found" }, { status: 404 })
        const csId = newId()
        const ts = now()
        await run(env,
          `INSERT INTO combat_sessions (id, campaign_id, encounter_id, round, current_turn_index, state, started_at)
           VALUES (?,?,?,?,?,?,?)`,
          [csId, enc.campaign_id, enc.id, 1, 0, "active", ts]
        )
        const monsters = await all(env,
          "SELECT em.*, m.name, m.hp_max, m.ac, m.legendary_action_count FROM encounter_monsters em JOIN monsters m ON m.id = em.monster_id WHERE em.encounter_id = ?",
          [b.id]
        )
        const stmts = monsters.flatMap(em => {
          const qty = em.quantity || 1
          return Array.from({ length: qty }, (_, i) => ({
            sql: `INSERT INTO combatants (id, combat_session_id, monster_id, display_name, initiative, display_order, hp_current, hp_max, hp_temp, ac, is_player, is_concentrating, has_used_reaction, is_readied, legendary_actions_remaining, death_saves_successes, death_saves_failures, conditions)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            params: [
              newId(), csId, em.monster_id, qty > 1 ? `${em.name} ${String.fromCharCode(65 + i)}` : em.name,
              10, 0, em.hp_max, em.hp_max, 0, em.ac, 0, 0, 0, 0, em.legendary_action_count ?? 0, 0, 0, "[]",
            ],
          }))
        })
        if (stmts.length > 0) await batch(env, stmts)
        return Response.json({ session_id: csId })
      }

      const fields = []
      const params = []
      const allowed = ["name", "difficulty", "notes", "scene_id"]
      for (const k of allowed) {
        if (k in b) { fields.push(`${k} = ?`); params.push(b[k]) }
      }
      if (fields.length === 0) return Response.json({ error: "no fields" }, { status: 400 })
      fields.push("updated_at = ?"); params.push(now())
      params.push(b.id)
      await run(env, `UPDATE encounters SET ${fields.join(", ")} WHERE id = ?`, params)
      return Response.json({ ok: true })
    }

    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id")
      if (!id) return Response.json({ error: "id required" }, { status: 400 })
      await run(env, "DELETE FROM encounter_monsters WHERE encounter_id = ?", [id])
      await run(env, "DELETE FROM encounters WHERE id = ?", [id])
      return Response.json({ ok: true })
    }

    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 })
  } catch (e) {
    return Response.json({ ok: false, error: e.message || "Internal error" }, { status: 500 })
  }
}
