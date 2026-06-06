import { getOrCreateCampaign } from "./_db.js"

export async function onRequest(context) {
  const { request, env } = context
  try {
    if (request.method === "GET") {
      const campaign = await getOrCreateCampaign(env)
      return Response.json({ campaign })
    }

    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 })
  } catch (e) {
    return Response.json({ ok: false, error: e.message || "Internal error" }, { status: 500 })
  }
}
