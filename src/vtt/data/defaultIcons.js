const GOLD = '#c9a84c'
const GOLD_DIM = '#8a7440'
const DARK = '#1a1410'
const PARCH = '#e8dcc2'
const CRIMSON = '#a5432e'

function tokenSvg(ring, glyph) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">`
    + `<circle cx="64" cy="64" r="60" fill="${DARK}" stroke="${ring}" stroke-width="5"/>`
    + `<g fill="none" stroke="${GOLD}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>`
    + `</svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(s)
}

const GLYPH = {
  player: `<circle cx="64" cy="50" r="16" fill="${PARCH}" stroke="none"/>`
    + `<path d="M36 94a28 28 0 0 1 56 0z" fill="${PARCH}" stroke="none"/>`,
  npc: `<circle cx="64" cy="50" r="16"/><path d="M38 96c2-16 12-24 26-24s24 8 26 24"/>`,
  monster: `<path d="M40 46l10 12 14-14 14 14 10-12" /><circle cx="52" cy="70" r="5" fill="${GOLD}"/>`
    + `<circle cx="76" cy="70" r="5" fill="${GOLD}"/><path d="M48 86c6 6 22 6 32 0"/>`,
  chest: `<rect x="36" y="54" width="56" height="34" rx="4"/><path d="M36 66h56"/>`
    + `<path d="M36 60a28 10 0 0 1 56 0"/><rect x="58" y="62" width="12" height="10" rx="2" fill="${GOLD}"/>`,
  coins: `<ellipse cx="52" cy="80" rx="22" ry="9"/><ellipse cx="52" cy="72" rx="22" ry="9"/>`
    + `<ellipse cx="52" cy="64" rx="22" ry="9"/><circle cx="84" cy="58" r="16"/><path d="M84 50v16M79 54h7a3 3 0 0 1 0 6h-7"/>`,
  generic: `<circle cx="64" cy="64" r="20"/>`,
}

const RING = { player: GOLD, npc: GOLD_DIM, monster: CRIMSON, chest: GOLD_DIM, coins: GOLD, generic: GOLD_DIM }

const CACHE = {}
export function defaultTokenSrc(iconType) {
  const t = GLYPH[iconType] ? iconType : 'generic'
  return CACHE[t] || (CACHE[t] = tokenSvg(RING[t], GLYPH[t]))
}

export function iconTypeForActorType(actorType) {
  switch (actorType) {
    case 'character': return 'player'
    case 'npc': return 'npc'
    case 'loot-pile': return 'chest'
    default: return 'generic'
  }
}

export function lootIconTypeForItem(item) {
  return item && item.itemType === 'currency' ? 'coins' : 'chest'
}

export function resolveTokenIconType(token, actorType) {
  if (token?.iconType && GLYPH[token.iconType]) return token.iconType
  return iconTypeForActorType(actorType)
}

export const ICON_COLORS = {
  dark: 0x1a1410, gold: 0xc9a84c, goldDim: 0x8a7440, parch: 0xe8dcc2, crimson: 0xa5432e,
  ring: { player: 0xc9a84c, npc: 0x8a7440, monster: 0xa5432e, chest: 0x8a7440, coins: 0xc9a84c, generic: 0x8a7440 },
}

export function defaultActorPortrait(actorType) {
  return defaultTokenSrc(iconTypeForActorType(actorType))
}
