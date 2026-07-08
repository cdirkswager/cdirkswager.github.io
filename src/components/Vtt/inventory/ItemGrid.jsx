import React, { useState } from 'react'
import { RARITY_LABELS } from '../../../vtt/data/fivee.js'
import { Draggable, Droppable } from './dnd.jsx'
import { ItemContextMenu, SplitModal } from './ItemContextMenu.jsx'
import { pickEquipSlot } from './itemActions.js'
import { displayItem, sortItems, SORT_OPTIONS } from './itemDisplay.js'
import { useHoverCard } from './HoverCard.jsx'
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

function Cell({ item, editable, isDm, handlers }) {
  const hover = useHoverCard()
  if (!item) return <div className="inv-cell empty" />
  const disp = displayItem(item, { isDm })
  const inner = (
    <div
      className={`inv-cell filled${disp.unidentified ? ' unidentified' : ''}`}
      onMouseEnter={(e) => hover.show(item, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={hover.hide}
      onContextMenu={handlers ? (e) => { e.preventDefault(); handlers.onContext(item, e) } : undefined}
      onDoubleClick={editable ? () => handlers.onDouble(item) : undefined}
      onClick={editable ? (e) => handlers.onClick(item, e) : undefined}
    >
      {item.rarity && item.rarity !== 'common' && disp.showEffects &&
        <span className="rar" style={{ background: RARITY_VAR[item.rarity] }} />}
      {item.equipped && item.attunement?.attuned && <span className="attuned" title="Attuned">\u2726</span>}
      <img src={item.img} alt={disp.name} draggable={false} />
      {item.quantity > 1 && <span className="qty">{item.quantity}</span>}
    </div>
  )
  if (!editable) return inner
  return <Draggable id={`item:${item.id}`} data={{ itemId: item.id }}>{inner}</Draggable>
}

function ContainerRow({ container, ctx, depth = 0 }) {
  const [open, setOpen] = useState(!container.container?.collapsed)
  const kids = ctx.childrenOf(container.id)
  const kidCells = kids.filter(k => k.itemType !== 'container')
  const kidContainers = kids.filter(k => k.itemType === 'container')
  const cap = container.container?.capacity || 0
  const fill = ctx.fillOf(container)
  const pct = cap ? Math.min(100, (fill / cap) * 100) : 0
  const over = cap && fill > cap
  return (
    <div className="inv-container" style={{ marginLeft: depth ? 8 : 0 }}>
      <div className={`inv-container-head${open ? '' : ' collapsed'}`} onClick={() => setOpen(o => !o)}>
        <span className="chev"><IconChevron width={16} height={16} /></span>
        <img src={container.img} alt="" />
        <span>{container.name}</span>
        <div className={`inv-container-fill${over ? ' over' : ''}`}><i style={{ width: `${pct}%` }} /></div>
        <span className="inv-container-meta">{fill}/{cap} lb</span>
      </div>
      {open && (
        <div className="inv-container-body">
          <Droppable id={`container:${container.id}`} className="inv-grid" disabled={!ctx.editable}>
            {kidCells.length === 0 && kidContainers.length === 0
              ? <div className="inv-empty" style={{ gridColumn: '1 / -1' }}>Empty</div>
              : kidCells.map(c => <Cell key={c.id} item={c} editable={ctx.editable} isDm={ctx.isDm} handlers={ctx.handlers} />)}
          </Droppable>
          {kidContainers.map(c => <ContainerRow key={c.id} container={c} ctx={ctx} depth={depth + 1} />)}
        </div>
      )}
    </div>
  )
}

export default function ItemGrid({ model, actions, isDm }) {
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('manual')
  const [menu, setMenu] = useState(null)
  const [split, setSplit] = useState(null)
  const { loose, containers, childrenOf, fillOf, carry, currency, isSharedView, gridActor, gridEditable, partyStash, owns, equipment } = model
  const editable = !!gridEditable

  if (!gridActor) return <div className="inv-right"><div className="inv-empty">No inventory to show</div></div>

  const canGive = !!partyStash && gridActor.id !== partyStash.id

  const runAction = (action, item) => {
    switch (action) {
      case 'equip':      actions?.equipItem(item.id, pickEquipSlot(item, equipment)); break
      case 'unequip':    actions?.unequipItem(item.id); break
      case 'attune':     actions?.setAttunement(item.id, true); break
      case 'unattune':   actions?.setAttunement(item.id, false); break
      case 'split':      setSplit({ item }); break
      case 'give':       if (partyStash) actions?.transferItem({ itemId: item.id, toActorId: partyStash.id }); break
      case 'drop':       actions?.dropItem(item.id); break
      case 'identify':   actions?.setIdentified(item.id, true); break
      case 'unidentify': actions?.setIdentified(item.id, false); break
      case 'delete':     actions?.deleteItem(item.id); break
      default: break
    }
  }

  const handlers = {
    onContext: (item, e) => setMenu({ item, x: e.clientX, y: e.clientY }),
    onDouble: (item) => { if (!editable) return; if (item.slot && !item.equipped) runAction('equip', item); else if (item.equipped) runAction('unequip', item) },
    onClick: (item, e) => { if (e.shiftKey && canGive && editable) runAction('give', item) },
  }
  const ctx = { childrenOf, fillOf, editable, isDm, handlers }

  const activeTab = TABS.find(t => t.id === tab)
  const matches = (it) => activeTab.match(it.itemType) && (!q || it.name.toLowerCase().includes(q.toLowerCase()))

  const looseFiltered = sortItems(loose.filter(matches), sort)
  const MIN_CELLS = 40
  const target = Math.max(MIN_CELLS, Math.ceil((looseFiltered.length + 3) / 5) * 5)
  const empties = Math.max(0, target - looseFiltered.length)

  const gp = currency?.gp ?? 0
  const cap = carry?.capacity ?? 0
  const carried = carry?.carried ?? 0
  const over = carry?.over
  const enc = carry?.encumbrance
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
        <select className="inv-sort" value={sort} onChange={e => setSort(e.target.value)} title="Sort">
          {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      {isSharedView && <div className="inv-scope">Shared party stash — you don't control this character</div>}
      {editable && <div className="inv-hint">Double-click to equip · Shift-click to send to stash · Right-click for more</div>}

      <div className="inv-right-scroll">
        <Droppable id="grid" className="inv-grid" disabled={!editable}>
          {looseFiltered.map(it => <Cell key={it.id} item={it} editable={editable} isDm={isDm} handlers={handlers} />)}
          {Array.from({ length: empties }).map((_, i) => <Cell key={`e${i}`} item={null} />)}
        </Droppable>

        {containers
          .filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || childrenOf(c.id).some(matches))
          .map(c => <ContainerRow key={c.id} container={c} ctx={ctx} />)}
      </div>

      <div className={`inv-weight${over ? ' over' : ''}`}>
        <IconCoin /><span className="inv-weight-num">{gp.toLocaleString()}</span>
        {enc && enc !== 'none' &&
          <span className="inv-enc" title="Encumbrance">{enc === 'heavilyEncumbered' ? 'Heavily encumbered' : 'Encumbered'}</span>}
        <IconWeight />
        <div className={`inv-weight-bar${over ? ' over' : ''}`}><i style={{ width: `${pct}%` }} /></div>
        <span className={`inv-weight-num${over ? ' over' : ''}`}>{carried} / {cap} lb</span>
      </div>

      {menu && (
        <ItemContextMenu
          item={menu.item} x={menu.x} y={menu.y} owns={editable} canGive={canGive} isDm={isDm}
          onAction={runAction} onClose={() => setMenu(null)}
        />
      )}
      {split && (
        <SplitModal
          item={split.item}
          onConfirm={(n) => { actions?.splitStack(split.item.id, n); setSplit(null) }}
          onClose={() => setSplit(null)}
        />
      )}
    </div>
  )
}
