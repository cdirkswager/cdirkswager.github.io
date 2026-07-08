import React, { createContext, useContext, useState, useCallback } from 'react'
import { displayItem, prettyType, valueInGp } from './itemDisplay.js'
import { RARITY_LABELS } from '../../../vtt/data/fivee.js'

const RARITY_VAR = {
  common: 'var(--vtt-rarity-common)', uncommon: 'var(--vtt-rarity-uncommon)',
  rare: 'var(--vtt-rarity-rare)', veryRare: 'var(--vtt-rarity-veryRare)',
  legendary: 'var(--vtt-rarity-legendary)', artifact: 'var(--vtt-rarity-artifact)',
}

const HoverCardContext = createContext({ show: () => {}, hide: () => {} })
export const useHoverCard = () => useContext(HoverCardContext)

function fmtValue(value, quantity = 1) {
  const gp = valueInGp(value) * (quantity || 1)
  if (!gp) return null
  return gp >= 1 ? `${gp % 1 ? gp.toFixed(2) : gp} gp` : `${Math.round(gp * 10)} sp`
}

function EffectLine({ e }) {
  const sign = (n) => (n >= 0 ? `+${n}` : `${n}`)
  const target = String(e.target || '').replace(/\./g, ' ')
  const v = e.mode === 'mult' ? `x${e.value}` : e.mode === 'grant' ? e.value : sign(Number(e.value))
  return <div className="card-effect">{v} {target}</div>
}

export function ItemCard({ item, isDm }) {
  if (!item) return null
  const d = displayItem(item, { isDm })
  const rarityColor = RARITY_VAR[d.rarity] || 'var(--vtt-rarity-common)'
  const value = fmtValue(item.value, item.quantity)
  const showEffects = d.showEffects && item.effects?.length > 0
  return (
    <div className="item-card">
      <div className="item-card-head">
        <img src={item.img} alt="" />
        <div>
          <div className="item-card-name" style={{ color: rarityColor }}>{d.name}</div>
          <div className="item-card-sub">
            {RARITY_LABELS[d.rarity]} · {prettyType(item.itemType)}
            {item.attunement?.required && <span className="card-attune"> · {item.attunement.attuned ? 'Attuned' : 'Requires attunement'}</span>}
          </div>
        </div>
      </div>

      <div className="item-card-stats">
        {item.weight ? <span>{item.weight * (item.quantity || 1)} lb</span> : null}
        {value ? <span>{value}</span> : null}
        {item.quantity > 1 ? <span>x{item.quantity}</span> : null}
        {item.weapon?.damage ? <span>{item.weapon.damage} {item.weapon.damageType}</span> : null}
        {item.armor?.baseAC != null ? <span>AC {item.armor.baseAC}{item.armor.type ? ` (${item.armor.type})` : ''}</span> : null}
        {item.charges ? <span>{item.charges.current}/{item.charges.max} charges</span> : null}
      </div>

      {showEffects && (
        <div className="item-card-effects">
          {item.effects.map((e, i) => <EffectLine key={e.id || i} e={e} />)}
        </div>
      )}

      {d.description && <div className="item-card-desc">{d.description}</div>}
      {d.unidentified && isDm && <div className="item-card-flag">Unidentified — hidden from players</div>}
    </div>
  )
}

export function HoverCardProvider({ isDm, children }) {
  const [state, setState] = useState(null)

  const show = useCallback((item, rect) => {
    if (!item || !rect) return
    const CARD_W = 264
    const pad = 12
    const right = rect.right + pad
    const left = right + CARD_W > window.innerWidth ? Math.max(pad, rect.left - CARD_W - pad) : right
    const top = Math.min(rect.top, window.innerHeight - 220)
    setState({ item, style: { left, top } })
  }, [])
  const hide = useCallback(() => setState(null), [])

  return (
    <HoverCardContext.Provider value={{ show, hide }}>
      {children}
      {state && (
        <div className="item-card-layer" style={state.style}>
          <ItemCard item={state.item} isDm={isDm} />
        </div>
      )}
    </HoverCardContext.Provider>
  )
}
