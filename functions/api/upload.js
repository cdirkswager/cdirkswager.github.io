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
  const sessionToken = getCookieValue(request, 'session') || request.headers.get('X-Session-Token')
  const session = await getSession(env, sessionToken)

  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const contentType = request.headers.get('Content-Type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return new Response(JSON.stringify({ ok: false, error: 'Expected multipart/form-data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const playerId = formData.get('playerId') || session.playerId

    if (!file || !file.name) {
      return new Response(JSON.stringify({ ok: false, error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (session.role !== 'dm' && session.playerId !== playerId) {
      return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid file type. Allowed: jpg, png, gif, webp, avif' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (file.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ ok: false, error: 'File too large. Max 10MB' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const ext = file.name.split('.').pop().toLowerCase() || 'jpg'
    const key = `images/${playerId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`

    const buffer = await file.arrayBuffer()
    await env.HUNT_STORAGE.put(key, buffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: { uploadedBy: session.username, playerId: playerId },
    })

    const url = `/api/images/${key.replace(/^images\//, '')}`

    return new Response(JSON.stringify({ ok: true, url }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message || 'Upload failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
