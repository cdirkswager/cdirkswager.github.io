import { useState, useEffect } from 'react'
import { getRateLimitState, isRateLimited, onRateLimitChange, checkRateLimit } from '../../data/sync'

function formatCountdown(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function RateLimitBanner() {
  const [limited, setLimited] = useState(isRateLimited)
  const [countdown, setCountdown] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const unsub = onRateLimitChange(() => {
      setLimited(isRateLimited())
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!limited) { setCountdown(''); return }
    const tick = () => {
      const state = getRateLimitState()
      if (!state || !state.reset) { setLimited(false); return }
      const now = Date.now()
      const resetMs = state.reset * 1000
      if (now >= resetMs) {
        setLimited(false)
        setCountdown('')
        return
      }
      setCountdown(formatCountdown((resetMs - now) / 1000))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [limited])

  const handleCheck = async () => {
    setChecking(true)
    await checkRateLimit()
    setChecking(false)
  }

  if (!limited) return null

  return (
    <div className="rate-limit-banner">
      <div className="rate-limit-banner-inner">
        <span className="rate-limit-icon">⚠️</span>
        <span className="rate-limit-text">
          <strong>GitHub Sync Temporarily Unavailable</strong> &mdash; You've hit the hourly API rate limit. Changes are saved locally and will sync once the limit resets in <strong>{countdown}</strong>.
        </span>
        <button
          className="btn btn-sm rate-limit-check-btn"
          onClick={handleCheck}
          disabled={checking}
        >
          {checking ? '🔄' : '🔍 Check Now'}
        </button>
      </div>
    </div>
  )
}
