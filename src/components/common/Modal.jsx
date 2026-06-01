import { useEffect, useRef } from 'react'
import './common.css'

export default function Modal({ onClose, title, children, large }) {
  const overlayRef = useRef()
  const contentRef = useRef()

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    contentRef.current?.focus()
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') {
        const focusable = contentRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (!focusable || focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className={`modal-content ${large ? 'modal-large' : ''} animate__animated animate__fadeIn animate__faster`}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">&times;</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  )
}
