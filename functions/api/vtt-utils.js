const KV_KEY_PRIVATE = 'vtt:privateKey'
const KV_KEY_PUBLIC = 'vtt:publicKey'
const KV_KEY_PUBLIC_JWK = 'vtt:publicJwk'

const TOKEN_TTL = 3600 // 1 hour

function base64Url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Uint8Array.from(atob(str), c => c.charCodeAt(0))
}

function textEncode(s) {
  return new TextEncoder().encode(s)
}

function pemToBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s/g, '')
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer
}

// Load RSA keypair from CF secrets (PEM) or fall back to KV auto-generation
async function getKeys(env) {
  // Priority 1: PEM secrets (VTT_PRIVATE_KEY / VTT_PUBLIC_KEY)
  if (env.VTT_PRIVATE_KEY && env.VTT_PUBLIC_KEY) {
    const privateKey = await crypto.subtle.importKey(
      'pkcs8', pemToBuffer(env.VTT_PRIVATE_KEY),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
    )
    const publicKey = await crypto.subtle.importKey(
      'spki', pemToBuffer(env.VTT_PUBLIC_KEY),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']
    )
    const publicJwk = await crypto.subtle.exportKey('jwk', publicKey)
    return { privateKey, publicKey, publicJwk }
  }

  // Priority 2: cached JWK in KV
  let privateJwk = await env.HUNT_DATA.get(KV_KEY_PRIVATE, { type: 'json' })
  let publicJwk = await env.HUNT_DATA.get(KV_KEY_PUBLIC, { type: 'json' })

  if (privateJwk && publicJwk) {
    const privateKey = await crypto.subtle.importKey(
      'jwk', privateJwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
    )
    const publicKey = await crypto.subtle.importKey(
      'jwk', publicJwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']
    )
    return { privateKey, publicKey, publicJwk }
  }

  // Priority 3: generate new keypair on first use
  const keypair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']
  )

  privateJwk = await crypto.subtle.exportKey('jwk', keypair.privateKey)
  publicJwk = await crypto.subtle.exportKey('jwk', keypair.publicKey)

  await env.HUNT_DATA.put(KV_KEY_PRIVATE, JSON.stringify(privateJwk))
  await env.HUNT_DATA.put(KV_KEY_PUBLIC, JSON.stringify(publicJwk))

  return { privateKey: keypair.privateKey, publicKey: keypair.publicKey, publicJwk }
}

export async function signVttToken(session, env) {
  const { privateKey } = await getKeys(env)

  const header = { alg: 'RS256', typ: 'JWT', kid: 'vtt-v1' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: session.userId,
    username: session.username,
    role: session.role,
    playerId: session.playerId || null,
    iat: now,
    exp: now + TOKEN_TTL,
    iss: 'hunt-website',
  }

  const enc = (obj) => base64Url(textEncode(JSON.stringify(obj)))
  const message = enc(header) + '.' + enc(payload)
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, textEncode(message))

  return message + '.' + base64Url(new Uint8Array(sig))
}

export async function getJwks(env) {
  const { publicJwk } = await getKeys(env)

  return {
    keys: [{
      kty: 'RSA',
      kid: 'vtt-v1',
      use: 'sig',
      alg: 'RS256',
      n: publicJwk.n,
      e: publicJwk.e,
    }],
  }
}
