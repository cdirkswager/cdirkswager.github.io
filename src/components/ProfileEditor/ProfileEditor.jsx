import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSession } from '../../data/auth'
import { getPlayer, savePlayer, getPlayers } from '../../data/store'
import WidgetEditor from '../common/WidgetEditor'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import './ProfileEditor.css'

const animations = [
  { value: '', label: 'None' },
  { value: 'fadeIn', label: 'Fade In' },
  { value: 'fadeInUp', label: 'Fade In Up' },
  { value: 'fadeInDown', label: 'Fade In Down' },
  { value: 'slideInLeft', label: 'Slide In Left' },
  { value: 'slideInRight', label: 'Slide In Right' },
  { value: 'bounceIn', label: 'Bounce In' },
  { value: 'zoomIn', label: 'Zoom In' },
  { value: 'flipInX', label: 'Flip In' },
]

function SortableWidget({ widget, index, onEdit, onRemove, onMoveUp, onMoveDown, animation, onAnimationChange, isMobile, isFirst, isLast }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className={`widget-item ${isDragging ? 'dragging' : ''}`}>
      <div className="widget-item-drag" {...attributes} {...listeners} aria-label="Drag to reorder">
        {!isMobile && <span className="drag-handle">⠿</span>}
      </div>
      <div className="widget-item-info">
        <span className="widget-item-type">{widget.type}</span>
        <span className="widget-item-preview">
          {widget.type === 'stats' ? '📊 Ability Scores' :
           widget.type === 'description' ? '📜 Description' :
           widget.type === 'bio' ? '📖 Biography' :
           widget.type === 'image' ? '🖼️ Image' :
           widget.type === 'music' ? '🎵 Music' :
           widget.type === 'custom' ? (widget.title || '📝 Custom') : '📦 Widget'}
        </span>
      </div>
      <div className="widget-item-anim">
        <select
          value={animation || ''}
          onChange={e => onAnimationChange(index, e.target.value)}
          onClick={e => e.stopPropagation()}
          aria-label="Animation style"
        >
          {animations.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>
      <div className="widget-item-actions">
        {isMobile && (
          <>
            <button type="button" className="btn btn-sm" onClick={() => onMoveUp(index)} aria-label="Move up" disabled={isFirst}>↑</button>
            <button type="button" className="btn btn-sm" onClick={() => onMoveDown(index)} aria-label="Move down" disabled={isLast}>↓</button>
          </>
        )}
        <button type="button" className="btn btn-sm" onClick={() => onEdit(index)}>✏️</button>
        <button type="button" className="btn btn-sm btn-danger" onClick={() => onRemove(index)}>🗑️</button>
      </div>
    </div>
  )
}

export default function ProfileEditor() {
  const navigate = useNavigate()
  const session = getSession()
  const [player, setPlayer] = useState(null)
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(false)
  const [showWidgetModal, setShowWidgetModal] = useState(false)
  const [editingWidgetIdx, setEditingWidgetIdx] = useState(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  useEffect(() => {
    if (session?.playerId) {
      const p = getPlayer(session.playerId)
      if (p) {
        setPlayer(p)
        setForm(JSON.parse(JSON.stringify(p)))
      }
    }
  }, [session?.playerId])

  if (!player || !form) {
    return (
      <div className="page container text-center">
        <h2 className="text-gold mb-2">Loading...</h2>
      </div>
    )
  }

  const handleChange = (field, value) => {
    setForm({ ...form, [field]: value })
  }

  const handleThemeChange = (key, value) => {
    setForm({ ...form, theme: { ...form.theme, [key]: value } })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const savedPlayer = savePlayer(form)
    setPlayer(savedPlayer)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const openWidget = (idx) => {
    setEditingWidgetIdx(idx)
    setShowWidgetModal(true)
  }

  const saveWidget = (widgetData) => {
    const newWidgets = [...form.widgets]
    if (editingWidgetIdx === null) {
      const w = { ...widgetData, id: 'wid-' + Date.now() }
      newWidgets.push(w)
    } else {
      newWidgets[editingWidgetIdx] = widgetData
    }
    setForm({ ...form, widgets: newWidgets })
    setShowWidgetModal(false)
    setEditingWidgetIdx(null)
  }

  const removeWidget = (idx) => {
    setForm({ ...form, widgets: form.widgets.filter((_, i) => i !== idx) })
  }

  const moveWidget = (idx, dir) => {
    const newWidgets = [...form.widgets]
    const target = idx + dir
    if (target < 0 || target >= newWidgets.length) return
    ;[newWidgets[idx], newWidgets[target]] = [newWidgets[target], newWidgets[idx]]
    setForm({ ...form, widgets: newWidgets })
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = form.widgets.findIndex(w => w.id === active.id)
    const newIdx = form.widgets.findIndex(w => w.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    setForm({ ...form, widgets: arrayMove(form.widgets, oldIdx, newIdx) })
  }

  const setAnimation = (idx, value) => {
    const anims = { ...(form.widgetAnimations || {}) }
    anims[idx] = value
    setForm({ ...form, widgetAnimations: anims })
  }

  return (
    <div className="page">
      <div className="container">
        <div className="flex-between mb-2">
          <div>
            <h1 className="text-gold">🎭 My Profile</h1>
            <p className="text-muted">Customize your character page</p>
          </div>
          <Link to={`/player/${form.id}`} className="btn btn-sm">
            👤 View Page
          </Link>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="card gold-border mb-2">
            <h3 className="widget-title mb-2">📋 Basic Info</h3>
            <div className="editor-grid">
              <div>
                <label>Character Name</label>
                <input value={form.name} onChange={e => handleChange('name', e.target.value)} placeholder="Aragorn" required />
              </div>
              <div>
                <label>Title</label>
                <input value={form.title} onChange={e => handleChange('title', e.target.value)} placeholder="The Wanderer" />
              </div>
              <div>
                <label>Race</label>
                <input value={form.race} onChange={e => handleChange('race', e.target.value)} placeholder="Human" />
              </div>
              <div>
                <label>Class</label>
                <input value={form.class} onChange={e => handleChange('class', e.target.value)} placeholder="Fighter" />
              </div>
              <div>
                <label>Level</label>
                <input type="number" min={1} max={20} value={form.level} onChange={e => handleChange('level', parseInt(e.target.value) || 1)} />
              </div>
              <div>
                <label>Bio</label>
                <textarea value={form.bio} onChange={e => handleChange('bio', e.target.value)} placeholder="Backstory..." rows={3} />
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
                  <input type="color" value={form.theme.bgColor} onChange={e => handleThemeChange('bgColor', e.target.value)} className="color-input" />
                  <input value={form.theme.bgColor} onChange={e => handleThemeChange('bgColor', e.target.value)} placeholder="#0d0d0d" />
                </div>
              </div>
              <div>
                <label>Text Color</label>
                <div className="color-input-group">
                  <input type="color" value={form.theme.textColor} onChange={e => handleThemeChange('textColor', e.target.value)} className="color-input" />
                  <input value={form.theme.textColor} onChange={e => handleThemeChange('textColor', e.target.value)} placeholder="#e0d5c1" />
                </div>
              </div>
              <div>
                <label>Accent Color</label>
                <div className="color-input-group">
                  <input type="color" value={form.theme.accentColor} onChange={e => handleThemeChange('accentColor', e.target.value)} className="color-input" />
                  <input value={form.theme.accentColor} onChange={e => handleThemeChange('accentColor', e.target.value)} placeholder="#c9a84c" />
                </div>
              </div>
              <div>
                <label>Font</label>
                <select value={form.theme.fontFamily} onChange={e => handleThemeChange('fontFamily', e.target.value)}>
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
                <input value={form.theme.bgImage} onChange={e => handleThemeChange('bgImage', e.target.value)} placeholder="https://example.com/background.jpg" />
              </div>
            </div>
          </div>

          <div className="card gold-border mb-2">
            <h3 className="widget-title mb-2">📐 Page Layout</h3>
            <div className="layout-options">
              <label className={`layout-option ${form.layout === 'single' ? 'active' : ''}`}>
                <input type="radio" name="layout" value="single" checked={form.layout === 'single'} onChange={e => handleChange('layout', e.target.value)} />
                <span className="layout-icon">📄</span>
                <span>Single Column</span>
              </label>
              <label className={`layout-option ${form.layout === 'two-column' ? 'active' : ''}`}>
                <input type="radio" name="layout" value="two-column" checked={form.layout === 'two-column'} onChange={e => handleChange('layout', e.target.value)} />
                <span className="layout-icon">📑</span>
                <span>Two Column</span>
              </label>
            </div>
          </div>

          <div className="card gold-border mb-2">
            <h3 className="widget-title mb-2">🎵 Background Music</h3>
            <div className="mb-2">
              <label>Music URL (audio file or embed link)</label>
              <input value={form.musicUrl || ''} onChange={e => handleChange('musicUrl', e.target.value)} placeholder="https://example.com/theme.mp3" />
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                Supports MP3, OGG, WAV files. Will auto-play on page load with a click-to-play fallback.
              </p>
            </div>
            <div>
              <label className="checkbox-label">
                <input type="checkbox" checked={form.commentsEnabled !== false} onChange={e => handleChange('commentsEnabled', e.target.checked)} />
                Enable visitor guestbook on my page
              </label>
            </div>
          </div>

          <div className="card gold-border mb-2">
            <div className="flex-between mb-2">
              <h3 className="widget-title">🧩 Widgets (Page Sections)</h3>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => openWidget(null)}>➕ Add Widget</button>
            </div>
            {form.widgets.length === 0 && (
              <p className="text-muted">No widgets yet. Add a stats block, description, or custom HTML!</p>
            )}
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={form.widgets.map(w => w.id)} strategy={verticalListSortingStrategy}>
                <div className="widget-list">
                  {form.widgets.map((w, i) => (
                    <SortableWidget
                      key={w.id}
                      widget={w}
                      index={i}
                      isFirst={i === 0}
                      isLast={i === form.widgets.length - 1}
                      onEdit={openWidget}
                      onRemove={removeWidget}
                      onMoveUp={(idx) => moveWidget(idx, -1)}
                      onMoveDown={(idx) => moveWidget(idx, 1)}
                      animation={form.widgetAnimations?.[i]}
                      onAnimationChange={setAnimation}
                      isMobile={isMobile}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          <div className="text-center mb-3">
            <button type="submit" className="btn btn-primary">
              {saved ? '✅ Saved!' : '💾 Save Profile'}
            </button>
          </div>
        </form>
      </div>

      {showWidgetModal && (
        <WidgetEditor
          widget={editingWidgetIdx !== null ? form.widgets[editingWidgetIdx] : null}
          onSave={saveWidget}
          onClose={() => { setShowWidgetModal(false); setEditingWidgetIdx(null) }}
        />
      )}
    </div>
  )
}
