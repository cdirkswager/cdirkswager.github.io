import React, { useEffect, useState } from 'react'
import { availableItemActions, ACTION_LABELS } from './itemActions.js'

export function ItemContextMenu({ item, x, y, owns, canGive, isDm, onAction, onClose }) {
  useEffect(() => {
    const close = (e) => { if (e.type === 'keydown' && e.key !== 'Escape') return; onClose() }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close) }
  }, [onClose])

  const actions = availableItemActions(item, { owns, canGive, isDm })
  if (actions.length === 0) return null
  const style = { left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - 40 - actions.length * 30) }

  return (
    <div className="inv-menu" style={style} onMouseDown={(e) => e.stopPropagation()}>
      <div className="inv-menu-title">{item.name}</div>
      {actions.map(a => (
        <button
          key={a}
          className={`inv-menu-item${a === 'delete' ? ' danger' : ''}`}
          onClick={() => { onAction(a, item); onClose() }}
        >
          {ACTION_LABELS[a]}
        </button>
      ))}
    </div>
  )
}

export function SplitModal({ item, onConfirm, onClose }) {
  const max = (item.quantity ?? 1) - 1
  const [n, setN] = useState(Math.max(1, Math.floor((item.quantity ?? 1) / 2)))
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter') onConfirm(n) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [n, onClose, onConfirm])

  return (
    <div className="inv-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="inv-modal">
        <div className="inv-modal-title">Split &ldquo;{item.name}&rdquo;</div>
        <div className="inv-modal-row">
          <input type="range" min={1} max={max} value={n} onChange={e => setN(Number(e.target.value))} />
          <input type="number" min={1} max={max} value={n}
            onChange={e => setN(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
        </div>
        <div className="inv-modal-hint">Move {n}, leaving {(item.quantity ?? 1) - n}.</div>
        <div className="inv-modal-actions">
          <button className="inv-btn" onClick={onClose}>Cancel</button>
          <button className="inv-btn primary" onClick={() => onConfirm(n)}>Split</button>
        </div>
      </div>
    </div>
  )
}
