import { useState, useEffect } from 'react'
import { getUsageState, onUsageChange, checkUsage } from '../../data/sync'

export default function RateLimitBanner() {
  const [usage, setUsage] = useState(getUsageState())
  const [limited, setLimited] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const unsub = onUsageChange(setUsage)
    return unsub
  }, [])

  useEffect(() => {
    if (!usage || usage.limit <= 0) { setLimited(false); return }
    setLimited(usage.reads >= usage.limit || usage.writes >= 1000)
  }, [usage])

  const handleCheck = async () => {
    setChecking(true)
    const u = await checkUsage()
    if (u) setUsage(u)
    setChecking(false)
  }

  if (!limited) return null

  return (
    <div className="rate-limit-banner">
      <div className="rate-limit-banner-inner">
        <span className="rate-limit-icon">⚠️</span>
        <span className="rate-limit-text">
          <strong>Sync Temporarily Unavailable</strong> &mdash; Hourly API limit reached. Changes are saved locally and will sync once the limit resets.
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
