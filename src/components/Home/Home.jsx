import { Link } from 'react-router-dom'
import { getPlayers } from '../../data/store'
import { useEffect, useState } from 'react'
import './Home.css'

export default function Home() {
  const [players, setPlayers] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setPlayers(getPlayers())
    setLoaded(true)
  }, [])

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-bg" />
        <div className="container hero-content">
          <div className={`hero-text ${loaded ? 'animate__animated animate__fadeIn' : ''}`}>
            <h1 className="hero-title">The Hunt</h1>
            <p className="hero-subtitle">A Medieval Fantasy Campaign</p>
            <p className="hero-desc">
              Fate has brought you together. The road ahead is dark and uncertain.
              Stand united, for the realm depends on you.
            </p>
            <div className="hero-actions">
              <Link to="/map" className="btn btn-primary">
                🗺️ Explore the Map
              </Link>
              <Link to="/dm" className="btn">
                ⚔️ DM Tools
              </Link>
            </div>
          </div>
          <div className={`hero-emblem float ${loaded ? 'animate__animated animate__fadeIn' : ''}`}>
            <div className="emblem-ring">
              <span className="emblem-icon">🐉</span>
            </div>
          </div>
        </div>
      </section>

      <section className="container page">
        <div className="gold-border card" style={{ marginBottom: 32 }}>
          <h2 className="text-center text-gold mb-2">📜 Campaign Overview</h2>
          <p className="text-center text-secondary">
            Welcome, adventurers. This hub will guide you through the realm.
            Track your progress, mark the map, and forge your legend.
          </p>
        </div>

        <h2 className="text-center text-gold mb-3">⚔️ The Party</h2>
        {players.length === 0 ? (
          <p className="text-center text-muted">
            No adventurers yet. The DM must recruit a party!
          </p>
        ) : (
          <div className="grid grid-2">
            {players.map((player, i) => (
              <Link
                to={`/player/${player.id}`}
                key={player.id}
                className={`player-card card gold-border ${loaded ? 'animate__animated animate__fadeIn' : ''}`}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="player-card-avatar">
                  {player.name.charAt(0)}
                </div>
                <div className="player-card-info">
                  <h3 className="player-card-name">{player.name}</h3>
                  <p className="player-card-class">
                    {player.race} {player.class} &middot; Level {player.level}
                  </p>
                  <p className="player-card-title text-gold">{player.title}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="text-center mt-3">
          <Link to="/dm/players" className="btn btn-primary">
            ✨ Add New Player (DM Only)
          </Link>
        </div>
      </section>
    </div>
  )
}
