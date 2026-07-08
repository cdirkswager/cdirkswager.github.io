import { run, newId, now } from "../_db.js"

export async function onRequest(context) {
  const { request, env } = context
  try {
    if (request.method === "POST") {
      const b = await request.json()
      if (!b.player_id) return Response.json({ error: "player_id required" }, { status: 400 })
      const id = newId()
      const ts = now()
      await run(
        env,
        `INSERT INTO player_resources
          (id, player_id, name, resource_type, slot_level, current_value, max_value,
           recovery_type, weight_damage_boost, weight_damage_reduction, weight_healing,
           display_order, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id, b.player_id, b.name ?? "Resource", b.resource_type ?? "numeric",
          b.slot_level ?? null, b.current_value ?? b.max_value ?? 0, b.max_value ?? 0,
          b.recovery_type ?? "long_rest", b.weight_damage_boost ?? 0,
          b.weight_damage_reduction ?? 0, b.weight_healing ?? 0,
          b.display_order ?? 0, ts, ts,
        ]
      )
      return Response.json({ id }, { status: 201 })
    }

    if (request.method === "PATCH") {
      const b = await request.json()
      if (!b.id) return Response.json({ error: "id required" }, { status: 400 })
      const fields = []
      const params = []
      const allowed = [
        "name", "current_value", "max_value", "recovery_type",
        "weight_damage_boost", "weight_damage_reduction", "weight_healing", "display_order",
      ]
      for (const k of allowed) {
        if (k in b) { fields.push(`${k} = ?`); params.push(b[k]) }
      }
      if (fields.length === 0) return Response.json({ error: "no fields" }, { status: 400 })
      fields.push("updated_at = ?"); params.push(now())
      params.push(b.id)
      await run(env, `UPDATE player_resources SET ${fields.join(", ")} WHERE id = ?`, params)
      return Response.json({ ok: true })
    }

    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id")
      if (!id) return Response.json({ error: "id required" }, { status: 400 })
      await run(env, "DELETE FROM player_resources WHERE id = ?", [id])
      return Response.json({ ok: true })
    }

    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 })
  } catch (e) {
    return Response.json({ ok: false, error: e.message || "Internal error" }, { status: 500 })
  }
}
