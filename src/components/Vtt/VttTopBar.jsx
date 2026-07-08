import { useState, useRef, useEffect, useCallback } from 'react'

const WIDGETS = [
  { id: 'scenes', label: 'Scenes', dmOnly: true },
  { id: 'tokens', label: 'Tokens', dmOnly: true },
  { id: 'actors', label: 'Actors', dmOnly: false },
  { id: 'bg', label: 'Map BG', dmOnly: true },
  { id: 'lighting', label: 'Lighting', dmOnly: true },
]

const TOOLS = [
  { id: 'pan', label: 'Pan', icon: '\u270B' },
  { id: 'token', label: 'Select Token', icon: '\u25CB' },
  { id: 'wall-draw', label: 'Draw Wall', icon: '\u258C', dmOnly: true },
  { id: 'wall-select', label: 'Select Wall', icon: '\u2197', dmOnly: true },
  { id: 'ruler', label: 'Ruler', icon: '\uD83D\uDCCF' },
  { id: 'template', label: 'Template', icon: '\u2B20', dmOnly: true },
]

export default function VttTopBar({ isDm, onAction, onToolSelect, activeTool, activeWidgets, onWidgetsChange }) {
  const [widgetOpen, setWidgetOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const widgetRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target)) setWidgetOpen(false)
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  const available = WIDGETS.filter(w => !w.dmOnly || isDm)
  const tools = TOOLS.filter(t => !t.dmOnly || isDm)

  const MENU_SCREENS = [
    { id: 'inventory', label: 'Inventory', hotkey: 'I' },
    { id: 'loot', label: 'Loot', hotkey: 'L' },
    { id: 'party', label: 'Party', hotkey: 'P' },
    { type: 'divider' },
    { id: 'add-token', label: 'Add Token', hotkey: null, dmOnly: true },
    { id: 'scenes', label: 'Scenes Panel', hotkey: null, dmOnly: true },
    { id: 'tokens-panel', label: 'Tokens Panel', hotkey: null, dmOnly: true },
    { id: 'actors-panel', label: 'Actors Panel', hotkey: null },
    { id: 'bg', label: 'Background Map', hotkey: null, dmOnly: true },
    { id: 'lighting', label: 'Lighting & Vision', hotkey: null, dmOnly: true },
    { type: 'divider' },
    { id: 'disconnect', label: 'Disconnect', hotkey: null },
    { id: 'home', label: 'Leave to Home', hotkey: null },
  ]

  return (
    <div className="vtt-topbar">
      <div className="vtt-topbar-left" ref={widgetRef}>
        <button className="vtt-topbar-btn" onClick={() => setWidgetOpen(o => !o)} title="Widgets">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="6" height="6" rx="1" />
            <rect x="9" y="1" width="6" height="6" rx="1" />
            <rect x="1" y="9" width="6" height="6" rx="1" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
          </svg>
        </button>
        {widgetOpen && (
          <div className="vtt-topbar-dropdown">
            <div className="vtt-dd-section">Panels</div>
            {available.map(w => (
              <label key={w.id} className="vtt-dd-item">
                <input
                  type="checkbox"
                  checked={(activeWidgets || []).includes(w.id)}
                  onChange={() => {
                    const next = (activeWidgets || []).includes(w.id)
                      ? (activeWidgets || []).filter(id => id !== w.id)
                      : [...(activeWidgets || []), w.id]
                    onWidgetsChange?.(next)
                  }}
                />
                {w.label}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="vtt-topbar-tools">
        {tools.map(t => (
          <button
            key={t.id}
            className={`vtt-topbar-tool ${activeTool === t.id ? 'active' : ''}`}
            onClick={() => onToolSelect?.(t.id)}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="vtt-topbar-center" />

      <div className="vtt-topbar-right" ref={menuRef}>
        <button className="vtt-topbar-btn" onClick={() => setMenuOpen(o => !o)} title="Menu">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.5" /><circle cx="8" cy="3" r="1.5" /><circle cx="13" cy="3" r="1.5" />
            <circle cx="3" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="13" cy="8" r="1.5" />
            <circle cx="3" cy="13" r="1.5" /><circle cx="8" cy="13" r="1.5" /><circle cx="13" cy="13" r="1.5" />
          </svg>
        </button>
        {menuOpen && (
          <div className="vtt-topbar-dropdown vtt-topbar-dropdown-right">
            <div className="vtt-dd-section">Screens</div>
            {MENU_SCREENS.filter(i => !i.dmOnly || isDm).map((item, idx) =>
              item.type === 'divider'
                ? <div key={`d${idx}`} className="vtt-dd-divider" />
                : (
                  <button
                    key={item.id}
                    className="vtt-dd-item vtt-dd-action"
                    onClick={() => { setMenuOpen(false); onAction?.(item.id) }}
                  >
                    <span>{item.label}</span>
                    {item.hotkey && <kbd className="vtt-dd-kbd">{item.hotkey}</kbd>}
                  </button>
                )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
