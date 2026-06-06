import { first, run, batch, newId } from "../_db.js"

const insertSql = `INSERT INTO combatants
  (id, combat_session_id, player_id, monster_id, npc_id, display_name, initiative,
   display_order, hp_current, hp_max, hp_temp, ac, is_player, is_concentrating,
   concentration_spell, has_used_reaction, is_readied, readied_trigger,
   legendary_actions_remaining, death_saves_successes, death_saves_failures, conditions)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`

export async function onRequest(context) {
  const { request, env } = context
  try {
    if (request.method === "POST") {
      const b = await request.json()
      if (!b.combat_session_id) return Response.json({ error: "combat_session_id required" }, { status: 400 })

      const stmts = []

      if (b.source === "player" && b.ref_id) {
        const p = await first(env, "SELECT * FROM players WHERE id = ?", [b.ref_id])
        if (!p) return Response.json({ error: "player not found" }, { status: 404 })
        stmts.push({
          sql: insertSql,
          params: [
            newId(), b.combat_session_id, p.id, null, null, p.name, b.initiative ?? 10,
            0, p.max_hp, p.max_hp, 0, p.ac, 1, 0, null, 0, 0, null, 0, 0, 0, "[]",
          ],
        })
      } else if (b.source === "monster" && b.ref_id) {
        const m = await first(env, "SELECT * FROM monsters WHERE id = ?", [b.ref_id])
        if (!m) return Response.json({ error: "monster not found" }, { status: 404 })
        const qty = Math.max(1, b.quantity ?? 1)
        for (let i = 0; i < qty; i++) {
          const suffix = qty > 1 ? ` ${String.fromCharCode(65 + i)}` : ""
          stmts.push({
            sql: insertSql,
            params: [
              newId(), b.combat_session_id, null, m.id, null, `${m.name}${suffix}`,
              b.initiative ?? 10, 0, m.hp_max, m.hp_max, 0, m.ac, 0, 0, null, 0, 0, null,
              m.legendary_action_count, 0, 0, "[]",
            ],
          })
        }
      } else if (b.source === "npc" && b.ref_id) {
        const n = await first(env, "SELECT * FROM npcs WHERE id = ?", [b.ref_id])
        if (!n) return Response.json({ error: "npc not found" }, { status: 404 })
        let hp = n.hp_max_override ?? 10
        let ac = n.ac_override ?? null
        if (n.monster_id) {
          const m = await first(env, "SELECT * FROM monsters WHERE id = ?", [n.monster_id])
          if (m) { hp = n.hp_max_override ?? m.hp_max; ac = n.ac_override ?? m.ac }
        }
        stmts.push({
          sql: insertSql,
          params: [
            newId(), b.combat_session_id, null, n.monster_id, n.id, n.name, b.initiative ?? 10,
            0, hp, hp, 0, ac, 0, 0, null, 0, 0, null, 0, 0, 0, "[]",
          ],
        })
      } else if (b.source === "custom") {
        stmts.push({
          sql: insertSql,
          params: [
            newId(), b.combat_session_id, null, null, null, b.display_name ?? "Combatant",
            b.initiative ?? 10, 0, b.hp ?? 10, b.hp ?? 10, 0, b.ac ?? null, 0, 0, null,
            0, 0, null, 0, 0, 0, "[]",
          ],
        })
      } else {
        return Response.json({ error: "invalid source" }, { status: 400 })
      }

      await batch(env, stmts)
      return Response.json({ ok: true, added: stmts.length }, { status: 201 })
    }

    if (request.method === "PATCH") {
      const b = await request.json()
      if (!b.id) return Response.json({ error: "id required" }, { status: 400 })
      const fields = []
      const params = []
      const allowed = [
        "display_name", "initiative", "display_order", "hp_current", "hp_max", "hp_temp",
        "ac", "is_concentrating", "concentration_spell", "has_used_reaction", "is_readied",
        "readied_trigger", "legendary_actions_remaining", "death_saves_successes",
        "death_saves_failures", "conditions",
      ]
      for (const k of allowed) {
        if (k in b) { fields.push(`${k} = ?`); params.push(b[k]) }
      }
      if (fields.length === 0) return Response.json({ error: "no fields" }, { status: 400 })
      params.push(b.id)
      await run(env, `UPDATE combatants SET ${fields.join(", ")} WHERE id = ?`, params)
      return Response.json({ ok: true })
    }

    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id")
      if (!id) return Response.json({ error: "id required" }, { status: 400 })
      await run(env, "DELETE FROM combatants WHERE id = ?", [id])
      return Response.json({ ok: true })
    }

    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 })
  } catch (e) {
    return Response.json({ ok: false, error: e.message || "Internal error" }, { status: 500 })
  }
}
