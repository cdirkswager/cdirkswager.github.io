import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getQuestionnaire, getPlayers, saveResponse, getResponses } from '../../data/store'
import './Questionnaire.css'

export default function Questionnaire() {
  const { id } = useParams()
  const [questionnaire, setQuestionnaire] = useState(null)
  const [players, setPlayers] = useState([])
  const [answers, setAnswers] = useState({})
  const [playerId, setPlayerId] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [responses, setResponses] = useState([])

  useEffect(() => {
    setQuestionnaire(getQuestionnaire(id))
    setPlayers(getPlayers())
    setResponses(getResponses(id))
  }, [id])

  if (!questionnaire) {
    return (
      <div className="page container text-center">
        <h2 className="text-gold mb-2">Form Not Found</h2>
        <p className="text-muted mb-3">This questionnaire doesn't exist.</p>
        <Link to="/" className="btn btn-primary">Return Home</Link>
      </div>
    )
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!playerId) return
    saveResponse({ questionnaireId: id, playerId, answers })
    setSubmitted(true)
    setResponses(getResponses(id))
  }

  const answerQuestion = (qId, value) => {
    setAnswers({ ...answers, [qId]: value })
  }

  const handleCheckbox = (qId, option, checked) => {
    const current = answers[qId] || []
    const updated = checked
      ? [...current, option]
      : current.filter(v => v !== option)
    setAnswers({ ...answers, [qId]: updated })
  }

  if (submitted) {
    return (
      <div className="page container text-center">
        <div className="card gold-border" style={{ maxWidth: 500, margin: '0 auto' }}>
          <div className="animate__animated animate__fadeIn">
            <h2 className="text-gold mb-2">✅ Submitted!</h2>
            <p className="mb-3">Your responses have been recorded.</p>
            <button className="btn btn-primary" onClick={() => { setSubmitted(false); setAnswers({}); setPlayerId('') }}>
              📝 Submit Another Response
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="container">
        <div className="card gold-border questionnaire-card">
          <div className="questionnaire-header">
            <h1 className="text-gold">{questionnaire.title}</h1>
            {questionnaire.description && (
              <p className="text-muted mt-1">{questionnaire.description}</p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="questionnaire-form">
            <div className="mb-3">
              <label>Your Character</label>
              <select
                value={playerId}
                onChange={e => setPlayerId(e.target.value)}
                required
              >
                <option value="">— Select your character —</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {questionnaire.questions?.map((q, i) => (
              <div
                key={q.id}
                className="question-block animate__animated animate__fadeIn"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <label className="question-label">
                  {q.label}
                  {q.required && <span className="required-star">*</span>}
                </label>

                {q.type === 'text' && (
                  <input
                    type="text"
                    value={answers[q.id] || ''}
                    onChange={e => answerQuestion(q.id, e.target.value)}
                    required={q.required}
                    placeholder={q.placeholder || ''}
                  />
                )}

                {q.type === 'textarea' && (
                  <textarea
                    value={answers[q.id] || ''}
                    onChange={e => answerQuestion(q.id, e.target.value)}
                    required={q.required}
                    placeholder={q.placeholder || ''}
                    rows={4}
                  />
                )}

                {q.type === 'number' && (
                  <input
                    type="number"
                    value={answers[q.id] || ''}
                    onChange={e => answerQuestion(q.id, e.target.value)}
                    required={q.required}
                    min={q.min}
                    max={q.max}
                  />
                )}

                {q.type === 'select' && (
                  <select
                    value={answers[q.id] || ''}
                    onChange={e => answerQuestion(q.id, e.target.value)}
                    required={q.required}
                  >
                    <option value="">— Select —</option>
                    {q.options?.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}

                {q.type === 'radio' && (
                  <div className="radio-group">
                    {q.options?.map(opt => (
                      <label key={opt} className="radio-label">
                        <input
                          type="radio"
                          name={q.id}
                          value={opt}
                          checked={answers[q.id] === opt}
                          onChange={e => answerQuestion(q.id, e.target.value)}
                          required={q.required}
                        />
                        <span className="radio-custom" />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'checkbox' && (
                  <div className="checkbox-group">
                    {q.options?.map(opt => (
                      <label key={opt} className="checkbox-label">
                        <input
                          type="checkbox"
                          value={opt}
                          checked={(answers[q.id] || []).includes(opt)}
                          onChange={e => handleCheckbox(q.id, opt, e.target.checked)}
                        />
                        <span className="checkbox-custom" />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'rating' && (
                  <div className="rating-group">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <button
                        key={n}
                        type="button"
                        className={`rating-btn ${(answers[q.id] ? parseInt(answers[q.id]) : 0) >= n ? 'active' : ''}`}
                        onClick={() => answerQuestion(q.id, String(n))}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}

                {q.type === 'scale' && (
                  <div className="scale-group">
                    <span className="scale-start">{q.scaleStart || '1'}</span>
                    <input
                      type="range"
                      min={q.scaleMin || 1}
                      max={q.scaleMax || 10}
                      value={answers[q.id] || q.scaleMin || 1}
                      onChange={e => answerQuestion(q.id, e.target.value)}
                      className="scale-input"
                    />
                    <span className="scale-end">{q.scaleEnd || '10'}</span>
                    <span className="scale-value">{answers[q.id] || q.scaleMin || 1}</span>
                  </div>
                )}
              </div>
            ))}

            <div className="text-center mt-3">
              <button type="submit" className="btn btn-primary" style={{ minWidth: 200 }}>
                📤 Submit
              </button>
            </div>
          </form>
        </div>

        {responses.length > 0 && (
          <div className="card gold-border mt-3">
            <h3 className="widget-title mb-2">📊 Previous Responses ({responses.length})</h3>
            <div className="responses-list">
              {responses.map((r, i) => (
                <details key={r.id} className="response-item">
                  <summary className="response-summary">
                    Response #{i + 1} — {players.find(p => p.id === r.playerId)?.name || 'Unknown'}
                    <span className="text-muted" style={{ fontSize: '0.8rem', marginLeft: 8 }}>
                      {new Date(r.submittedAt).toLocaleDateString()}
                    </span>
                  </summary>
                  <div className="response-detail">
                    {questionnaire.questions?.map(q => (
                      <div key={q.id} className="response-field">
                        <strong>{q.label}:</strong>{' '}
                        {Array.isArray(r.answers[q.id])
                          ? r.answers[q.id].join(', ')
                          : r.answers[q.id] || '(no answer)'}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
