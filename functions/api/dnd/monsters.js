import { all, first, run, batch, newId, now } from "./_db.js"

export async function onRequest(context) {
  const { request, env } = context
  try {
    if (request.method === "GET") {
      const url = new URL(request.url)
      const id = url.searchParams.get("id")
      const q = url.searchParams.get("q")

      if (id) {
        const monster = await first(env, "SELECT * FROM monsters WHERE id = ?", [id])
        if (!monster) return Response.json({ error: "not found" }, { status: 404 })
        const actions = await all(
          env,
          "SELECT * FROM monster_actions WHERE monster_id = ? ORDER BY action_type, display_order",
          [id]
        )
        return Response.json({ ...monster, actions })
      }

      const monsters = q
        ? await all(env, "SELECT * FROM monsters WHERE name LIKE ? ORDER BY name LIMIT 50", [`%${q}%`])
        : await all(env, "SELECT * FROM monsters ORDER BY name LIMIT 200")
      return Response.json({ monsters })
    }

    if (request.method === "POST") {
      const b = await request.json()
      const id = newId()
      const ts = now()

      const stmts = [
        {
          sql: `INSERT INTO monsters
            (id, name, source, cr, xp, size, monster_type, alignment, ac, ac_notes,
             hp_max, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws,
             skills, damage_resistances, damage_immunities, damage_vulnerabilities,
             condition_immunities, senses, languages, passives, spell_dc,
             spell_attack_bonus, spells_available, description, rp_notes,
             bloodied_reminder, death_reminder, legendary_action_count,
             lair_action_count, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          params: [
            id, b.name ?? "New Monster", b.source ?? "custom", b.cr ?? null, b.xp ?? null,
            b.size ?? null, b.monster_type ?? null, b.alignment ?? null, b.ac ?? null,
            b.ac_notes ?? null, b.hp_max ?? 1, b.hp_formula ?? null, b.speed ?? null,
            b.str ?? null, b.dex ?? null, b.con ?? null, b.int ?? null, b.wis ?? null,
            b.cha ?? null, b.saving_throws ?? null, b.skills ?? null,
            b.damage_resistances ?? null, b.damage_immunities ?? null,
            b.damage_vulnerabilities ?? null, b.condition_immunities ?? null,
            b.senses ?? null, b.languages ?? null, b.passives ?? null, b.spell_dc ?? null,
            b.spell_attack_bonus ?? null, b.spells_available ?? null, b.description ?? null,
            b.rp_notes ?? null, b.bloodied_reminder ?? null, b.death_reminder ?? null,
            b.legendary_action_count ?? 0, b.lair_action_count ?? 0, ts, ts,
          ],
        },
      ]

      for (const a of b.actions ?? []) {
        stmts.push({
          sql: `INSERT INTO monster_actions
            (id, monster_id, action_type, name, attack_bonus, advantage_note, reach_range,
             avg_damage, damage_dice, damage_type, secondary_avg_damage, secondary_damage_dice,
             secondary_damage_type, save_dc, save_ability, description, display_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          params: [
            newId(), id, a.action_type ?? "action", a.name ?? "Attack", a.attack_bonus ?? null,
            a.advantage_note ?? null, a.reach_range ?? null, a.avg_damage ?? null,
            a.damage_dice ?? null, a.damage_type ?? null, a.secondary_avg_damage ?? null,
            a.secondary_damage_dice ?? null, a.secondary_damage_type ?? null,
            a.save_dc ?? null, a.save_ability ?? null, a.description ?? null, a.display_order ?? 0,
          ],
        })
      }

      await batch(env, stmts)
      return Response.json({ id }, { status: 201 })
    }

    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id")
      if (!id) return Response.json({ error: "id required" }, { status: 400 })
      await run(env, "DELETE FROM monsters WHERE id = ?", [id])
      return Response.json({ ok: true })
    }

    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 })
  } catch (e) {
    return Response.json({ ok: false, error: e.message || "Internal error" }, { status: 500 })
  }
}
