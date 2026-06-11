import './SpriteCardGrid.css'

const SPRITES = [
  { id: 'fiix-1', name: 'Fiix', preview: '/Sprite/Fiix_East.png' },
  { id: 'fiix-2', name: 'Fiix', preview: '/Sprite/Fiix_East.png' },
  { id: 'fiix-3', name: 'Fiix', preview: '/Sprite/Fiix_East.png' },
  { id: 'fiix-4', name: 'Fiix', preview: '/Sprite/Fiix_East.png' },
]

export default function SpriteCardGrid({ activeSprites, onActivate, onDeactivate }) {
  return (
    <div className="sprite-grid-container">
      <h2 className="text-center text-gold mb-3">Sprites</h2>
      <div className="sprite-grid">
        {SPRITES.map((sprite) => {
          const isActive = activeSprites?.[sprite.id]
          return (
            <div
              key={sprite.id}
              id={`sprite-card-${sprite.id}`}
              className={`sprite-card card gold-border ${isActive ? 'active' : ''} ${!isActive ? 'populated' : ''}`}
              onClick={() => {
                if (isActive) {
                  onDeactivate?.(sprite.id)
                } else {
                  onActivate?.(sprite.id)
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (isActive) {
                    onDeactivate?.(sprite.id)
                  } else {
                    onActivate?.(sprite.id)
                  }
                }
              }}
              onDoubleClick={() => {
                if (isActive) {
                  onDeactivate?.(sprite.id, true)
                }
              }}
            >
              <div className="sprite-card-visual">
                {isActive ? (
                  <div className="sprite-card-placeholder">
                    <span className="sprite-card-question">?</span>
                  </div>
                ) : (
                  <img
                    src={sprite.preview}
                    alt={sprite.name}
                    className="sprite-card-img"
                    draggable={false}
                  />
                )}
              </div>
              <span className="sprite-card-name">{sprite.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}