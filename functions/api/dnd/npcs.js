import { all, first, run, newId, now, getOrCreateCampaign } from "./_db.js"

export async function onRequest(context) {
  const { request, env } = context
  try {
    if (request.method === "GET") {
      const url = new URL(request.url)
      const id = url.searchParams.get("id")
      const campaign = await getOrCreateCampaign(env)

      if (id) {
        const npc = await first(env, "SELECT * FROM npcs WHERE id = ?", [id])
        if (!npc) return Response.json({ error: "not found" }, { status: 404 })
        const notes = await all(
          env,
          "SELECT * FROM npc_notes WHERE npc_id = ? ORDER BY created_at DESC",
          [id]
        )
        return Response.json({ ...npc, notes })
      }

      const where = ["campaign_id = ?"]
      const params = [campaign.id]
      for (const key of ["status", "location", "relationship", "faction"]) {
        const v = url.searchParams.get(key)
        if (v) { where.push(`${key} = ?`); params.push(v) }
      }
      const npcs = await all(
        env,
        `SELECT * FROM npcs WHERE ${where.join(" AND ")} ORDER BY name`,
        params
      )
      return Response.json({ npcs })
    }

    if (request.method === "POST") {
      const campaign = await getOrCreateCampaign(env)
      const b = await request.json()
      const id = newId()
      const ts = now()
      await run(
        env,
        `INSERT INTO npcs
          (id, campaign_id, monster_id, name, role, faction, location, status,
           relationship, portrait_url, description, rp_notes, ac_override, hp_max_override,
           created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id, campaign.id, b.monster_id ?? null, b.name ?? "New NPC", b.role ?? null,
          b.faction ?? null, b.location ?? null, b.status ?? "alive",
          b.relationship ?? "unknown", b.portrait_url ?? null, b.description ?? null,
          b.rp_notes ?? null, b.ac_override ?? null, b.hp_max_override ?? null, ts, ts,
        ]
      )
      return Response.json({ id }, { status: 201 })
    }

    if (request.method === "PATCH") {
      const b = await request.json()
      if (!b.id) return Response.json({ error: "id required" }, { status: 400 })

      if (b._note) {
        await run(
          env,
          "INSERT INTO npc_notes (id, npc_id, session_id, note, created_at) VALUES (?,?,?,?,?)",
          [newId(), b.id, null, b._note, now()]
        )
        return Response.json({ ok: true, note: true })
      }

      const fields = []
      const params = []
      const allowed = [
        "name", "role", "faction", "location", "status", "relationship",
        "portrait_url", "description", "rp_notes", "ac_override", "hp_max_override",
      ]
      for (const k of allowed) {
        if (k in b) { fields.push(`${k} = ?`); params.push(b[k]) }
      }
      if (fields.length === 0) return Response.json({ error: "no fields" }, { status: 400 })
      fields.push("updated_at = ?"); params.push(now())
      params.push(b.id)
      await run(env, `UPDATE npcs SET ${fields.join(", ")} WHERE id = ?`, params)
      return Response.json({ ok: true })
    }

    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id")
      if (!id) return Response.json({ error: "id required" }, { status: 400 })
      await run(env, "DELETE FROM npcs WHERE id = ?", [id])
      return Response.json({ ok: true })
    }

    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 })
  } catch (e) {
    return Response.json({ ok: false, error: e.message || "Internal error" }, { status: 500 })
  }
}
