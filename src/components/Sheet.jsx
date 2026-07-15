import React, { useEffect, useRef, useState } from 'react'

// Bottom sheet: a scrim + a bottom-anchored panel that layers over a static base
// screen. Drag the handle down (or tap the scrim / press Esc) to dismiss. This is
// the pattern that keeps the locked shell intact while still fitting an order form.
export default function Sheet({ open, onClose, title, children }) {
  const [drag, setDrag] = useState(0)
  const startY = useRef(null)

  useEffect(() => {
    if (!open) return
    setDrag(0)
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const pointY = (e) => (e.touches ? e.touches[0].clientY : e.clientY)
  const onDown = (e) => { startY.current = pointY(e) }
  const onMove = (e) => {
    if (startY.current == null) return
    setDrag(Math.max(0, pointY(e) - startY.current))
  }
  const onUp = () => {
    if (drag > 90) onClose()      // dragged far enough → dismiss
    startY.current = null
    setDrag(0)
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" style={{ transform: drag ? `translateY(${drag}px)` : undefined }} onClick={e => e.stopPropagation()}>
        <div className="sheet-grab"
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}>
          <span className="sheet-handle" />
        </div>
        {title && <div className="sheet-head">{title}</div>}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
