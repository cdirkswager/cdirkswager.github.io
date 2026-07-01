import crypto from 'node:crypto'

console.log('=== JWK Key Construction Test ===\n')
console.log('Node version:', process.version)

// Generate a test keypair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
})

// Export public key as JWK (simulating JWKS response)
const jwkExport = publicKey.export({ format: 'jwk' })
console.log('\n[1] Generated RSA-2048 keypair')
console.log('    JWK n (first 32 chars):', jwkExport.n.slice(0, 32) + '...')
console.log('    JWK e:', jwkExport.e)

// Reconstruct from JWK (simulating auth.js line 25-28)
const reconstructed = crypto.createPublicKey({
  key: { kty: 'RSA', n: jwkExport.n, e: jwkExport.e },
  format: 'jwk',
})
console.log('\n[2] Reconstructed from JWK')

// Sign a test message with private key
const testMsg = Buffer.from('This is a test message that simulates the JWT signing input')
const sig = crypto.sign('RSA-SHA256', testMsg, privateKey)
console.log('\n[3] Signed test message with original private key')
console.log('    Signature length:', sig.length, 'bytes')

// Verify with JWK-reconstructed public key (simulating auth.js line 59-64)
let verified = false
try {
  verified = crypto.verify('RSA-SHA256', testMsg, reconstructed, sig)
} catch (e) {
  console.error('    Error:', e.message)
}
console.log('\n[4] Verify with JWK-reconstructed key:')
console.log('    Result:', verified ? 'VERIFIED ✓' : 'FAILED ✗')

// Also test with PEM-constructed key for comparison
const pemReconstructed = crypto.createPublicKey({ format: 'pem', key: publicKey })
let verifiedPem = false
try {
  verifiedPem = crypto.verify('RSA-SHA256', testMsg, pemReconstructed, sig)
} catch (e) {
  console.error('    Error:', e.message)
}
console.log('\n[5] Verify with PEM-constructed key:')
console.log('    Result:', verifiedPem ? 'VERIFIED ✓' : 'FAILED ✗')

// Test base64url encoding/decoding (simulating JWT signature handling)
const sigB64url = Buffer.from(sig).toString('base64url')
const decodedSig = Buffer.from(sigB64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

console.log('\n[6] Base64url round-trip test:')
console.log('    Original sig length:', sig.length)
console.log('    base64url encoded:', sigB64url.slice(0, 32) + '...')
console.log('    Decoded back matches:', Buffer.compare(sig, decodedSig) === 0 ? 'YES ✓' : 'NO ✗')

// Verify with decoded signature (simulating auth.js line 57-64)
let verifiedWithDecoded = false
try {
  verifiedWithDecoded = crypto.verify('RSA-SHA256', testMsg, reconstructed, decodedSig)
} catch (e) {
  console.error('    Error:', e.message)
}
console.log('\n[7] Verify with base64url-decoded signature:')
console.log('    Result:', verifiedWithDecoded ? 'VERIFIED ✓' : 'FAILED ✗')

// Final conclusion
console.log('\n=== CONCLUSION ===')
if (verified && verifiedPem && verifiedWithDecoded) {
  console.log('ALL TESTS PASSED — JWK construction works correctly in this Node.js version.')
  console.log('The issue is likely NOT a key format problem.')
} else {
  console.log('SOME TESTS FAILED — there may be a compatibility issue with JWK keys.')
  if (!verified) console.log('  - JWK-constructed key failed verification')
  if (!verifiedPem) console.log('  - PEM-constructed key failed verification')
  if (!verifiedWithDecoded) console.log('  - base64url decoding issue detected')
}
