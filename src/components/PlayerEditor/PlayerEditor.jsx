import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getPlayer, savePlayer, getPlayers } from '../../data/store'
import WidgetEditor from '../common/WidgetEditor'
import './PlayerEditor.css'

export default function PlayerEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [selectedId, setSelectedId] = useState(id || 'new')
  const [form, setForm] = useState({
    name: '', class: '', race: '', level: 1, title: '', bio: '',
    theme: { bgColor: '#0d0d0d', textColor: '#e0d5c1', accentColor: '#c9a84c', fontFamily: 'IM Fell English, serif', bgImage: '' },
    widgets: [],
  })
  const [showWidgetModal, setShowWidgetModal] = useState(false)
  const [editingWidget, setEditingWidget] = useState(null)
  const [saved, setSaved] = useState(false)

  const refresh = useCallback(() => {
    setPlayers(getPlayers())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (selectedId === 'new') {
      setForm({
        name: '', class: '', race: '', level: 1, title: '', bio: '',
        theme: { bgColor: '#0d0d0d', textColor: '#e0d5c1', accentColor: '#c9a84c', fontFamily: 'IM Fell English, serif', bgImage: '' },
        widgets: [],
      })
    } else {
      const p = getPlayer(selectedId)
      if (p) {
        setForm({
          name: p.name,
          class: p.class,
          race: p.race,
          level: p.level,
          title: p.title || '',
          bio: p.bio || '',
          theme: { ...p.theme },
          widgets: [...(p.widgets || [])],
        })
      }
    }
  }, [selectedId])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const player = selectedId === 'new'
      ? { ...form, id: undefined }
      : { ...form, id: selectedId }
    const saved_player = savePlayer(player)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    if (selectedId === 'new') {
      navigate(`/dm/player/${saved_player.id}`, { replace: true })
    }
    refresh()
  }

  const openWidget = (widget, index) => {
    setEditingWidget(index)
    setShowWidgetModal(true)
  }

  const saveWidget = (widgetData) => {
    const newWidgets = [...form.widgets]
    if (editingWidget === null) {
      const w = { ...widgetData, id: 'wid-' + Date.now() }
      newWidgets.push(w)
    } else {
      newWidgets[editingWidget] = widgetData
    }
    setForm({ ...form, widgets: newWidgets })
    setShowWidgetModal(false)
    setEditingWidget(null)
  }

  const removeWidget = (index) => {
    setForm({ ...form, widgets: form.widgets.filter((_, i) => i !== index) })
  }

  return (
    <div className="page">
      <div className="container">
        <div className="flex-between mb-2">
          <div>
            <h1 className="text-gold">✏️ {id ? 'Edit' : 'Create'} Player</h1>
            <p className="text-muted">DM tools for managing adventurers</p>
          </div>
          <div className="flex gap-1">
            {selectedId !== 'new' && (
              <Link to={`/player/${selectedId}`} className="btn btn-sm">
                👤 View Page
              </Link>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => setSelectedId('new')}>
              ➕ New
            </button>
          </div>
        </div>

        {players.length > 1 && (
          <div className="player-selector mb-2">
            <label>Select Player</label>
            <select
              value={selectedId}
              onChange={e => {
                setSelectedId(e.target.value)
                navigate(e.target.value === 'new' ? '/dm/players' : `/dm/player/${e.target.value}`)
              }}
            >
              <option value="new">— New Player —</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="card gold-border mb-2">
            <h3 className="widget-title mb-2">📋 Basic Info</h3>
            <div className="editor-grid">
              <div>
                <label>Character Name</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Aragorn" required />
              </div>
              <div>
                <label>Title</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="The Wanderer" />
              </div>
              <div>
                <label>Race</label>
                <input value={form.race} onChange={e => setForm({ ...form, race: e.target.value })} placeholder="Human" />
              </div>
              <div>
                <label>Class</label>
                <input value={form.class} onChange={e => setForm({ ...form, class: e.target.value })} placeholder="Fighter" />
              </div>
              <div>
                <label>Level</label>
                <input type="number" min={1} max={20} value={form.level} onChange={e => setForm({ ...form, level: parseInt(e.target.value) || 1 })} />
              </div>
              <div>
                <label>Bio</label>
                <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} placeholder="Backstory..." rows={3} />
              </div>
            </div>
          </div>

          <div className="card gold-border mb-2">
            <h3 className="widget-title mb-2">🎨 Theme (MySpace Style)</h3>
            <div className="theme-preview mb-2" style={{
              background: form.theme.bgColor,
              color: form.theme.textColor,
              borderColor: form.theme.accentColor,
            }}>
              <p style={{ fontFamily: form.theme.fontFamily }}>
                Preview: {form.name || 'Character Name'}
              </p>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                This is how your page will look
              </p>
            </div>
            <div className="editor-grid">
              <div>
                <label>Background Color</label>
                <div className="color-input-group">
                  <input
                    type="color"
                    value={form.theme.bgColor}
                    onChange={e => setForm({ ...form, theme: { ...form.theme, bgColor: e.target.value } })}
                    className="color-input"
                  />
                  <input
                    value={form.theme.bgColor}
                    onChange={e => setForm({ ...form, theme: { ...form.theme, bgColor: e.target.value } })}
                    placeholder="#0d0d0d"
                  />
                </div>
              </div>
              <div>
                <label>Text Color</label>
                <div className="color-input-group">
                  <input
                    type="color"
                    value={form.theme.textColor}
                    onChange={e => setForm({ ...form, theme: { ...form.theme, textColor: e.target.value } })}
                    className="color-input"
                  />
                  <input
                    value={form.theme.textColor}
                    onChange={e => setForm({ ...form, theme: { ...form.theme, textColor: e.target.value } })}
                    placeholder="#e0d5c1"
                  />
                </div>
              </div>
              <div>
                <label>Accent Color</label>
                <div className="color-input-group">
                  <input
                    type="color"
                    value={form.theme.accentColor}
                    onChange={e => setForm({ ...form, theme: { ...form.theme, accentColor: e.target.value } })}
                    className="color-input"
                  />
                  <input
                    value={form.theme.accentColor}
                    onChange={e => setForm({ ...form, theme: { ...form.theme, accentColor: e.target.value } })}
                    placeholder="#c9a84c"
                  />
                </div>
              </div>
              <div>
                <label>Font</label>
                <select
                  value={form.theme.fontFamily}
                  onChange={e => setForm({ ...form, theme: { ...form.theme, fontFamily: e.target.value } })}
                >
                  <option value="IM Fell English, serif">IM Fell English</option>
                  <option value="Cinzel, serif">Cinzel</option>
                  <option value="MedievalSharp, cursive">MedievalSharp</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="serif">Default Serif</option>
                  <option value="sans-serif">Sans Serif</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Background Image URL (optional)</label>
                <input
                  value={form.theme.bgImage}
                  onChange={e => setForm({ ...form, theme: { ...form.theme, bgImage: e.target.value } })}
                  placeholder="https://example.com/background.jpg"
                />
              </div>
            </div>
          </div>

          <div className="card gold-border mb-2">
            <div className="flex-between mb-2">
              <h3 className="widget-title">🧩 Widgets (Page Sections)</h3>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => openWidget(null, null)}>
                ➕ Add Widget
              </button>
            </div>
            {form.widgets.length === 0 && (
              <p className="text-muted">No widgets yet. Add a stats block, description, or custom HTML!</p>
            )}
            <div className="widget-list">
              {form.widgets.map((w, i) => (
                <div key={i} className="widget-item">
                  <div className="widget-item-info">
                    <span className="widget-item-type">{w.type}</span>
                    <span className="widget-item-preview">
                      {w.type === 'stats' ? '📊 Ability Scores' :
                       w.type === 'description' ? '📜 Description' :
                       w.type === 'bio' ? '📖 Biography' :
                       w.type === 'image' ? '🖼️ Image' :
                       w.type === 'music' ? '🎵 Music' :
                       w.type === 'custom' ? (w.title || '📝 Custom') : '📦 Widget'}
                    </span>
                  </div>
                  <div className="widget-item-actions">
                    <button type="button" className="btn btn-sm" onClick={() => openWidget(w, i)}>✏️</button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeWidget(i)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center mb-3">
            <button type="submit" className="btn btn-primary">
              {saved ? '✅ Saved!' : '💾 Save Player'}
            </button>
          </div>
        </form>
      </div>

      {showWidgetModal && (
        <WidgetEditor
          widget={editingWidget !== null ? form.widgets[editingWidget] : null}
          onSave={saveWidget}
          onClose={() => { setShowWidgetModal(false); setEditingWidget(null) }}
        />
      )}
    </div>
  )
}
