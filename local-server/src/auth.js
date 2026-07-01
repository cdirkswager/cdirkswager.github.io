import { readFileSync, existsSync } from 'node:fs'
import crypto from 'node:crypto'

export function createAuthVerifier(config) {
  let publicKey = null
  let publicKeySource = 'none'

  function loadPublicKey() {
    if (config.publicKeyPath && existsSync(config.publicKeyPath)) {
      const pemStr = readFileSync(config.publicKeyPath, 'utf-8')
      publicKey = crypto.createPublicKey({ format: 'pem', key: pemStr })
      publicKeySource = 'local:' + config.publicKeyPath
      console.log('[auth] Public key loaded from local file:', config.publicKeyPath)
      return true
    }
    return false
  }

  async function fetchPublicKeyFromSite() {
    try {
      const jwksUrl = `${config.siteBaseUrl}/api/auth/vtt-jwks`
      console.log('[auth] Fetching JWKS from:', jwksUrl)
      const res = await fetch(jwksUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data?.keys?.[0]) {
        const key = data.keys[0]
        publicKey = crypto.createPublicKey({
          key: { kty: 'RSA', n: key.n, e: key.e },
          format: 'jwk',
        })
        publicKeySource = 'live-jwks:' + (key.kid || '?')
        console.log('[auth] Public key loaded from live JWKS (kid:', key.kid || '?', ')')
        return true
      }
    } catch (e) {
      console.error('[auth] Failed to fetch public key from site:', e.message)
    }
    return false
  }

  async function init() {
    console.log('[auth] Initializing with siteBaseUrl:', config.siteBaseUrl)
    const fetched = await fetchPublicKeyFromSite()
    if (!fetched) {
      console.log('[auth] Could not fetch from site, falling back to local key file...')
      loadPublicKey()
    }
  }

  function verifyToken(token) {
    if (!publicKey || !token) return null

    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        console.error('[auth] Token split failed: expected 3 parts, got', parts.length)
        return null
      }

      const [headerB64, payloadB64, sigB64] = parts
      const message = `${headerB64}.${payloadB64}`

      // Decode signature from base64url to raw bytes
      let sigBytes
      try {
        const decoded = sigB64.replace(/-/g, '+').replace(/_/g, '/')
        sigBytes = Buffer.from(decoded, 'base64')
      } catch (e) {
        console.error('[auth] Signature decode failed:', e.message)
        return null
      }

      // Verify signature
      let isValid = false
      try {
        isValid = crypto.verify(
          'RSA-SHA256',
          Buffer.from(message),
          publicKey,
          sigBytes
        )
      } catch (e) {
        console.error('[auth] Signature verification threw:', e.message)
        return null
      }

      if (!isValid) {
        // Decode payload for debugging
        let payloadDebug = null
        try {
          const rawPayload = Buffer.from(payloadB64, 'base64url').toString('utf-8')
          payloadDebug = JSON.parse(rawPayload)
        } catch {}

        console.error('[auth] Signature verification FAILED — key mismatch or expired')
        if (payloadDebug) {
          const now = Math.floor(Date.now() / 1000)
          const expDiff = payloadDebug.exp ? now - payloadDebug.exp : null
          console.error('[auth]   Token sub:', payloadDebug.sub, '| role:', payloadDebug.role)
          console.error('[auth]   Token iat:', new Date((payloadDebug.iat || 0) * 1000).toISOString())
          console.error('[auth]   Token exp:', payloadDebug.exp ? new Date(payloadDebug.exp * 1000).toISOString() : 'N/A')
          if (expDiff !== null && expDiff > 0) {
            console.error('[auth]   *** TOKEN IS EXPIRED by', Math.round(expDiff), 'seconds ***')
          } else if (expDiff !== null) {
            console.error('[auth]   Token not yet expired (', -expDiff, 's remaining)')
          }
        }
        return null
      }

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        console.error('[auth] Token EXPIRED — exp:', new Date(payload.exp * 1000).toISOString())
        return null
      }

      if (payload.role === 'pending') {
        console.error('[auth] Token role is pending')
        return null
      }

      console.log('[auth] Token verified OK —', publicKeySource, '| user:', payload.username, '| role:', payload.role)
      return {
        userId: payload.sub,
        username: payload.username,
        role: payload.role,
        playerId: payload.playerId || null,
      }
    } catch (e) {
      console.error('[auth] Token verification threw exception:', e.message)
      return null
    }
  }

  return { init, verifyToken, fetchPublicKeyFromSite }
}
