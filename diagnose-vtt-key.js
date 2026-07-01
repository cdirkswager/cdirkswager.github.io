import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

const SITE = 'https://hunt-website.pages.dev'

async function main() {
  console.log('=== Private Key Match Test ===\n')

  // Step 1: Fetch live JWKS
  const jwksRes = await fetch(SITE + '/api/auth/vtt-jwks')
  const jwks = await jwksRes.json()
  const jwksKey = jwks.keys[0]

  // Step 2: Load local PEM and private key
  const pemContent = readFileSync('./local-server/vtt-public.pem', 'utf-8')
  
  let privKeyPath, privKeyContent
  for (const p of ['./secrets/vtt-private.pem', './vtt-private.pem']) {
    if (readFileSync(p, 'utf-8').trim().length > 0) {
      privKeyPath = p
      privKeyContent = readFileSync(p, 'utf-8')
      break
    }
  }
  
  if (!privKeyPath) {
    console.log('No local private key found. Cannot test signing.')
    return
  }

  // Step 3: Check if local private key matches the public key in JWKS/PEM
  console.log('[1] Does local private key match JWKS public key?')
  
  const privKey = crypto.createPrivateKey({ format: 'pem', key: privKeyContent })
  const pubFromPriv = crypto.createPublicKey(privKey)
  const pubPem = crypto.createPublicKey({ format: 'pem', key: pemContent })
  const pubJwks = crypto.createPublicKey({ format: 'jwk', key: jwksKey })

  // Compare by exporting all to PEM SPKI and checking equality
  const privAsPubPem = pubFromPriv.export({ format: 'pem', type: 'spki' })
  const pemSpki = pubPem.export({ format: 'pem', type: 'spki' })
  const jwksSpki = pubJwks.export({ format: 'pem', type: 'spki' })

  console.log('    Private key → public PEM == JWKS SPKI:', privAsPubPem === jwksSpki ? 'YES ✓' : 'NO ✗')
  console.log('    Private key → public PEM == Local PEM SPKI:', privAsPubPem === pemSpki ? 'YES ✓' : 'NO ✗')
  console.log('    JWKS SPKI == Local PEM SPKI:', jwksSpki === pemSpki ? 'YES ✓' : 'NO ✗')

  // Step 4: Sign a test message with local private key, verify against JWKS public key (JWK format)
  console.log('\n[2] Full round-trip: sign with local priv key → verify against JWKS public key')
  
  const testMsg = Buffer.from('test message for signing')
  const sig = crypto.sign('RSA-SHA256', testMsg, privKey)
  
  // Verify with JWK-constructed key (how server does it)
  let verifiedJwk = false
  try {
    verifiedJwk = crypto.verify('RSA-SHA256', testMsg, pubJwks, sig)
  } catch (e) {
    console.error('    Error:', e.message)
  }
  console.log('    Verify with JWK key:', verifiedJwk ? 'OK ✓' : 'FAILED ✗')

  // Step 5: Check if Cloudflare might be using a DIFFERENT private key than what's local
  console.log('\n[3] Key source analysis:')
  
  // The vtt-utils.js on Cloudflare has this priority:
  // Priority 1: VTT_PRIVATE_KEY / VTT_PUBLIC_KEY secrets (PEM)
  // Priority 2: cached JWK in KV
  // Priority 3: generate new keypair
  
  console.log('    Cloudflare vtt-utils.js signing key priority:')
  console.log('      1. VTT_PRIVATE_KEY secret (PEM format)')
  console.log('      2. Cached JWK in HUNT_DATA KV')
  console.log('      3. Auto-generated new keypair')
  console.log()
  console.log('    If Cloudflare was deployed WITHOUT VTT_PRIVATE_KEY secret,')
  console.log('    it would auto-generate a NEW keypair and cache it in KV.')
  console.log('    This new keypair would be DIFFERENT from the local PEM/JWKS.')
  console.log()
  
  if (privAsPubPem !== jwksSpki) {
    console.log('    *** CONFIRMED: Local private key does NOT match JWKS public key! ***')
    console.log('    The Cloudflare site is signing tokens with a DIFFERENT key.')
    console.log()
    console.log('    FIX OPTIONS:')
    console.log('    A) Set VTT_PRIVATE_KEY secret on Cloudflare to match local private key')
    console.log('    B) Export the public key from Cloudflare KV and update local PEM')
  } else {
    console.log('    Local private key MATCHES JWKS. Issue is elsewhere.')
  }

  // Step 6: Check if there's a kid mismatch or algorithm issue
  const tokenHeader = JSON.parse(Buffer.from(jwksKey.kid ? 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InZ0dC12MSJ9' : '', 'base64').toString())
  console.log('\n[4] Algorithm/kid check:')
  console.log('    JWKS kid:', jwksKey.kid)
  console.log('    JWKS alg:', jwksKey.alg)
  
  // Check if server's verifyToken handles kid selection from JWKS
  const authContent = readFileSync('./local-server/src/auth.js', 'utf-8')
  const hasKidHandling = authContent.includes('.kid') || authContent.includes('kid:')
  console.log('    Server checks kid:', hasKidHandling ? 'YES' : 'NO (uses first key only)')
}

main().catch(e => { console.error(e); process.exit(1) })
