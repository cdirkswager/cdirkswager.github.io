import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getPlayer, getPlayers, getComments, addComment, deleteComment } from '../../data/store'
import { getSession } from '../../data/auth'
import Guestbook from '../common/Guestbook'
import './PlayerPage.css'

function MusicPlayer({ url }) {
  const [playing, setPlaying] = useState(false)
  const [showPlayer, setShowPlayer] = useState(true)
  const audioRef = useState(null)

  useEffect(() => {
    if (!url) return
    const audio = new Audio(url)
    audio.loop = true
    audio.volume = 0.3
    audioRef[0] = audio
    const playPromise = audio.play()
    if (playPromise !== undefined) {
      playPromise.then(() => setPlaying(true)).catch(() => {})
    }
    return () => { audio.pause(); audio.src = '' }
  }, [url])

  const togglePlay = () => {
    const audio = audioRef[0]
    if (!audio) return
    if (playing) { audio.pause(); setPlaying(false) }
    else { audio.play().then(() => setPlaying(true)).catch(() => {}) }
  }

  if (!showPlayer && playing) return null

  return (
    <div className="music-player-bar">
      <button className="music-player-btn" onClick={togglePlay} aria-label={playing ? 'Pause music' : 'Play music'}>
        {playing ? '⏸️' : '🎵'}
      </button>
      <span className="music-player-text">{playing ? 'Now Playing' : 'Click to Play'} </span>
      <button className="music-player-close" onClick={() => setShowPlayer(false)} aria-label="Close music player">✕</button>
    </div>
  )
}

function WidgetContent({ widget, theme, animation }) {
  const animClass = animation ? `animate__${animation}` : 'animate__fadeIn'
  return (
    <div className={`card gold-border widget widget-${widget.type} animate__animated ${animClass}`}>
      {widget.type === 'stats' && (
        <div>
          <h3 className="widget-title">📊 Stats</h3>
          <div className="stats-grid">
            {Object.entries(widget.content || {}).map(([stat, val]) => (
              <div key={stat} className="stat-item">
                <span className="stat-label">{stat.toUpperCase()}</span>
                <span className="stat-value" style={{ color: theme?.accentColor || '#c9a84c' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {widget.type === 'description' && (
        <div>
          <h3 className="widget-title">📜 Description</h3>
          <p className="widget-text">{widget.content}</p>
        </div>
      )}
      {widget.type === 'bio' && (
        <div>
          <h3 className="widget-title">📖 Biography</h3>
          <p className="widget-text">{widget.content}</p>
        </div>
      )}
      {widget.type === 'image' && widget.content && (
        <div>
          <h3 className="widget-title">🖼️ Image</h3>
          <img src={widget.content} alt="Character" className="widget-image" />
        </div>
      )}
      {widget.type === 'custom' && (
        <div>
          <h3 className="widget-title">{widget.title || 'Custom'}</h3>
          <div className="widget-text" dangerouslySetInnerHTML={{ __html: widget.content }} />
        </div>
      )}
      {widget.type === 'music' && widget.content && (
        <div>
          <h3 className="widget-title">🎵 Theme</h3>
          <p className="widget-text" style={{ fontStyle: 'italic' }}>
            &ldquo;{widget.content}&rdquo;
          </p>
        </div>
      )}
    </div>
  )
}

export default function PlayerPage() {
  const { id } = useParams()
  const [player, setPlayer] = useState(null)
  const [allPlayers, setAllPlayers] = useState([])
  const session = getSession()

  useEffect(() => {
    setPlayer(getPlayer(id))
    setAllPlayers(getPlayers())
  }, [id])

  if (!player) {
    return (
      <div className="page container text-center">
        <h2 className="text-gold mb-2">Character Not Found</h2>
        <p className="text-muted mb-3">No adventurer with that ID exists.</p>
        <Link to="/" className="btn btn-primary">Return Home</Link>
      </div>
    )
  }

  const { theme } = player
  const sectionStyle = {
    background: theme?.bgColor || '#0d0d0d',
    color: theme?.textColor || '#e0d5c1',
  }
  if (theme?.bgImage) {
    sectionStyle.backgroundImage = `url(${theme.bgImage})`
    sectionStyle.backgroundSize = 'cover'
    sectionStyle.backgroundPosition = 'center'
  }

  const isOwner = session?.playerId === player.id
  const isDm = session?.role === 'dm'
  const canEdit = isOwner || isDm
  const isTwoColumn = player.layout === 'two-column'
  const anims = player.widgetAnimations || {}

  const splitAt = isTwoColumn ? Math.ceil((player.widgets?.length || 0) / 2) : 0
  const leftWidgets = isTwoColumn ? (player.widgets || []).slice(0, splitAt) : []
  const rightWidgets = isTwoColumn ? (player.widgets || []).slice(splitAt) : []

  return (
    <div className="player-page" style={sectionStyle}>
      {player.musicUrl && <MusicPlayer url={player.musicUrl} />}

      <div className="player-profile">
        <div className="player-banner" style={{
          background: `linear-gradient(135deg, ${theme?.accentColor || '#c9a84c'}33, transparent)`,
        }}>
          <div className="container">
            <div className="player-profile-inner">
              <div className="player-avatar-large" style={{ borderColor: theme?.accentColor || '#c9a84c' }}>
                {player.name.charAt(0)}
              </div>
              <div className="player-profile-info">
                <h1 className="player-name-display" style={{ fontFamily: theme?.fontFamily }}>
                  {player.name}
                </h1>
                <p className="player-subtitle" style={{ color: theme?.accentColor || '#c9a84c' }}>
                  {player.title}
                </p>
                <p className="player-class-display">
                  {player.race} {player.class} &middot; Level {player.level}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={`container player-body ${isTwoColumn ? 'player-body-two-col' : ''}`}>
          {(!player.widgets || player.widgets.length === 0) && (
            <div className="card gold-border text-center">
              <p className="text-muted">This character has no widgets yet.</p>
              {canEdit && (
                <Link to={isOwner ? '/profile' : `/dm/player/${player.id}`} className="btn btn-primary btn-sm mt-2">
                  ✏️ Edit Profile
                </Link>
              )}
            </div>
          )}

          {!isTwoColumn && player.widgets?.map((widget, i) => (
            <WidgetContent key={widget.id || i} widget={widget} theme={theme} animation={anims[i]} />
          ))}

          {isTwoColumn && (
            <>
              <div className="player-col-left">
                {leftWidgets.map((widget, i) => (
                  <WidgetContent key={widget.id || i} widget={widget} theme={theme} animation={anims[i]} />
                ))}
              </div>
              <div className="player-col-right">
                {rightWidgets.map((widget, i) => (
                  <WidgetContent key={widget.id || i} widget={widget} theme={theme} animation={anims[splitAt + i]} />
                ))}
              </div>
            </>
          )}

          {canEdit && player.widgets?.length > 0 && (
            <div className="text-center mt-2">
              <Link to={isOwner ? '/profile' : `/dm/player/${player.id}`} className="btn btn-primary">
                ✏️ {isOwner ? 'Edit My Profile' : 'Edit Profile (DM)'}
              </Link>
            </div>
          )}
        </div>
      </div>

      {player.commentsEnabled !== false && (
        <div className="container mt-3">
          <Guestbook playerId={player.id} />
        </div>
      )}

      <div className="container mt-3">
        <h3 className="text-gold mb-2">🎭 The Party</h3>
        <div className="party-bar">
          {allPlayers
            .filter(p => p.id !== player.id)
            .map(p => (
              <Link key={p.id} to={`/player/${p.id}`} className="party-member">
                <span className="party-avatar">{p.name.charAt(0)}</span>
                <span className="party-name">{p.name.split(' ')[0]}</span>
              </Link>
            ))}
          {allPlayers.length <= 1 && (
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>
              No other party members yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
