import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getQuestionnaire, saveQuestionnaire } from '../../data/store'
import './Questionnaire.css'

const questionTypes = [
  { value: 'text', label: '📝 Short Text' },
  { value: 'textarea', label: '📄 Long Text' },
  { value: 'number', label: '🔢 Number' },
  { value: 'select', label: '📋 Dropdown' },
  { value: 'radio', label: '🔘 Multiple Choice' },
  { value: 'checkbox', label: '☑️ Checkboxes' },
  { value: 'rating', label: '⭐ Rating (1-10)' },
  { value: 'scale', label: '📊 Slider Scale' },
]

const defaultQuestion = {
  id: '',
  type: 'text',
  label: '',
  required: false,
  placeholder: '',
  options: [''],
  min: 1,
  max: 10,
  scaleMin: 1,
  scaleMax: 10,
  scaleStart: '1',
  scaleEnd: '10',
}

export default function QuestionnaireBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: '',
    description: '',
    questions: [],
  })
  const [editingQ, setEditingQ] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (id) {
      const q = getQuestionnaire(id)
      if (q) setForm({ title: q.title, description: q.description || '', questions: q.questions || [] })
    }
  }, [id])

  const addQuestion = () => {
    const q = { ...defaultQuestion, id: 'q-' + Date.now() }
    setForm({ ...form, questions: [...form.questions, q] })
    setEditingQ(form.questions.length)
  }

  const updateQuestion = (index, updates) => {
    const questions = [...form.questions]
    questions[index] = { ...questions[index], ...updates }
    setForm({ ...form, questions })
  }

  const removeQuestion = (index) => {
    const questions = form.questions.filter((_, i) => i !== index)
    setForm({ ...form, questions })
    if (editingQ === index) setEditingQ(null)
    else if (editingQ > index) setEditingQ(editingQ - 1)
  }

  const moveQuestion = (index, dir) => {
    const questions = [...form.questions]
    const target = index + dir
    if (target < 0 || target >= questions.length) return
    ;[questions[index], questions[target]] = [questions[target], questions[index]]
    setForm({ ...form, questions })
    setEditingQ(target)
  }

  const addOption = (index) => {
    const q = form.questions[index]
    updateQuestion(index, { options: [...(q.options || []), ''] })
  }

  const updateOption = (qIndex, optIndex, value) => {
    const q = form.questions[qIndex]
    const options = [...q.options]
    options[optIndex] = value
    updateQuestion(qIndex, { options })
  }

  const removeOption = (qIndex, optIndex) => {
    const q = form.questions[qIndex]
    const options = q.options.filter((_, i) => i !== optIndex)
    updateQuestion(qIndex, { options })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    const cleanQuestions = form.questions.map(q => {
      const cleaned = { id: q.id, type: q.type, label: q.label, required: q.required }
      if (q.type === 'text' || q.type === 'textarea') cleaned.placeholder = q.placeholder
      if (q.type === 'number') { cleaned.min = q.min; cleaned.max = q.max }
      if (['select', 'radio', 'checkbox'].includes(q.type)) cleaned.options = q.options?.filter(o => o.trim()) || []
      if (q.type === 'scale') { cleaned.scaleMin = q.scaleMin; cleaned.scaleMax = q.scaleMax; cleaned.scaleStart = q.scaleStart; cleaned.scaleEnd = q.scaleEnd }
      return cleaned
    })
    const saved_q = saveQuestionnaire({ ...form, questions: cleanQuestions, id: id || undefined })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    if (!id) navigate(`/dm/questionnaire/${saved_q.id}`, { replace: true })
  }

  return (
    <div className="page">
      <div className="container">
        <div className="flex-between mb-2">
          <div>
            <h1 className="text-gold">📋 {id ? 'Edit' : 'Create'} Questionnaire</h1>
            <p className="text-muted">Build complex forms for your players</p>
          </div>
          {id && (
            <div className="flex gap-1">
              <Link to={`/questionnaire/${id}`} className="btn btn-sm">📝 Preview & Fill</Link>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="card gold-border mb-2">
            <div className="mb-2">
              <label>Form Title</label>
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Character Backstory Survey"
                required
              />
            </div>
            <div className="mb-2">
              <label>Description (optional)</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Tell me about your character's past..."
                rows={2}
              />
            </div>
          </div>

          <div className="card gold-border mb-2">
            <div className="flex-between mb-2">
              <h3 className="widget-title">📝 Questions ({form.questions.length})</h3>
              <button type="button" className="btn btn-sm btn-primary" onClick={addQuestion}>
                ➕ Add Question
              </button>
            </div>

            {form.questions.length === 0 && (
              <p className="text-muted text-center" style={{ padding: 20 }}>
                No questions yet. Click "Add Question" to get started!
              </p>
            )}

            <div className="question-builder-list">
              {form.questions.map((q, i) => (
                <div
                  key={q.id}
                  className={`question-builder-item ${editingQ === i ? 'editing' : ''}`}
                >
                  <div className="question-builder-header">
                    <div className="question-builder-drag">
                      <button type="button" className="btn btn-sm" onClick={() => moveQuestion(i, -1)} disabled={i === 0}>↑</button>
                      <button type="button" className="btn btn-sm" onClick={() => moveQuestion(i, 1)} disabled={i === form.questions.length - 1}>↓</button>
                    </div>
                    <div
                      className="question-builder-summary"
                      onClick={() => setEditingQ(editingQ === i ? null : i)}
                    >
                      <span className="q-number">Q{i + 1}</span>
                      <span className="q-label-preview">
                        {q.label || 'Untitled Question'}
                      </span>
                      <span className="q-type-badge">
                        {questionTypes.find(t => t.value === q.type)?.label || q.type}
                      </span>
                      {q.required && <span className="required-star">*</span>}
                    </div>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeQuestion(i)}>
                      🗑️
                    </button>
                  </div>

                  {editingQ === i && (
                    <div className="question-builder-editor animate__animated animate__fadeIn">
                      <div className="editor-grid">
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label>Question Text</label>
                          <input
                            value={q.label}
                            onChange={e => updateQuestion(i, { label: e.target.value })}
                            placeholder="What is your character's name?"
                          />
                        </div>
                        <div>
                          <label>Type</label>
                          <select
                            value={q.type}
                            onChange={e => updateQuestion(i, { type: e.target.value, options: [''] })}
                          >
                            {questionTypes.map(t => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="flex" style={{ gap: 8, cursor: 'pointer', marginTop: 32 }}>
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={e => updateQuestion(i, { required: e.target.checked })}
                              style={{ width: 'auto', minHeight: 'auto' }}
                            />
                            Required
                          </label>
                        </div>
                        {q.type === 'text' || q.type === 'textarea' ? (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label>Placeholder</label>
                            <input
                              value={q.placeholder || ''}
                              onChange={e => updateQuestion(i, { placeholder: e.target.value })}
                              placeholder="Enter a hint for the player..."
                            />
                          </div>
                        ) : null}
                        {q.type === 'number' ? (
                          <div className="editor-grid" style={{ gridColumn: '1 / -1' }}>
                            <div>
                              <label>Min</label>
                              <input type="number" value={q.min ?? 1} onChange={e => updateQuestion(i, { min: parseInt(e.target.value) })} />
                            </div>
                            <div>
                              <label>Max</label>
                              <input type="number" value={q.max ?? 10} onChange={e => updateQuestion(i, { max: parseInt(e.target.value) })} />
                            </div>
                          </div>
                        ) : null}
                        {['select', 'radio', 'checkbox'].includes(q.type) ? (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label>Options</label>
                            {(q.options || ['']).map((opt, oi) => (
                              <div key={oi} className="option-row">
                                <input
                                  value={opt}
                                  onChange={e => updateOption(i, oi, e.target.value)}
                                  placeholder={`Option ${oi + 1}`}
                                />
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger"
                                  onClick={() => removeOption(i, oi)}
                                  disabled={(q.options || []).length <= 1}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            <button type="button" className="btn btn-sm mt-1" onClick={() => addOption(i)}>
                              ➕ Add Option
                            </button>
                          </div>
                        ) : null}
                        {q.type === 'scale' ? (
                          <div style={{ gridColumn: '1 / -1' }} className="editor-grid">
                            <div>
                              <label>Min Label</label>
                              <input value={q.scaleStart || '1'} onChange={e => updateQuestion(i, { scaleStart: e.target.value })} />
                            </div>
                            <div>
                              <label>Max Label</label>
                              <input value={q.scaleEnd || '10'} onChange={e => updateQuestion(i, { scaleEnd: e.target.value })} />
                            </div>
                            <div>
                              <label>Min Value</label>
                              <input type="number" value={q.scaleMin ?? 1} onChange={e => updateQuestion(i, { scaleMin: parseInt(e.target.value) })} />
                            </div>
                            <div>
                              <label>Max Value</label>
                              <input type="number" value={q.scaleMax ?? 10} onChange={e => updateQuestion(i, { scaleMax: parseInt(e.target.value) })} />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="text-center mb-3">
            <button type="submit" className="btn btn-primary">
              {saved ? '✅ Saved!' : '💾 Save Questionnaire'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
