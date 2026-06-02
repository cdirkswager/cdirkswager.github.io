import { useState } from 'react'
import Modal from './Modal'

const defaultWidget = { type: 'description', title: '', content: '' }

export default function WidgetEditor({ widget, onSave, onClose }) {
  const [form, setForm] = useState(widget ? { ...widget } : { ...defaultWidget })

  const handleTypeChange = (t) => {
    const base = { ...form, type: t }
    if (t === 'stats') base.content = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
    else if (t === 'custom') base.content = base.content || '<p>Custom HTML</p>'
    else base.content = base.content || ''
    setForm(base)
  }

  const isValid = () => {
    if (!form.type) return false
    if (['description', 'bio', 'music'].includes(form.type) && !form.content?.trim()) return false
    if (form.type === 'image' && !form.content?.trim()) return false
    return true
  }

  const handleSave = () => {
    if (!isValid()) return
    onSave(form)
  }

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
            <option value="music">🎵 Music / Theme</option>
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
          <div className="mb-2">
            <label>Image URL</label>
            <input value={form.content || ''} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="https://example.com/portrait.jpg" />
          </div>
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

        {(form.type === 'description' || form.type === 'bio' || form.type === 'music') && (
          <div className="mb-2">
            <label>Content</label>
            <textarea
              value={form.content || ''}
              onChange={e => setForm({ ...form, content: e.target.value })}
              placeholder={form.type === 'music' ? 'A haunting melody drifts through the forest...' : 'Write your content here...'}
              rows={4}
            />
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
