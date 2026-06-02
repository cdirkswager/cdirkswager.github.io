export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    const now = Date.now()
    const hourKey = 'usage:' + new Date(now).toISOString().slice(0, 13)

    async function getUsage() {
      const raw = await env.HUNT_USAGE.get(hourKey)
      return raw ? JSON.parse(raw) : { reads: 0, writes: 0 }
    }

    async function saveUsage(u) {
      const ttl = 3600 - Math.floor((now / 1000) % 3600)
      await env.HUNT_USAGE.put(hourKey, JSON.stringify(u), { expirationTtl: ttl + 600 })
    }

    if (url.pathname === '/data') {
      if (request.method === 'GET') {
        const data = await env.HUNT_DATA.get('campaign-data', { type: 'json' })
        const usage = await getUsage()
        usage.reads++
        await saveUsage(usage)
        return new Response(JSON.stringify(data || { campaign: {}, users: [], requests: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (request.method === 'PUT') {
        const apiKey = request.headers.get('X-API-Key')
        if (!apiKey || apiKey !== env.API_KEY) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const body = await request.json()
        await env.HUNT_DATA.put('campaign-data', JSON.stringify(body))
        const usage = await getUsage()
        usage.writes++
        await saveUsage(usage)
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (url.pathname === '/usage' && request.method === 'GET') {
      const apiKey = request.headers.get('X-API-Key')
      if (!apiKey || apiKey !== env.API_KEY) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const usage = await getUsage()
      return new Response(JSON.stringify({
        reads: usage.reads,
        writes: usage.writes,
        limit: 5000,
        periodStart: new Date(now).toISOString().slice(0, 13),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not found', { status: 404, headers: corsHeaders })
  },
}
