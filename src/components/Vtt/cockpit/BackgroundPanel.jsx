import { useState, useCallback, useRef } from 'react'
import { uploadImage } from '../../../data/api.js'

/* ── Background image upload panel (DM) ────────────────────── */
export default function BackgroundPanel({ canvas, eventBus, scene }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const handleUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0]
    if (!file || !canvas || !eventBus || !scene) return
    setUploading(true)
    try {
      const result = await uploadImage(file, 'vtt')
      if (result.ok) {
        const imgUrl = result.url
        const oldBg = scene.tiles.find(t => t.isBackground)
        if (oldBg) {
          scene.removeTile(oldBg.id)
          canvas.renderer.removeTile(oldBg.id)
          eventBus.emitRecord('tile', 'deleted', { id: oldBg.id })
        }
        const { Tile } = await import('../../../vtt/canvas/Tile.js')
        const tile = new Tile({
          src: imgUrl,
          x: 0, y: 0,
          width: scene.width,
          height: scene.height,
          zIndex: -1,
          isBackground: true,
          id: 'scene-bg-' + Date.now(),
        })
        scene.addTile(tile)
        canvas.renderer.addTile(tile)
        eventBus.emitRecord('tile', 'created', tile.toJSON())
      }
    } catch (e) {
      console.error('Background upload failed', e)
    }
    setUploading(false)
  }, [canvas, eventBus, scene])

  return (
    <div className="vtt-panel vtt-bg-panel">
      <h4>Background Map</h4>
      <input type="file" ref={fileRef} accept="image/*" className="vtt-file-input" />
      <button onClick={handleUpload} disabled={uploading} className="btn btn-sm vtt-connect-btn">
        {uploading ? 'Uploading...' : 'Set as Background'}
      </button>
    </div>
  )
}
