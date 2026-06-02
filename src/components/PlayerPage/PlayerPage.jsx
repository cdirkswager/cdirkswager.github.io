import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getPlayer, getPlayers, getComments, addComment, deleteComment } from '../../data/store'
import { getSession } from '../../data/auth'
import Guestbook from '../common/Guestbook'
import './PlayerPage.css'

function BackgroundMusicPlayer({ url }) {
  const [playing, setPlaying] = useState(false)
  const [showPlayer, setShowPlayer] = useState(true)
  const audioRef = useRef(null)

  useEffect(() => {
    if (!url) return
    const audio = new Audio(url)
    audio.loop = true
    audio.volume = 0.3
    audioRef.current = audio
    const playPromise = audio.play()
    if (playPromise !== undefined) {
      playPromise.then(() => setPlaying(true)).catch(() => {})
    }
    return () => { audio.pause(); audio.src = '' }
  }, [url])

  const togglePlay = () => {
    const audio = audioRef.current
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

function ImageWidget({ widget }) {
  const [error, setError] = useState(false)
  if (!widget.content) return null
  if (error) {
    return (
      <div>
        <h3 className="widget-title">🖼️ Image</h3>
        <div className="widget-image-error">
          <p>Could not load image. Make sure the URL points directly to an image file (.jpg, .png, .gif, .webp).</p>
          <p className="text-muted" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{widget.content}</p>
        </div>
      </div>
    )
  }
  return (
    <div>
      <h3 className="widget-title">🖼️ Image</h3>
      <img src={widget.content} alt="Character" className="widget-image" onError={() => setError(true)} />
    </div>
  )
}

function MusicWidget({ widget, theme }) {
  const url = widget.musicUrl || ''
  const description = widget.content || ''
  const isSoundCloud = url && /soundcloud\.com/i.test(url)
  const isAudioFile = url && /\.(mp3|ogg|wav|m4a|flac)(\?|$)/i.test(url)
  const [audioError, setAudioError] = useState(false)

  return (
    <div>
      <h3 className="widget-title">🎵 Music</h3>
      {isSoundCloud && (
        <div className="widget-soundcloud">
          <iframe
            src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23c9a84c&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`}
            width="100%"
            height="166"
            frameBorder="no"
            scrolling="no"
            allow="autoplay"
            title="SoundCloud player"
            style={{ borderRadius: 'var(--radius)' }}
          />
        </div>
      )}
      {isAudioFile && !audioError && (
        <div className="widget-audio-player">
          <audio controls preload="metadata" style={{ width: '100%' }}>
            <source src={url} />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}
      {isAudioFile && audioError && (
        <p className="widget-text text-muted">Could not load audio from the provided URL.</p>
      )}
      {!isSoundCloud && !isAudioFile && url && (
        <div className="widget-audio-player">
          <audio controls preload="metadata" style={{ width: '100%' }} onError={() => setAudioError(true)}>
            <source src={url} />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}
      {description && (
        <p className="widget-text" style={{ fontStyle: 'italic', marginTop: url ? 8 : 0 }}>
          &ldquo;{description}&rdquo;
        </p>
      )}
      {!url && !description && (
        <p className="text-muted">No music configured.</p>
      )}
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
      {widget.type === 'image' && <ImageWidget widget={widget} />}
      {widget.type === 'custom' && (
        <div>
          <h3 className="widget-title">{widget.title || 'Custom'}</h3>
          <div className="widget-text" dangerouslySetInnerHTML={{ __html: widget.content }} />
        </div>
      )}
      {widget.type === 'music' && <MusicWidget widget={widget} theme={theme} />}
    </div>
  )
}

export default function PlayerPage() {
  const { id } = useParams()
  const [player, setPlayer] = useState(null)
  const [allPlayers, setAllPlayers] = useState([])
  const [avatarError, setAvatarError] = useState(false)
  const session = getSession()

  useEffect(() => {
    setPlayer(getPlayer(id))
    setAllPlayers(getPlayers())
    setAvatarError(false)
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

  const hasAvatar = player.avatarUrl && !avatarError

  return (
    <div className="player-page" style={sectionStyle}>
      {player.musicUrl && <BackgroundMusicPlayer url={player.musicUrl} />}

      <div className="player-profile">
        <div className="player-banner" style={{
          background: `linear-gradient(135deg, ${theme?.accentColor || '#c9a84c'}33, transparent)`,
        }}>
          <div className="container">
            <div className="player-profile-inner">
              <div className="player-avatar-wrapper">
                <div className="player-avatar-large" style={{ borderColor: theme?.accentColor || '#c9a84c' }}>
                  {hasAvatar ? (
                    <img src={player.avatarUrl} alt={player.name} className="player-avatar-img" onError={() => setAvatarError(true)} />
                  ) : (
                    player.name.charAt(0)
                  )}
                </div>
                {canEdit && (
                  <Link to={isOwner ? '/profile' : `/dm/player/${player.id}`} className="player-avatar-edit" title="Change avatar">
                    📷
                  </Link>
                )}
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
            <WidgetContent key={widget.id || i} widget={widget} theme={theme} animation={anims[widget.id]} />
          ))}

          {isTwoColumn && (
            <>
              <div className="player-col-left">
                {leftWidgets.map((widget, i) => (
                  <WidgetContent key={widget.id || i} widget={widget} theme={theme} animation={anims[widget.id]} />
                ))}
              </div>
              <div className="player-col-right">
                {rightWidgets.map((widget, i) => (
                  <WidgetContent key={widget.id || i} widget={widget} theme={theme} animation={anims[widget.id]} />
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
