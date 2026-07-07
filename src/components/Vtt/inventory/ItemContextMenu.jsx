import React, { useCallback, useEffect, useState } from 'react'
import { availableItemActions } from './itemActions.js'

export function ItemContextMenu({ item, ctx, position, onAction, onClose }) {
  const actions = availableItemActions(item, ctx)

  useEffect(() => {
    if (!onClose) return
    const handler = (e) => { e.stopPropagation(); onClose() }
    window.addEventListener('click', handler, true)
    return () => window.removeEventListener('click', handler, true)
  }, [onClose])

  if (actions.length === 0) return null

  return (
    <div
      className="inv-menu"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {actions.map((a, i) => [
        i > 0 && actions[i - 1].action === 'delete' ? null : null,
        <div
          key={a.action}
          className={`inv-menu-item${a.danger ? ' danger' : ''}`}
          onClick={() => { onClose(); onAction(a) }}
        >
          {a.label}
        </div>
      ])}
    </div>
  )
}

export function SplitModal({ item, onSplit, onClose }) {
  const [qty, setQty] = useState(Math.floor((item?.quantity || 2) / 2))
  const max = (item?.quantity || 2) - 1

  const handleSplit = useCallback(() => {
    const n = Math.min(Math.max(1, qty), max)
    onSplit(n)
    onClose()
  }, [qty, max, onSplit, onClose])

  return (
    <div className="inv-modal-scrim" onClick={onClose}>
      <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="inv-modal-title">Split {item?.name}</div>
        <div className="inv-modal-row">
          <input
            className="inv-input inv-modal-input"
            type="range"
            min={1}
            max={max}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
          <span className="inv-split-count">{qty}</span>
        </div>
        {item?.stackable && (
          <div className="inv-modal-hint">
            {item.quantity - qty} remaining in original stack
          </div>
        )}
        <div className="inv-modal-actions">
          <button className="inv-btn" onClick={onClose}>Cancel</button>
          <button className="inv-btn primary" onClick={handleSplit}>Split</button>
        </div>
      </div>
    </div>
  )
}
