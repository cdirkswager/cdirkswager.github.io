import { useState } from 'react'
import Modal from './Modal'

const defaultWidget = { type: 'description', title: '', content: '' }

export default function WidgetEditor({ widget, onSave, onClose, isTwoColumn }) {
  const [form, setForm] = useState(widget ? { ...widget } : { ...defaultWidget })

  const handleTypeChange = (t) => {
    let base = { ...form, type: t }
    if (t === 'stats') base.content = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
    else if (t === 'custom') base.content = base.content || '<p>Custom HTML</p>'
    else if (t === 'music') base = { ...base, content: base.content || '', musicUrl: base.musicUrl || '' }
    else base.content = base.content || ''
    setForm(base)
  }

  const isValid = () => {
    if (!form.type) return false
    if (['description', 'bio'].includes(form.type) && !form.content?.trim()) return false
    if (form.type === 'image' && !form.content?.trim()) return false
    return true
  }

  const handleSave = () => {
    if (!isValid()) return
    onSave(form)
  }

  const isSoundCloud = (url) => url && /soundcloud\.com/i.test(url)

  return (
    <Modal title={widget ? 'Edit Widget' : 'Add Widget'} onClose={onClose}>
      <div className="widget-editor-form">
        <div className="mb-2">
          <label>Widget Type</label>
          <select value={form.type} onChange={e => handleTypeChange(e.target.value)}>
            <option value="description">📜 Description</option>
            <option value="bio">📖 Biography</option>
            <option value="stats">📊 Stats Block</option>
            <option value="image">🖼️ Image</option>
            <option value="music">🎵 Music Player</option>
            <option value="custom">📝 Custom HTML</option>
          </select>
        </div>

        {form.type === 'stats' && (
          <div className="stats-editor-grid">
            {['str', 'dex', 'con', 'int', 'wis', 'cha'].map(stat => (
              <div key={stat}>
                <label>{stat.toUpperCase()}</label>
                <input
                  type="number" min={1} max={30}
                  value={form.content?.[stat] || 10}
                  onChange={e => setForm({ ...form, content: { ...form.content, [stat]: parseInt(e.target.value) || 10 } })}
                />
              </div>
            ))}
          </div>
        )}

        {form.type === 'image' && (
          <>
            <div className="mb-2">
              <label>Image URL</label>
              <input value={form.content || ''} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="https://example.com/portrait.jpg" />
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                Paste a direct link to an image file (.jpg, .png, .gif, .webp). Pinterest and other site links won't work — use the image's direct URL.
              </p>
            </div>
            <div className="mb-2">
              <label>Display Size</label>
              <select value={form.size || 'medium'} onChange={e => setForm({ ...form, size: e.target.value })}>
                <option value="small">Small (200px tall)</option>
                <option value="medium">Medium (350px tall)</option>
                <option value="large">Large (500px tall)</option>
                <option value="original">Original size (no limit)</option>
              </select>
            </div>
          </>
        )}

        {form.type === 'music' && (
          <>
            <div className="mb-2">
              <label>Music / SoundCloud URL</label>
              <input value={form.musicUrl || ''} onChange={e => setForm({ ...form, musicUrl: e.target.value })} placeholder="https://soundcloud.com/artist/track or https://example.com/song.mp3" />
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                Paste a SoundCloud track URL for an embedded player, or a direct audio file link (.mp3, .ogg, .wav) for an audio player.
              </p>
              {isSoundCloud(form.musicUrl) && (
                <p style={{ fontSize: '0.85rem', marginTop: 4, color: 'var(--accent-gold)' }}>
                  ✅ SoundCloud URL detected — will embed a playable player
                </p>
              )}
            </div>
            <div className="mb-2">
              <label>Description (optional)</label>
              <textarea
                value={form.content || ''}
                onChange={e => setForm({ ...form, content: e.target.value })}
                placeholder="A haunting melody drifts through the forest..."
                rows={3}
              />
            </div>
          </>
        )}

        {form.type === 'custom' && (
          <>
            <div className="mb-2">
              <label>Section Title</label>
              <input value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="My Custom Section" />
            </div>
            <div className="mb-2">
              <label>Content (HTML allowed)</label>
              <textarea value={form.content || ''} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="<p>Your custom content here...</p>" rows={5} />
            </div>
          </>
        )}

        {(form.type === 'description' || form.type === 'bio') && (
          <div className="mb-2">
            <label>Content</label>
            <textarea
              value={form.content || ''}
              onChange={e => setForm({ ...form, content: e.target.value })}
              placeholder="Write your content here..."
              rows={4}
            />
          </div>
        )}

        {isTwoColumn && (
          <div className="mb-2">
            <label>Column</label>
            <div className="column-options">
              <label className={`column-option ${!form.column || form.column === 'auto' ? 'active' : ''}`}>
                <input type="radio" name="widget-column" value="auto" checked={!form.column || form.column === 'auto'} onChange={e => setForm({ ...form, column: e.target.value === 'auto' ? undefined : e.target.value })} />
                <span>↔ Auto</span>
              </label>
              <label className={`column-option ${form.column === 'left' ? 'active' : ''}`}>
                <input type="radio" name="widget-column" value="left" checked={form.column === 'left'} onChange={e => setForm({ ...form, column: e.target.value })} />
                <span>← Left</span>
              </label>
              <label className={`column-option ${form.column === 'right' ? 'active' : ''}`}>
                <input type="radio" name="widget-column" value="right" checked={form.column === 'right'} onChange={e => setForm({ ...form, column: e.target.value })} />
                <span>→ Right</span>
              </label>
            </div>
          </div>
        )}

        <div className="text-center mt-2">
          <button className="btn btn-primary" onClick={handleSave}>
            {widget ? '💾 Save' : '➕ Add'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
