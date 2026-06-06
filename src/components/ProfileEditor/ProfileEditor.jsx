import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSession } from '../../data/auth'
import { getPlayer, savePlayer, generatePageSource, sanitizeHtml, sanitizeCss } from '../../data/store'
import WidgetEditor from '../common/WidgetEditor'
import Modal from '../common/Modal'
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
      {widget.column && widget.column !== 'auto' && (
        <span className={`widget-item-column col-${widget.column}`}>{widget.column === 'left' ? '←L' : '→R'}</span>
      )}
      <div className="widget-item-anim">
        <select
          value={animation || ''}
          onChange={e => onAnimationChange(widget.id, e.target.value)}
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
  const [sourceTab, setSourceTab] = useState('html')
  const [showSourcePreview, setShowSourcePreview] = useState(false)
  const dirtyRef = useRef(false)

  const sourcePreviewDoc = useMemo(() => {
    const cc = form?.customCode || { html: '', css: '' }
    if (!cc.html) return ''
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">
<style>${sanitizeCss(cc.css)}</style>
</head>
<body>${sanitizeHtml(cc.html.replace(/<!DOCTYPE[\s\S]*?>[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, ''))}</body>
</html>`
  }, [form?.customCode])

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    setIsMobile(mq.matches)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (session?.playerId) {
      const p = getPlayer(session.playerId)
      if (p) {
        setPlayer(p)
        const parsed = JSON.parse(JSON.stringify(p))
        if (!parsed.theme) parsed.theme = {}
        if (parsed.theme.bannerOpacity === undefined) parsed.theme.bannerOpacity = 0.3
        setForm(parsed)
        dirtyRef.current = false
      }
    }
  }, [session?.playerId])

  useEffect(() => {
    const handler = (e) => {
      if (dirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const markDirty = (next) => {
    setForm(next)
    dirtyRef.current = true
  }

  if (!player || !form) {
    return (
      <div className="page container text-center">
        <h2 className="text-gold mb-2">Loading...</h2>
      </div>
    )
  }

  const handleChange = (field, value) => {
    markDirty({ ...form, [field]: value })
  }

  const handleThemeChange = (key, value) => {
    markDirty({ ...form, theme: { ...form.theme, [key]: value } })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.name.trim()) return
    const savedPlayer = await savePlayer(form)
    setPlayer(savedPlayer)
    setSaved(true)
    dirtyRef.current = false
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
    markDirty({ ...form, widgets: newWidgets })
    setShowWidgetModal(false)
    setEditingWidgetIdx(null)
  }

  const removeWidget = (idx) => {
    markDirty({ ...form, widgets: form.widgets.filter((_, i) => i !== idx) })
  }

  const moveWidget = (idx, dir) => {
    const newWidgets = [...form.widgets]
    const target = idx + dir
    if (target < 0 || target >= newWidgets.length) return
    ;[newWidgets[idx], newWidgets[target]] = [newWidgets[target], newWidgets[idx]]
    markDirty({ ...form, widgets: newWidgets })
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = form.widgets.findIndex(w => w.id === active.id)
    const newIdx = form.widgets.findIndex(w => w.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    markDirty({ ...form, widgets: arrayMove(form.widgets, oldIdx, newIdx) })
  }

  const setAnimation = (widgetId, value) => {
    const anims = { ...(form.widgetAnimations || {}) }
    anims[widgetId] = value
    markDirty({ ...form, widgetAnimations: anims })
  }

  const regenerateSource = () => {
    const generated = generatePageSource(form)
    markDirty({ ...form, customCode: { ...(form.customCode || {}), html: generated.html, css: generated.css } })
  }

  const handleSourceChange = (field, value) => {
    markDirty({ ...form, customCode: { ...(form.customCode || { enabled: false, html: '', css: '' }), [field]: value } })
  }

  return (
    <div className="page">
      <div className="container">
        <div className="flex-between mb-2">
          <div>
            <h1 className="text-gold">🎭 My Profile</h1>
            <p className="text-muted">Customize your character page</p>
          </div>
          <div className="flex gap-1">
            <button type="submit" form="profile-form" className="btn btn-sm btn-primary">
              💾 Save
            </button>
            <Link to={`/player/${form.id}`} className="btn btn-sm" onClick={e => { if (dirtyRef.current && !window.confirm('You have unsaved changes. Leave anyway?')) e.preventDefault() }}>
              👤 View Page
            </Link>
          </div>
        </div>

        <form id="profile-form" onSubmit={handleSubmit}>
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
            <h3 className="widget-title mb-2">🖼️ Avatar</h3>
            <div className="mb-2">
              <label>Avatar Image URL (optional)</label>
              <input value={form.avatarUrl || ''} onChange={e => handleChange('avatarUrl', e.target.value)} placeholder="https://example.com/character-portrait.jpg" />
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                Paste a direct link to an image file for your character&apos;s portrait/token.
              </p>
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
                <div className="bg-presets">
                  {['Fields1.jpg','Fields2.jpg','Heim2.jpg','Night Ocean.jpg','VillageHuntingGuild_Original_Day.jpg'].map(name => (
                    <button key={name} type="button" className={`bg-preset-btn ${form.theme.bgImage === `/images/${name}` ? 'active' : ''}`}
                      onClick={() => handleThemeChange('bgImage', `/images/${name}`)}>
                      {name.replace(/\.jpg$/,'').replace(/_/g,' ')}
                    </button>
                  ))}
                  {form.theme.bgImage && (
                    <button type="button" className="bg-preset-btn bg-preset-clear"
                      onClick={() => handleThemeChange('bgImage', '')}>
                      ✕ Clear
                    </button>
                  )}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Animated Background Overlay</label>
                <select value={form.theme.bgAnimation || ''} onChange={e => handleThemeChange('bgAnimation', e.target.value)}>
                  <option value="">None</option>
                  <option value="rain">🌧️ Rain</option>
                  <option value="snow">❄️ Snow</option>
                  <option value="stars">✨ Stars</option>
                  <option value="sparkles">🌟 Sparkles</option>
                  <option value="fog">🌫️ Fog</option>
                  <option value="aurora">🌌 Aurora</option>
                  <option value="embers">🔥 Embers</option>
                  <option value="blood">🩸 Blood</option>
                  <option value="skulls">💀 Skulls</option>
                  <option value="clouds">☁️ Clouds</option>
                  <option value="grass">🌿 Grass</option>
                </select>
                {form.theme.bgAnimation && (
                  <div className="bg-anim-preview-wrap">
                    <div className={`bg-anim-preview bg-anim-${form.theme.bgAnimation}`}>
                      <span className="bg-anim-preview-label">{
                        {rain:'🌧️ Rain',snow:'❄️ Snow',stars:'✨ Stars',sparkles:'🌟 Sparkles',fog:'🌫️ Fog',aurora:'🌌 Aurora',embers:'🔥 Embers',blood:'🩸 Blood',skulls:'💀 Skulls',clouds:'☁️ Clouds',grass:'🌿 Grass'}[form.theme.bgAnimation]
                      }</span>
                    </div>
                  </div>
                )}
                <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                  Adds a CSS-animated particle effect behind your content. Works alongside your background color/image.
                </p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Banner Image URL (optional)</label>
                <input value={form.theme.bannerUrl || ''} onChange={e => handleThemeChange('bannerUrl', e.target.value)} placeholder="https://example.com/banner.jpg" />
                <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                  Background image behind the character name, avatar, and title at the top of the page.
                </p>
                {form.theme.bannerUrl && (
                  <>
                    <div className="banner-preview">
                      <div className="banner-preview-inner" style={{
                        backgroundImage: `url(${form.theme.bannerUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        position: 'relative',
                      }}>
                        <div className="banner-preview-overlay" style={{ opacity: form.theme.bannerOpacity ?? 0.3 }} />
                        <div className="banner-preview-content">
                          <span className="banner-preview-avatar">{form.name?.charAt(0) || '?'}</span>
                          <div>
                            <strong style={{ color: form.theme.accentColor }}>{form.name || 'Character Name'}</strong>
                            <p className="text-muted" style={{ fontSize: '0.75rem' }}>Banner preview</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="banner-opacity-row">
                      <label className="banner-opacity-label">Overlay darkness: {Math.round((form.theme.bannerOpacity ?? 0.3) * 100)}%</label>
                      <input type="range" min="0" max="1" step="0.05" value={form.theme.bannerOpacity ?? 0.3}
                        onChange={e => handleThemeChange('bannerOpacity', parseFloat(e.target.value))} />
                    </div>
                  </>
                )}
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
            <h3 className="widget-title mb-2">🎨 Widget Borders</h3>
            <div className="mb-2">
              <label>Border Style (applies to all widgets)</label>
              <select value={form.widgetBorder || 'default'} onChange={e => handleChange('widgetBorder', e.target.value)}>
                <option value="default">✨ Default Gold</option>
                <option value="runic">🔷 Runic Blue</option>
                <option value="nature">🌿 Nature Green</option>
                <option value="gothic">🖤 Gothic Dark</option>
                <option value="arcane">🔮 Arcane Purple</option>
                <option value="ember">🔥 Ember Orange</option>
                <option value="celestial">⭐ Celestial Gold</option>
                <option value="shadow">🌑 Shadowfell</option>
              </select>
              <div className="widget-border-preview-wrap">
                <div className={`widget-border-preview${form.widgetBorder !== 'default' ? ' widget-border-' + form.widgetBorder : ''}`}>
                  <div className="widget-border-preview-header">
                    <span className="widget-border-preview-icon">📊</span>
                    <span className="widget-border-preview-name">Stats Preview</span>
                  </div>
                  <div className="widget-border-preview-stats">
                    <div className="preview-stat-row"><span>STR</span><span className="preview-stat-val">16</span></div>
                    <div className="preview-stat-row"><span>DEX</span><span className="preview-stat-val">14</span></div>
                    <div className="preview-stat-row"><span>INT</span><span className="preview-stat-val">12</span></div>
                  </div>
                </div>
              </div>
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
          </div>

          <div className="card gold-border mb-2">
            <div className="flex-between mb-2">
              <h3 className="widget-title">🧩 Widgets (Page Sections)</h3>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => openWidget(null)}>➕ Add Widget</button>
            </div>
            {form.widgets.length === 0 && (
              <p className="text-muted">No widgets yet. Add a stats block, description, or custom HTML!</p>
            )}
            {form.layout === 'two-column' && form.widgets.length > 0 ? (
              (() => {
                const left = [], right = []
                form.widgets.forEach((w, i) => {
                  if (w.column === 'left') left.push(i)
                  else if (w.column === 'right') right.push(i)
                  else {
                    if (left.length <= right.length) left.push(i)
                    else right.push(i)
                  }
                })
                const renderItem = (w, i) => (
                  <div key={w.id} className="widget-item">
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
                    {w.column && w.column !== 'auto' && (
                      <span className={`widget-item-column col-${w.column}`}>{w.column === 'left' ? '←L' : '→R'}</span>
                    )}
                    <div className="widget-item-anim">
                      <select value={form.widgetAnimations?.[w.id] || ''} onChange={e => setAnimation(w.id, e.target.value)} aria-label="Animation style">
                        <option value="">None</option>
                        <option value="fadeIn">Fade In</option>
                        <option value="fadeInUp">Fade In Up</option>
                        <option value="fadeInDown">Fade In Down</option>
                        <option value="slideInLeft">Slide In Left</option>
                        <option value="slideInRight">Slide In Right</option>
                        <option value="bounceIn">Bounce In</option>
                        <option value="zoomIn">Zoom In</option>
                        <option value="flipInX">Flip In</option>
                      </select>
                    </div>
                    <div className="widget-item-actions">
                      <button type="button" className="btn btn-sm" onClick={() => moveWidget(i, -1)} disabled={i === 0}>↑</button>
                      <button type="button" className="btn btn-sm" onClick={() => moveWidget(i, 1)} disabled={i === form.widgets.length - 1}>↓</button>
                      <button type="button" className="btn btn-sm" onClick={() => openWidget(i)}>✏️</button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => removeWidget(i)}>🗑️</button>
                    </div>
                  </div>
                )
                return (
                  <div className="widget-list-two-col">
                    <div className="widget-col">
                      <div className="widget-col-header">← Left Column</div>
                      {left.map(i => renderItem(form.widgets[i], i))}
                    </div>
                    <div className="widget-col">
                      <div className="widget-col-header">→ Right Column</div>
                      {right.map(i => renderItem(form.widgets[i], i))}
                    </div>
                  </div>
                )
              })()
            ) : (
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
                        animation={form.widgetAnimations?.[w.id]}
                        onAnimationChange={setAnimation}
                        isMobile={isMobile}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <div className="card gold-border mb-2">
            <div className="flex-between mb-2">
              <h3 className="widget-title">📝 Custom Page Source</h3>
              <div className="flex gap-1">
                <button type="button" className="btn btn-sm" onClick={regenerateSource}>🔄 Regenerate</button>
                <button type="button" className="btn btn-sm" onClick={() => setShowSourcePreview(true)}>👁️ Preview</button>
              </div>
            </div>
            <div className="source-editor-warning" style={{ fontSize: '0.82rem', marginBottom: 12 }}>
              ⚠️ Source Editor is experimental — layouts, animations, and some elements may not render correctly in custom mode.
            </div>
            <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: 12 }}>
              Write raw HTML and CSS for full control over your character page. When enabled, this replaces the widget layout.
              Your custom code is rendered in a sandboxed iframe for security.
            </p>
            <div className="source-editor-tabs" style={{ marginBottom: 8 }}>
              <button type="button" className={`source-tab ${sourceTab === 'html' ? 'active' : ''}`} onClick={() => setSourceTab('html')}>HTML</button>
              <button type="button" className={`source-tab ${sourceTab === 'css' ? 'active' : ''}`} onClick={() => setSourceTab('css')}>CSS</button>
            </div>
            {sourceTab === 'html' && (
              <textarea
                className="source-code-input"
                value={form.customCode?.html || ''}
                onChange={e => handleSourceChange('html', e.target.value)}
                placeholder="<!-- Your custom HTML here -->"
                spellCheck={false}
                rows={10}
              />
            )}
            {sourceTab === 'css' && (
              <textarea
                className="source-code-input"
                value={form.customCode?.css || ''}
                onChange={e => handleSourceChange('css', e.target.value)}
                placeholder="/* Your custom CSS here */"
                spellCheck={false}
                rows={10}
              />
            )}
            <div className="mt-2">
              <label className="source-toggle-label">
                <input type="checkbox" checked={form.customCode?.enabled || false} onChange={e => handleSourceChange('enabled', e.target.checked)} />
                <span>Use custom code instead of widgets</span>
              </label>
            </div>
          </div>

          <div className="text-center mb-3 flex gap-1" style={{ justifyContent: 'center' }}>
            <button type="submit" className="btn btn-primary">
              {saved ? '✅ Saved!' : '💾 Save Profile'}
            </button>
            <Link to={`/player/${form.id}`} className="btn" onClick={e => { if (dirtyRef.current && !window.confirm('You have unsaved changes. Leave anyway?')) e.preventDefault() }}>
              👤 View Page
            </Link>
          </div>
        </form>
      </div>

      {showWidgetModal && (
        <WidgetEditor
          widget={editingWidgetIdx !== null ? form.widgets[editingWidgetIdx] : null}
          onSave={saveWidget}
          onClose={() => { setShowWidgetModal(false); setEditingWidgetIdx(null) }}
          isTwoColumn={form.layout === 'two-column'}
        />
      )}

      {showSourcePreview && (
        <Modal title="👁️ Source Preview" onClose={() => setShowSourcePreview(false)} large>
          <div className="source-preview-frame-wrapper">
            <iframe
              className="source-preview-frame"
              sandbox="allow-scripts"
              srcDoc={sourcePreviewDoc}
              title="Source Preview"
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
