import React, { useState, useCallback } from 'react'
import { RARITY_LABELS } from '../../../vtt/data/fivee.js'
import { Draggable, Droppable } from './dnd.jsx'
import { IconGrid, IconPotion, IconLeaf, IconRing, IconScroll, IconSearch, IconChevron, IconWeight, IconCoin } from './icons.jsx'

const RARITY_VAR = {
  common: 'var(--vtt-rarity-common)', uncommon: 'var(--vtt-rarity-uncommon)',
  rare: 'var(--vtt-rarity-rare)', veryRare: 'var(--vtt-rarity-veryRare)',
  legendary: 'var(--vtt-rarity-legendary)', artifact: 'var(--vtt-rarity-artifact)',
}

const TABS = [
  { id: 'all', Icon: IconGrid, match: () => true },
  { id: 'potion', Icon: IconPotion, match: (t) => t === 'potion' || t === 'consumable' },
  { id: 'ingredient', Icon: IconLeaf, match: (t) => t === 'treasure' || t === 'misc' },
  { id: 'ring', Icon: IconRing, match: (t) => t === 'ring' || t === 'wondrous' },
  { id: 'scroll', Icon: IconScroll, match: (t) => t === 'scroll' || t === 'tool' },
]

function tooltip(it) {
  const val = it.value ? Object.entries(it.value).filter(([, v]) => v).map(([k, v]) => `${v}${k}`).join(' ') : ''
  return [it.name, RARITY_LABELS[it.rarity], it.weight ? `${it.weight} lb` : '', val,
    it.description].filter(Boolean).join('\n')
}

function Cell({ item, onContextMenu, onDoubleClick, editable }) {
  if (!item) return <div className="inv-cell empty" />
  const inner = (
    <div
      className="inv-cell filled"
      title={tooltip(item)}
      onContextMenu={(e) => onContextMenu?.(item, e)}
      onDoubleClick={() => onDoubleClick?.(item)}
    >
      {item.rarity && item.rarity !== 'common' &&
        <span className="rar" style={{ background: RARITY_VAR[item.rarity] }} />}
      <img src={item.img} alt={item.name} draggable={false} />
      {item.quantity > 1 && <span className="qty">{item.quantity}</span>}
    </div>
  )
  if (!editable) return inner
  return (
    <Draggable id={`item:${item.id}`} data={{ itemId: item.id }}>
      {inner}
    </Draggable>
  )
}

function ContainerRow({ container, children, fill, onContextMenu, onDoubleClick, editable, childrenOf, fillOf }) {
  const [open, setOpen] = useState(!container.container?.collapsed)
  const cap = container.container?.capacity || 0
  const pct = cap ? Math.min(100, (fill / cap) * 100) : 0
  const over = cap && fill > cap
  return (
    <Droppable id={`container:${container.id}`} data={{ containerId: container.id }} className="inv-container">
      <div className={`inv-container-head${open ? '' : ' collapsed'}`} onClick={() => setOpen(o => !o)}>
        <span className="chev"><IconChevron width={16} height={16} /></span>
        <img src={container.img} alt="" />
        <span>{container.name}</span>
        <div className={`inv-container-fill${over ? ' over' : ''}`}><i style={{ width: `${pct}%` }} /></div>
        <span className="inv-container-meta">{fill}/{cap} lb</span>
      </div>
      {open && (
        <div className="inv-container-body">
          <div className="inv-grid">
            {children.length === 0
              ? <div className="inv-empty" style={{ gridColumn: '1 / -1' }}>Empty</div>
              : children.map(c =>
                  c.itemType === 'container'
                    ? <ContainerRow key={c.id} container={c} children={childrenOf(c.id)} fill={fillOf(c)} onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} editable={editable} childrenOf={childrenOf} fillOf={fillOf} />
                    : <Cell key={c.id} item={c} onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} editable={editable} />
                )}
          </div>
        </div>
      )}
    </Droppable>
  )
}

export default function ItemGrid({ model, onContextMenu, controller }) {
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const { loose, containers, childrenOf, fillOf, carry, currency, isSharedView, gridActor, gridEditable, owns } = model
  const editable = gridEditable && owns

  const handleDoubleClick = useCallback((item) => {
    if (!owns || !controller) return
    if (item.equipped) {
      controller.unequipItem?.(item.id)
    } else if (item.slot) {
      controller.equipItem?.(item.id, item.slot)
    }
  }, [owns, controller])

  if (!gridActor) return <div className="inv-right"><div className="inv-empty">No inventory to show</div></div>

  const activeTab = TABS.find(t => t.id === tab)
  const matches = (it) =>
    activeTab.match(it.itemType) &&
    (!q || it.name.toLowerCase().includes(q.toLowerCase()))

  const looseFiltered = loose.filter(matches)
  const MIN_CELLS = 40
  const target = Math.max(MIN_CELLS, Math.ceil((looseFiltered.length + 3) / 5) * 5)
  const empties = Math.max(0, target - looseFiltered.length)

  const gp = currency?.gp ?? 0
  const cap = carry?.capacity ?? 0
  const carried = carry?.carried ?? 0
  const over = carry?.over
  const pct = cap ? Math.min(100, (carried / cap) * 100) : 0

  return (
    <div className="inv-right">
      <div className="inv-tabs">
        {TABS.map(({ id, Icon }) => (
          <button key={id} className={`inv-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            <Icon />
          </button>
        ))}
        <div className="inv-search">
          <IconSearch />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items" />
        </div>
      </div>

      {isSharedView && <div className="inv-scope">Shared party stash — you don't control this character</div>}
      {!owns && !isSharedView && <div className="inv-scope">Read-only view</div>}

      <Droppable id="grid" data={{ zone: 'grid' }} className="inv-right-scroll">
        <div className="inv-grid">
          {looseFiltered.map(it => <Cell key={it.id} item={it} onContextMenu={onContextMenu} onDoubleClick={handleDoubleClick} editable={editable} />)}
          {Array.from({ length: empties }).map((_, i) => <Cell key={`e${i}`} item={null} />)}
        </div>

        {containers
          .filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || childrenOf(c.id).some(matches))
          .map(c => (
            <ContainerRow key={c.id} container={c} children={childrenOf(c.id)} fill={fillOf(c)} onContextMenu={onContextMenu} onDoubleClick={handleDoubleClick} editable={editable} childrenOf={childrenOf} fillOf={fillOf} />
          ))}
      </Droppable>

      <div className={`inv-weight${over ? ' over' : ''}`}>
        <IconCoin /><span className="inv-weight-num">{gp}</span>
        <IconWeight />
        <div className={`inv-weight-bar${over ? ' over' : ''}`}><i style={{ width: `${pct}%` }} /></div>
        <span className={`inv-weight-num${over ? ' over' : ''}`}>{carried} / {cap} lb</span>
      </div>
    </div>
  )
}
