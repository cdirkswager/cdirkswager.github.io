import React from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'

export function Draggable({ id, data, disabled, className, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data, disabled })
  return (
    <div
      ref={setNodeRef}
      className={className}
      style={{ opacity: isDragging ? 0.3 : 1, cursor: disabled ? 'default' : 'grab', touchAction: 'none' }}
      {...(disabled ? {} : listeners)}
      {...attributes}
    >
      {children}
    </div>
  )
}

export function Droppable({ id, data, disabled, className, activeClass = 'inv-drop-over', children }) {
  const { setNodeRef, isOver } = useDroppable({ id, data, disabled })
  return (
    <div ref={setNodeRef} className={`${className || ''}${isOver && !disabled ? ` ${activeClass}` : ''}`}>
      {children}
    </div>
  )
}
