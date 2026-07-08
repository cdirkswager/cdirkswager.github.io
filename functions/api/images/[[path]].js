function getCookieValue(request, name) {
  const cookie = request.headers.get('Cookie')
  if (!cookie) return null
  const match = cookie.match(new RegExp('(?:^|;)\\s*' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[1]) : null
}

async function getSession(env, token) {
  if (!token) return null
  return await env.HUNT_DATA.get('session:' + token, { type: 'json' })
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const imagePath = url.pathname.replace('/api/images/', '')

  if (!imagePath) {
    return new Response('Not found', { status: 404 })
  }

  const sessionToken = getCookieValue(request, 'session') || request.headers.get('X-Session-Token')
  const session = await getSession(env, sessionToken)

  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const parts = imagePath.split('/')
  const playerId = parts[0]

  if (session.role !== 'dm' && session.playerId !== playerId) {
    return new Response('Forbidden', { status: 403 })
  }

  try {
    const object = await env.HUNT_STORAGE.get('images/' + imagePath)
    if (!object) {
      return new Response('Not found', { status: 404 })
    }

    const headers = {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    }

    return new Response(object.body, { headers })
  } catch (e) {
    return new Response('Internal error', { status: 500 })
  }
}
