import { useState, useEffect } from 'react'
import { TopNav } from './TopNav'
import { CommandPalette } from './CommandPalette'
import { PartyGauge } from './PartyGauge'
import './DndGlobals.css'

export function DndLayout({ children }) {
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const down = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    const openSearch = () => setSearchOpen(true)
    window.addEventListener('keydown', down)
    window.addEventListener('dnd-open-search', openSearch)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('dnd-open-search', openSearch)
    }
  }, [])

  return (
    <div className="dnd-layout min-h-screen bg-ink text-fg font-sans">
      <TopNav onSearchClick={() => setSearchOpen(true)} />
      <div className="mx-auto max-w-[1400px] px-4 pb-32 pt-3">
        {children}
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <PartyGauge />
    </div>
  )
}
