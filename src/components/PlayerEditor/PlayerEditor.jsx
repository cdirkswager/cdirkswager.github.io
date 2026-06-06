import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { getPlayer, savePlayer, getPlayers, getNPC, saveNPC, getNPCs, generatePageSource, sanitizeHtml, sanitizeCss } from '../../data/store'
import WidgetEditor from '../common/WidgetEditor'
import Modal from '../common/Modal'
import './PlayerEditor.css'

export default function PlayerEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isNPC = location.pathname.includes('/npc/')
  const [players, setPlayers] = useState([])
  const [selectedId, setSelectedId] = useState(id || 'new')
  const [form, setForm] = useState({
    name: '', class: '', race: '', level: 1, title: '', bio: '',
        theme: { bgColor: '#0d0d0d', textColor: '#e0d5c1', accentColor: '#c9a84c', fontFamily: 'IM Fell English, serif', bgImage: '', bgAnimation: '', bannerUrl: '', bannerOpacity: 0.3 },
    widgets: [],
    customCode: { enabled: false, html: '', css: '' },
  })
  const [showWidgetModal, setShowWidgetModal] = useState(false)
  const [editingWidget, setEditingWidget] = useState(null)
  const [saved, setSaved] = useState(false)
  const [sourceTab, setSourceTab] = useState('html')
  const [showSourcePreview, setShowSourcePreview] = useState(false)

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

  const refresh = useCallback(() => {
    setPlayers(isNPC ? getNPCs() : getPlayers())
  }, [isNPC])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (selectedId === 'new') {
      setForm({
        name: '', class: '', race: '', level: 1, title: '', bio: '',
        avatarUrl: '',
        layout: 'single',
        musicUrl: '',
        commentsEnabled: true,
        theme: { bgColor: '#0d0d0d', textColor: '#e0d5c1', accentColor: '#c9a84c', fontFamily: 'IM Fell English, serif', bgImage: '', bgAnimation: '', bannerUrl: '', bannerOpacity: 0.3 },
        widgets: [],
        widgetAnimations: {},
        customCode: { enabled: false, html: '', css: '' },
      })
    } else {
      const p = isNPC ? getNPC(selectedId) : getPlayer(selectedId)
      if (p) {
        setForm({
          name: p.name,
          class: p.class,
          race: p.race,
          level: p.level,
          title: p.title || '',
          bio: p.bio || '',
          avatarUrl: p.avatarUrl || '',
          layout: p.layout || 'single',
          musicUrl: p.musicUrl || '',
          commentsEnabled: p.commentsEnabled !== false,
          theme: { bgColor: '#0d0d0d', textColor: '#e0d5c1', accentColor: '#c9a84c', fontFamily: 'IM Fell English, serif', bgImage: '', bannerUrl: '', bannerOpacity: 0.3, ...p.theme },
          widgets: [...(p.widgets || [])],
          widgetAnimations: { ...(p.widgetAnimations || {}) },
          customCode: { ...(p.customCode || { enabled: false, html: '', css: '' }) },
        })
      }
    }
  }, [selectedId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const entity = selectedId === 'new'
      ? { ...form, id: undefined }
      : { ...form, id: selectedId }
    const saved = isNPC ? await saveNPC(entity) : await savePlayer(entity)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    if (selectedId === 'new') {
      navigate(isNPC ? `/dm/npc/${saved.id}` : `/dm/player/${saved.id}`, { replace: true })
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

  const moveWidget = (idx, dir) => {
    const newWidgets = [...form.widgets]
    const target = idx + dir
    if (target < 0 || target >= newWidgets.length) return
    ;[newWidgets[idx], newWidgets[target]] = [newWidgets[target], newWidgets[idx]]
    setForm({ ...form, widgets: newWidgets })
  }

  return (
    <div className="page">
      <div className="container">
        <div className="flex-between mb-2">
          <div>
            <h1 className="text-gold">✏️ {id ? 'Edit' : 'Create'} {isNPC ? 'NPC' : 'Player'}</h1>
            <p className="text-muted">{isNPC ? 'Manage non-player characters' : 'DM tools for managing adventurers'}</p>
          </div>
          <div className="flex gap-1">
            {selectedId !== 'new' && (
              <Link to={`/player/${selectedId}`} className="btn btn-sm">
                👤 View Page
              </Link>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => navigate(isNPC ? '/dm/npc/new' : '/dm/players')}>
              ➕ New
            </button>
          </div>
        </div>

        {players.length > 1 && (
          <div className="player-selector mb-2">
            <label>Select {isNPC ? 'NPC' : 'Player'}</label>
            <select
              value={selectedId}
              onChange={e => {
                setSelectedId(e.target.value)
                navigate(e.target.value === 'new'
                  ? (isNPC ? '/dm/npc/new' : '/dm/players')
                  : (isNPC ? `/dm/npc/${e.target.value}` : `/dm/player/${e.target.value}`))
              }}
            >
              <option value="new">— New {isNPC ? 'NPC' : 'Player'} —</option>
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
            <h3 className="widget-title mb-2">🖼️ Avatar</h3>
            <div className="mb-2">
              <label>Avatar Image URL (optional)</label>
              <input value={form.avatarUrl || ''} onChange={e => setForm({ ...form, avatarUrl: e.target.value })} placeholder="https://example.com/character-portrait.jpg" />
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                Direct link to an image file for the character&apos;s portrait/token.
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
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Animated Background Overlay</label>
                <select value={form.theme.bgAnimation || ''} onChange={e => setForm({ ...form, theme: { ...form.theme, bgAnimation: e.target.value } })}>
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
                <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                  Adds a CSS-animated particle effect behind your content. Works alongside your background color/image.
                </p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Banner Image URL (optional)</label>
                <input
                  value={form.theme.bannerUrl || ''}
                  onChange={e => setForm({ ...form, theme: { ...form.theme, bannerUrl: e.target.value } })}
                  placeholder="https://example.com/banner.jpg"
                />
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
                        onChange={e => setForm({ ...form, theme: { ...form.theme, bannerOpacity: parseFloat(e.target.value) } })} />
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
                <input type="radio" name="player-layout" value="single" checked={form.layout === 'single'} onChange={e => setForm({ ...form, layout: e.target.value })} />
                <span className="layout-icon">📄</span>
                <span>Single Column</span>
              </label>
              <label className={`layout-option ${form.layout === 'two-column' ? 'active' : ''}`}>
                <input type="radio" name="player-layout" value="two-column" checked={form.layout === 'two-column'} onChange={e => setForm({ ...form, layout: e.target.value })} />
                <span className="layout-icon">📑</span>
                <span>Two Column</span>
              </label>
            </div>
          </div>

          <div className="card gold-border mb-2">
            <h3 className="widget-title mb-2">🎨 Widget Borders</h3>
            <div className="mb-2">
              <label>Border Style (applies to all widgets)</label>
              <select value={form.widgetBorder || 'default'} onChange={e => setForm({ ...form, widgetBorder: e.target.value })}>
                <option value="default">✨ Default Gold</option>
                <option value="runic">🔷 Runic Blue</option>
                <option value="nature">🌿 Nature Green</option>
                <option value="gothic">🖤 Gothic Dark</option>
                <option value="arcane">🔮 Arcane Purple</option>
                <option value="ember">🔥 Ember Orange</option>
                <option value="celestial">⭐ Celestial Gold</option>
                <option value="shadow">🌑 Shadowfell</option>
              </select>
            </div>
          </div>

          <div className="card gold-border mb-2">
            <h3 className="widget-title mb-2">🎵 Background Music</h3>
            <div className="mb-2">
              <label>Music URL (audio file or embed link)</label>
              <input value={form.musicUrl || ''} onChange={e => setForm({ ...form, musicUrl: e.target.value })} placeholder="https://example.com/theme.mp3" />
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                Supports MP3, OGG, WAV files.
              </p>
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
                <div key={w.id || i} className="widget-item">
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
                    <select
                      value={form.widgetAnimations?.[w.id] || ''}
                      onChange={e => {
                        const anims = { ...(form.widgetAnimations || {}) }
                        anims[w.id] = e.target.value
                        setForm({ ...form, widgetAnimations: anims })
                      }}
                      aria-label="Animation style"
                    >
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
                    <button type="button" className="btn btn-sm" onClick={() => openWidget(w, i)}>✏️</button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeWidget(i)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card gold-border mb-2">
            <div className="flex-between mb-2">
              <h3 className="widget-title">📝 Custom Page Source</h3>
              <div className="flex gap-1">
                <button type="button" className="btn btn-sm" onClick={() => {
                  const generated = generatePageSource(form)
                  setForm({ ...form, customCode: { ...(form.customCode || {}), html: generated.html, css: generated.css } })
                }}>🔄 Regenerate</button>
                <button type="button" className="btn btn-sm" onClick={() => setShowSourcePreview(true)}>👁️ Preview</button>
              </div>
            </div>
            <div className="source-editor-warning" style={{ fontSize: '0.82rem', marginBottom: 12 }}>
              ⚠️ Source Editor is experimental — layouts, animations, and some elements may not render correctly in custom mode.
            </div>
            <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: 12 }}>
              Raw HTML and CSS for full page control. When enabled, replaces the widget layout.
              Rendered in a sandboxed iframe.
            </p>
            <div className="source-editor-tabs" style={{ marginBottom: 8 }}>
              <button type="button" className={`source-tab ${sourceTab === 'html' ? 'active' : ''}`} onClick={() => setSourceTab('html')}>HTML</button>
              <button type="button" className={`source-tab ${sourceTab === 'css' ? 'active' : ''}`} onClick={() => setSourceTab('css')}>CSS</button>
            </div>
            {sourceTab === 'html' && (
              <textarea
                className="source-code-input"
                value={form.customCode?.html || ''}
                onChange={e => setForm({ ...form, customCode: { ...(form.customCode || { enabled: false, html: '', css: '' }), html: e.target.value } })}
                placeholder="<!-- Your custom HTML here -->"
                spellCheck={false}
                rows={10}
              />
            )}
            {sourceTab === 'css' && (
              <textarea
                className="source-code-input"
                value={form.customCode?.css || ''}
                onChange={e => setForm({ ...form, customCode: { ...(form.customCode || { enabled: false, html: '', css: '' }), css: e.target.value } })}
                placeholder="/* Your custom CSS here */"
                spellCheck={false}
                rows={10}
              />
            )}
            <div className="mt-2">
              <label className="source-toggle-label">
                <input type="checkbox" checked={form.customCode?.enabled || false} onChange={e => setForm({ ...form, customCode: { ...(form.customCode || { enabled: false, html: '', css: '' }), enabled: e.target.checked } })} />
                <span>Use custom code instead of widgets</span>
              </label>
            </div>
          </div>

          <div className="text-center mb-3" style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
            {selectedId !== 'new' && (
              <Link to={`/player/${selectedId}`} className="btn">
                👤 View Page
              </Link>
            )}
            <button type="submit" className="btn btn-primary">
              {saved ? '✅ Saved!' : `💾 Save ${isNPC ? 'NPC' : 'Player'}`}
            </button>
          </div>
        </form>
      </div>

      {showWidgetModal && (
        <WidgetEditor
          widget={editingWidget !== null ? form.widgets[editingWidget] : null}
          onSave={saveWidget}
          onClose={() => { setShowWidgetModal(false); setEditingWidget(null) }}
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
