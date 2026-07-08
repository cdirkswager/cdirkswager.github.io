import { useState, useEffect, useMemo, useCallback } from 'react'
import { getAccessLevel } from '../../../vtt/canvas/ownership.js'
import { computeDerived } from '../../../vtt/data/EffectEngine.js'
import { carrySummary, indexItems, containerFill } from '../../../vtt/data/weight.js'

/**
 * useInventoryModel — turns the live record caches (controller.actorMap /
 * controller.itemMap) into a render-ready view model, and encodes the
 * ownership toggle: selecting an actor you own shows YOUR inventory; selecting
 * one you don't own shows the shared party stash.
 *
 * Read-only in Phase 3 (no mutations); `canEdit` is exposed for Phase 4.
 */
export function useInventoryModel({ controller, eventBus, session, initialActorId }) {
  const [version, bump] = useState(0)
  const [selectedId, setSelectedId] = useState(initialActorId ?? null)

  // Follow an externally-requested focus (e.g. clicking a party member).
  useEffect(() => { if (initialActorId) setSelectedId(initialActorId) }, [initialActorId])

  // Re-read the caches whenever records change.
  useEffect(() => {
    if (!eventBus) return
    const rerender = () => bump(v => v + 1)
    const offA = eventBus.on('actors-changed', rerender)
    const offI = eventBus.on('items-changed', rerender)
    return () => { offA?.(); offI?.() }
  }, [eventBus])

  const user = useMemo(
    () => ({ userId: session?.userId, role: session?.role }),
    [session?.userId, session?.role]
  )

  const model = useMemo(() => {
    const actorMap = controller?.actorMap ?? new Map()
    const itemMap = controller?.itemMap ?? new Map()
    const allActors = [...actorMap.values()]
    const allItems = [...itemMap.values()]

    // Party rail = characters (+ NPCs the DM can see).
    const party = allActors
      .filter(a => a.actorType === 'character' || (user.role === 'dm' && a.actorType === 'npc'))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    const partyStash = allActors.find(a => a.actorType === 'party-stash') || null

    // Resolve selection.
    let selected = actorMap.get(selectedId) || party[0] || null
    const accessLevel = selected ? getAccessLevel(user, selected) : 'none'
    const owns = accessLevel === 'owner'

    // Selected actor's own items → drives the paperdoll + derived stats.
    const selectedItems = selected ? allItems.filter(i => i.actorId === selected.id) : []
    const derived = selected ? computeDerived(selected, selectedItems) : null

    // Equipment by physical slot (public — always shown; editable only if owns).
    const equipment = {}
    for (const it of selectedItems) {
      if (it.equipped) equipment[it.equippedSlot || it.slot] = it
    }

    // Inventory grid source: own → selected; otherwise the shared stash.
    const gridActor = owns ? selected : (partyStash || null)
    const gridEditable = owns || (!!partyStash && gridActor === partyStash)
    const gridItems = gridActor ? allItems.filter(i => i.actorId === gridActor.id) : []

    // Split into loose top-level items and containers; expose children lookup.
    const idx = indexItems(gridItems)
    const looseUnequipped = gridItems.filter(i => !i.parentItemId && !i.equipped)
    const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0)
    const loose = looseUnequipped.filter(i => i.itemType !== 'container').sort(byOrder)
    const containers = looseUnequipped.filter(i => i.itemType === 'container').sort(byOrder)
    const childrenOf = (id) => gridItems.filter(i => i.parentItemId === id).sort(byOrder)
    const fillOf = (container) => containerFill(container, idx)

    const carry = gridActor ? carrySummary(gridActor.attributes, gridItems) : null

    return {
      party, partyStash, selected, accessLevel, owns,
      derived, equipment,
      gridActor, gridEditable, gridItems, loose, containers, childrenOf, fillOf,
      carry,
      isSharedView: !!gridActor && gridActor === partyStash && !owns,
      currency: gridActor?.attributes?.currency ?? selected?.attributes?.currency ?? null,
      getItem: (id) => itemMap.get(id),
    }
    // version participates so the memo recomputes on record changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, selectedId, user, version])

  const selectActor = useCallback((id) => setSelectedId(id), [])

  return { ...model, selectActor, selectedId: model.selected?.id ?? null }
}
