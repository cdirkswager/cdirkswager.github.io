import './SpriteCardGrid.css'

const SPRITES = [
  { id: 'fiix', name: 'Fiix', preview: '/Sprite/Fiix_East.png' },
  { id: 'empty-1', name: '???', empty: true },
  { id: 'empty-2', name: '???', empty: true },
  { id: 'empty-3', name: '???', empty: true },
]

export default function SpriteCardGrid({ activeSprite, onActivate, onDeactivate }) {
  return (
    <div className="sprite-grid-container">
      <h2 className="text-center text-gold mb-3">Sprites</h2>
      <div className="sprite-grid">
        {SPRITES.map((sprite) => {
          const isActive = sprite.id === activeSprite
          return (
            <div
              key={sprite.id}
              id={`sprite-card-${sprite.id}`}
              className={`sprite-card card gold-border ${isActive ? 'active' : ''} ${!sprite.empty && !isActive ? 'populated' : ''}`}
              onClick={() => {
                if (isActive) {
                  onDeactivate?.(sprite.id)
                } else if (!sprite.empty) {
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
                  } else if (!sprite.empty) {
                    onActivate?.(sprite.id)
                  }
                }
              }}
            >
              <div className="sprite-card-visual">
                {(isActive || sprite.empty) ? (
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
