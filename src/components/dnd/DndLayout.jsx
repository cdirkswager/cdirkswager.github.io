import { Link } from 'react-router-dom'
import { TopNav } from './TopNav'
import './DndGlobals.css'

export function DndLayout({ children }) {
  return (
    <div className="min-h-screen bg-ink text-fg font-sans">
      <TopNav />
      <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-3">
        <div className="mb-2">
          <Link to="/dm" className="text-xs text-dim hover:text-fg">← Back to DM Tools</Link>
        </div>
        {children}
      </div>
    </div>
  )
}
