import { useState, useEffect, useRef, useMemo } from 'react'

function HpBar({ health }) {
  const max = health?.maxHp ?? 1
  const cur = health?.currentHp ?? 0
  const temp = health?.tempHp ?? 0
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0
  const totalPct = max > 0 ? Math.max(0, Math.min(100, ((cur + temp) / max) * 100)) : 0
  return (
    <div className="vtt-party-hp-bar">
      <div className="vtt-party-hp-fill" style={{ width: `${pct}%` }} />
      {temp > 0 && <div className="vtt-party-hp-temp" style={{ width: `${totalPct}%` }} />}
      <span className="vtt-party-hp-text">{cur}/{max}</span>
    </div>
  )
}

export default function VttPartyPanel({ canvas, eventBus, session }) {
  const [actors, setActors] = useState([])

  useEffect(() => {
    const ctrl = canvas?.controller ?? null
    if (!ctrl) return
    function refresh() {
      setActors(Array.from(ctrl.actorMap.values()))
    }
    refresh()
    const off = eventBus?.on('actors-changed', refresh)
    return () => off?.()
  }, [canvas, eventBus])

  const characters = useMemo(
    () => actors.filter(a => a.actorType === 'character'),
    [actors]
  )

  const pets = useMemo(
    () => actors.filter(a => a.actorType === 'pet'),
    [actors]
  )

  const petsByOwner = useMemo(() => {
    const map = {}
    for (const pet of pets) {
      const ownerIds = Object.keys(pet.ownership?.users || {})
      for (const ownerId of ownerIds) {
        if (!map[ownerId]) map[ownerId] = []
        map[ownerId].push(pet)
      }
    }
    return map
  }, [pets])

  return (
    <div className="vtt-panel vtt-party-panel">
      <h4>Party ({characters.length})</h4>
      <div className="vtt-party-list">
        {characters.map(a => {
          const ownerIds = Object.keys(a.ownership?.users || {})
          const actorPets = ownerIds.flatMap(uid => petsByOwner[uid] || [])
          return (
            <div key={a.id} className="vtt-party-member">
              <div className="vtt-party-row">
                <div className="vtt-party-portrait">
                  {a.img ? (
                    <img src={a.img} alt="" className="vtt-party-portrait-img" />
                  ) : (
                    <span className="vtt-party-portrait-fallback">{(a.name || '?')[0]}</span>
                  )}
                </div>
                <div className="vtt-party-row-info">
                  <div className="vtt-party-row-name">{a.name}</div>
                  <HpBar health={a.health} />
                </div>
                {a.health?.tempHp > 0 && (
                  <div className="vtt-party-temp-hp">+{a.health.tempHp}</div>
                )}
              </div>
              {actorPets.length > 0 && (
                <div className="vtt-party-pets">
                  {actorPets.map(pet => (
                    <div key={pet.id} className="vtt-party-row vtt-party-row--pet">
                      <div className="vtt-party-portrait vtt-party-portrait--pet">
                        {pet.img ? (
                          <img src={pet.img} alt="" className="vtt-party-portrait-img" />
                        ) : (
                          <span className="vtt-party-portrait-fallback">{(pet.name || '?')[0]}</span>
                        )}
                      </div>
                      <div className="vtt-party-row-info">
                        <div className="vtt-party-row-name">{pet.name}</div>
                        <HpBar health={pet.health} />
                      </div>
                      {pet.health?.tempHp > 0 && (
                        <div className="vtt-party-temp-hp">+{pet.health.tempHp}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
