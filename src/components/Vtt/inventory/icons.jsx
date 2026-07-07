/* Small stroke icons for the inventory chrome. currentColor-driven. */
import React from 'react'

const S = (p) => ({ width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', ...p })

export const IconMenu = (p) => <svg {...S(p)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
export const IconMap = (p) => <svg {...S(p)}><path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" /><path d="M9 4v14M15 6v14" /></svg>
export const IconBag = (p) => <svg {...S(p)}><path d="M6 8h12l1 12H5L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></svg>
export const IconBook = (p) => <svg {...S(p)}><path d="M5 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2Z" /><path d="M17 6v14" /></svg>
export const IconUser = (p) => <svg {...S(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
export const IconClose = (p) => <svg {...S(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
export const IconCoin = (p) => <svg {...S(p)}><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 9.5h4a2 2 0 0 1 0 4h-4" /></svg>
export const IconWeight = (p) => <svg {...S(p)}><path d="M8 8h8l2 12H6L8 8Z" /><circle cx="12" cy="6" r="2" /></svg>
export const IconSearch = (p) => <svg {...S(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
export const IconChevron = (p) => <svg {...S(p)}><path d="m6 9 6 6 6-6" /></svg>
export const IconGrid = (p) => <svg {...S(p)}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>
export const IconPotion = (p) => <svg {...S(p)}><path d="M10 4h4v5l3 6a4 4 0 0 1-10 0l3-6Z" /><path d="M9 4h6M7 15h10" /></svg>
export const IconLeaf = (p) => <svg {...S(p)}><path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14Z" /><path d="M5 19 15 9" /></svg>
export const IconRing = (p) => <svg {...S(p)}><circle cx="12" cy="14" r="6" /><path d="m9 6 3 3 3-3-1.5-2h-3Z" /></svg>
export const IconScroll = (p) => <svg {...S(p)}><path d="M6 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5Z" /><path d="M6 5a2 2 0 0 0-2 2v2h2M9 9h6M9 13h4" /></svg>
export const IconKey = (p) => <svg {...S(p)}><circle cx="8" cy="8" r="4" /><path d="m11 11 8 8M16 16l2-2M18 18l2-2" /></svg>
