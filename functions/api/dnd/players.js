import { all, first, run, newId, now, getOrCreateCampaign } from "./_db.js"

export async function onRequest(context) {
  const { request, env } = context
  try {
    if (request.method === "GET") {
      const campaign = await getOrCreateCampaign(env)
      const players = await all(
        env,
        "SELECT * FROM players WHERE campaign_id = ? ORDER BY display_order, name",
        [campaign.id]
      )
      const resources = await all(
        env,
        `SELECT pr.* FROM player_resources pr
         JOIN players p ON p.id = pr.player_id
         WHERE p.campaign_id = ?
         ORDER BY pr.display_order, pr.name`,
        [campaign.id]
      )
      const byPlayer = {}
      for (const r of resources) {
        (byPlayer[r.player_id] ??= []).push(r)
      }
      return Response.json({
        campaign,
        players: players.map(p => ({ ...p, resources: byPlayer[p.id] ?? [] })),
      })
    }

    if (request.method === "POST") {
      const campaign = await getOrCreateCampaign(env)
      const body = await request.json()
      const id = newId()
      const ts = now()
      await run(
        env,
         `INSERT INTO players
          (id, campaign_id, name, class, subclass, level, race, ac, max_hp, current_hp,
           passive_perception, passive_investigation, passive_insight,
           exhaustion_level, languages, notable_abilities, display_order,
           is_active, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
         [
            id, campaign.id, body.name ?? "New Player", body.class ?? null,
           body.subclass ?? null, body.level ?? 1, body.race ?? null, body.ac ?? null,
           body.max_hp ?? 10, body.current_hp ?? body.max_hp ?? 10, body.passive_perception ?? null,
          body.passive_investigation ?? null, body.passive_insight ?? null,
          body.exhaustion_level ?? 0, body.languages ?? null,
           body.notable_abilities ?? null, body.display_order ?? 0,
           body.is_active ?? 1, ts, ts,
        ]
      )
      return Response.json({ id }, { status: 201 })
    }

    if (request.method === "PATCH") {
      const body = await request.json()
      if (!body.id) return Response.json({ error: "id required" }, { status: 400 })

      const fields = []
      const params = []
       const allowed = [
         "name", "class", "subclass", "level", "race", "ac", "max_hp", "current_hp",
         "passive_perception", "passive_investigation", "passive_insight",
         "exhaustion_level", "languages", "notable_abilities", "display_order",
         "is_active",
       ]
      for (const k of allowed) {
        if (k in body) { fields.push(`${k} = ?`); params.push(body[k]) }
      }
      if (fields.length === 0) return Response.json({ error: "no fields" }, { status: 400 })
      fields.push("updated_at = ?"); params.push(now())
      params.push(body.id)
      await run(env, `UPDATE players SET ${fields.join(", ")} WHERE id = ?`, params)
      return Response.json({ ok: true })
    }

    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id")
      if (!id) return Response.json({ error: "id required" }, { status: 400 })
      await run(env, "DELETE FROM combatants WHERE player_id = ?", [id])
      await run(env, "DELETE FROM players WHERE id = ?", [id])
      return Response.json({ ok: true })
    }

    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 })
  } catch (e) {
    return Response.json({ ok: false, error: e.message || "Internal error" }, { status: 500 })
  }
}
