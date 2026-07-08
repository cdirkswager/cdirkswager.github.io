export function newId() { return crypto.randomUUID() }
export function now() { return Date.now() }

export async function all(env, sql, params = []) {
  const { results } = await env.HUNT_DB.prepare(sql).bind(...params).all()
  return results ?? []
}

export async function first(env, sql, params = []) {
  return await env.HUNT_DB.prepare(sql).bind(...params).first()
}

export async function run(env, sql, params = []) {
  await env.HUNT_DB.prepare(sql).bind(...params).run()
}

export async function batch(env, statements) {
  const prepared = statements.map(s => env.HUNT_DB.prepare(s.sql).bind(...(s.params ?? [])))
  await env.HUNT_DB.batch(prepared)
}

export async function getOrCreateCampaign(env) {
  const existing = await first(env, "SELECT * FROM campaigns ORDER BY created_at ASC LIMIT 1")
  if (existing) return existing

  const id = newId()
  const ts = now()
  await run(
    env,
    `INSERT INTO campaigns (id, name, weight_offense, weight_defense, weight_healing, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, "My Campaign", 0.34, 0.33, 0.33, ts, ts]
  )
  return {
    id,
    name: "My Campaign",
    weight_offense: 0.34,
    weight_defense: 0.33,
    weight_healing: 0.33,
    created_at: ts,
    updated_at: ts,
  }
}
