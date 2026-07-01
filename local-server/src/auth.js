import { readFileSync, existsSync } from 'node:fs'
import crypto from 'node:crypto'

export function createAuthVerifier(config) {
  let publicKey = null

  function loadPublicKey() {
    if (config.publicKeyPath && existsSync(config.publicKeyPath)) {
      publicKey = readFileSync(config.publicKeyPath, 'utf-8')
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
      if (parts.length !== 3) return null

      const [headerB64, payloadB64, sigB64] = parts
      const message = `${headerB64}.${payloadB64}`

      const sig = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

      const isValid = crypto.verify(
        'RSA-SHA256',
        Buffer.from(message),
        publicKey,
        sig
      )

      if (!isValid) return null

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null

      if (payload.role === 'pending') return null

      return {
        userId: payload.sub,
        username: payload.username,
        role: payload.role,
        playerId: payload.playerId || null,
      }
    } catch (e) {
      console.error('[auth] Token verification failed:', e.message)
      return null
    }
  }

  return { init, verifyToken, fetchPublicKeyFromSite }
}
