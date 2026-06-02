import { useState, useEffect, useCallback } from 'react'
import { getComments, addComment, deleteComment } from '../../data/store'
import { getSession } from '../../data/auth'

export default function Guestbook({ playerId }) {
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmingId, setConfirmingId] = useState(null)
  const session = getSession()
  const isDm = session?.role === 'dm'

  const refresh = useCallback(() => {
    setComments(getComments(playerId))
  }, [playerId])

  useEffect(() => { refresh() }, [refresh])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim() || !session || submitting) return
    setSubmitting(true)
    await addComment(playerId, session.username, text.trim())
    setText('')
    refresh()
    setSubmitting(false)
  }

  const handleDelete = async (commentId) => {
    await deleteComment(commentId, playerId)
    setConfirmingId(null)
    refresh()
  }

  const formatDate = (ts) => {
    const d = new Date(ts)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="card gold-border">
      <h3 className="widget-title mb-2">📝 Guestbook</h3>

      {comments.length === 0 && (
        <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: 16 }}>
          No comments yet. Be the first to leave a message!
        </p>
      )}

      <div className="guestbook-list">
        {comments.map(c => (
          <div key={c.id} className="guestbook-entry">
            <div className="guestbook-entry-header">
              <span className="guestbook-author">{c.author}</span>
              <span className="guestbook-date">{formatDate(c.timestamp)}</span>
            </div>
            <p className="guestbook-text">{c.text}</p>
            {(isDm || session?.username === c.author) && (
              confirmingId === c.id ? (
                <div className="guestbook-confirm">
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Delete?</span>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id)}>Yes</button>
                  <button className="btn btn-sm" onClick={() => setConfirmingId(null)}>No</button>
                </div>
              ) : (
                <button className="btn btn-sm guestbook-delete" onClick={() => setConfirmingId(c.id)} aria-label="Delete comment">
                  🗑️
                </button>
              )
            )}
          </div>
        ))}
      </div>

      {session ? (
        <form className="guestbook-form" onSubmit={handleSubmit}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Leave a message..."
            rows={2}
            required
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
            {submitting ? '...' : 'Post'}
          </button>
        </form>
      ) : (
        <p className="text-muted" style={{ fontSize: '0.9rem' }}>
          <a href="/login">Sign in</a> to leave a comment.
        </p>
      )}
    </div>
  )
}
