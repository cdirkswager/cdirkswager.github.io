import { all, getOrCreateCampaign } from "./_db.js"

export async function onRequest(context) {
  const { request, env } = context
  try {
    const url = new URL(request.url)
    const q = url.searchParams.get("q") || ""
    if (!q.trim()) return Response.json({ monster: [], npc: [], player: [] })

    const campaign = await getOrCreateCampaign(env)
    const like = `%${q}%`

    const [monsters, npcs, players] = await Promise.all([
      all(env, "SELECT id, name, cr, monster_type AS type FROM monsters WHERE name LIKE ? ORDER BY name LIMIT 10", [like]),
      all(env, "SELECT id, name, role AS type FROM npcs WHERE campaign_id = ? AND name LIKE ? ORDER BY name LIMIT 10", [campaign.id, like]),
      all(env, "SELECT id, name, class AS type FROM players WHERE campaign_id = ? AND name LIKE ? ORDER BY name LIMIT 10", [campaign.id, like]),
    ])

    return Response.json({ monster: monsters, npc: npcs, player: players })
  } catch (e) {
    return Response.json({ monster: [], npc: [], player: [] })
  }
}
