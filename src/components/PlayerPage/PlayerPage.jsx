import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getPlayer, getPlayers, getNPC, savePlayer, generatePageSource, sanitizeHtml, sanitizeCss } from '../../data/store'
import { getSession } from '../../data/auth'
import Guestbook from '../common/Guestbook'
import Modal from '../common/Modal'
import NotificationsPanel from '../Notifications/NotificationsPanel'
import './PlayerPage.css'

function SkullsParticles() {
  const skulls = useMemo(() => {
    const items = []
    for (let i = 0; i < 8; i++) {
      items.push({
        id: i,
        left: Math.random() * 90 + 5,
        top: Math.random() * 80 + 5,
        delay: Math.random() * 18,
        duration: 14 + Math.random() * 10,
        size: 1.2 + Math.random() * 1.6,
      })
    }
    return items
  }, [])
  return (
    <div className="bg-anim-skulls-layer" aria-hidden="true">
      {skulls.map(s => (
        <span
          key={s.id}
          className="bg-anim-skull-float"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            fontSize: `${s.size}rem`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        >💀</span>
      ))}
    </div>
  )
}

function BackgroundMusicPlayer({ url }) {
  const [playing, setPlaying] = useState(false)
  const [audioError, setAudioError] = useState(false)
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
      playPromise.then(() => setPlaying(true)).catch(() => setAudioError(true))
    }
    return () => { audio.pause(); audio.src = '' }
  }, [url])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio || audioError) return
    if (playing) { audio.pause(); setPlaying(false) }
    else { audio.play().then(() => setPlaying(true)).catch(() => setAudioError(true)) }
  }

  if (!showPlayer) return null

  return (
    <div className="music-player-bar">
      <button className="music-player-btn" onClick={togglePlay} aria-label={playing ? 'Pause music' : 'Play music'}>
        {playing ? '⏸️' : audioError ? '⚠️' : '🎵'}
      </button>
      <span className="music-player-text">
        {playing ? 'Now Playing' : audioError ? 'Audio unavailable' : 'Click to Play'}
      </span>
      <button className="music-player-close" onClick={() => setShowPlayer(false)} aria-label="Close music player">✕</button>
    </div>
  )
}

const imageSizes = {
  small: { maxHeight: 200 },
  medium: { maxHeight: 350 },
  large: { maxHeight: 500 },
  original: { maxHeight: '90vh' },
}

function ImageWidget({ widget }) {
  const [error, setError] = useState(false)
  if (!widget.content) return null
  const sizeStyle = imageSizes[widget.size] || imageSizes.medium
  const imgClass = 'widget-image' + (widget.size === 'original' ? ' widget-image-original' : '')
  const imgStyle = widget.size === 'original' ? { maxHeight: '90vh' } : { ...sizeStyle }
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
      <div className="widget-image-container" style={sizeStyle}>
        <img src={widget.content} alt="Character" className={imgClass} style={imgStyle} onError={() => setError(true)} />
      </div>
    </div>
  )
}

function MusicWidget({ widget, theme }) {
  const url = widget.musicUrl || ''
  const description = widget.content || ''
  const isSoundCloud = url && /soundcloud\.com/i.test(url)
  const isAudioFile = url && /\.(mp3|ogg|wav|m4a|flac)(\?|$)/i.test(url)
  const isSpotify = url && /open\.spotify\.com/i.test(url)
  const [audioError, setAudioError] = useState(false)

  const spotifyEmbedUrl = isSpotify
    ? url.replace(/^https?:\/\/open\.spotify\.com\//, 'https://open.spotify.com/embed/')
    : null

  return (
    <div>
      <h3 className="widget-title">🎵 Music</h3>
      {isSpotify && (
        <div className="widget-spotify">
          <iframe
            src={spotifyEmbedUrl}
            width="100%"
            height="80"
            frameBorder="no"
            allow="encrypted-media"
            title="Spotify player"
            style={{ borderRadius: 'var(--radius)' }}
          />
        </div>
      )}
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
          <audio controls preload="metadata" style={{ width: '100%' }} onError={() => setAudioError(true)}>
            <source src={url} />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}
      {isAudioFile && audioError && (
        <p className="widget-text text-muted">Could not load audio from the provided URL.</p>
      )}
      {!isSoundCloud && !isAudioFile && !isSpotify && url && (
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

function CarouselWidget({ widget }) {
  const [index, setIndex] = useState(0)
  const [errors, setErrors] = useState({})
  const images = widget.content || []
  const current = images[index]

  if (images.length === 0) return null

  const prev = () => setIndex(i => (i === 0 ? images.length - 1 : i - 1))
  const next = () => setIndex(i => (i === images.length - 1 ? 0 : i + 1))

  return (
    <div>
      <h3 className="widget-title">🖼️ Images</h3>
      <div className="carousel-container">
        <div className="carousel-slide">
          {errors[index] ? (
            <div className="widget-image-error">
              <p>Could not load image.</p>
              <p className="text-muted" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{current?.url}</p>
            </div>
          ) : (
            <img
              src={current?.url}
              alt={current?.caption || `Image ${index + 1}`}
              className="carousel-image"
              onError={() => setErrors(prev => ({ ...prev, [index]: true }))}
            />
          )}
          {current?.caption && <p className="carousel-caption">{current.caption}</p>}
        </div>
        {images.length > 1 && (
          <div className="carousel-controls">
            <button className="carousel-btn" onClick={prev} aria-label="Previous image">◀</button>
            <div className="carousel-dots">
              {images.map((_, i) => (
                <button key={i} className={`carousel-dot ${i === index ? 'active' : ''}`} onClick={() => setIndex(i)} aria-label={`Go to image ${i + 1}`} />
              ))}
            </div>
            <button className="carousel-btn" onClick={next} aria-label="Next image">▶</button>
          </div>
        )}
      </div>
    </div>
  )
}

function WidgetContent({ widget, theme, animation, session, borderStyle }) {
  const animClass = animation ? `animate__${animation}` : 'animate__fadeIn'
  const borderClass = borderStyle && borderStyle !== 'default' ? `widget-border-${borderStyle}` : ''
  return (
    <div className={`card gold-border widget widget-${widget.type} animate__animated ${animClass} ${borderClass}`.trim()}>
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
      {widget.type === 'carousel' && session && <CarouselWidget widget={widget} />}
    </div>
  )
}

export default function PlayerPage() {
  const { id } = useParams()
  const [player, setPlayer] = useState(null)
  const [allPlayers, setAllPlayers] = useState([])
  const [isNPC, setIsNPC] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const session = getSession()

  const [showSourcePanel, setShowSourcePanel] = useState(false)
  const [sourceTab, setSourceTab] = useState('html')
  const [editHtml, setEditHtml] = useState('')
  const [editCss, setEditCss] = useState('')
  const [sourceEnabled, setSourceEnabled] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [sourceSaved, setSourceSaved] = useState(false)
  const iframeRef = useRef(null)

  useEffect(() => {
    let p = getPlayer(id) || getNPC(id)
    setPlayer(p)
    setAllPlayers(getPlayers())
    setIsNPC(p ? p.id.startsWith('npc-') : false)
    setAvatarError(false)
    if (p?.customCode) {
      setEditHtml(p.customCode.html || '')
      setEditCss(p.customCode.css || '')
      setSourceEnabled(p.customCode.enabled || false)
    }
  }, [id])

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const y = window.scrollY
      const progress = max > 0 ? Math.min(y / max, 1) : 0
      document.documentElement.style.setProperty('--scroll-y', `${y}px`)
      document.documentElement.style.setProperty('--scroll-progress', String(progress))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const fullDoc = useMemo(() => {
    if (!editHtml) return ''
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">
<style>${sanitizeCss(editCss)}</style>
</head>
<body>${sanitizeHtml(editHtml.replace(/<!DOCTYPE[\s\S]*?>[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, ''))}</body>
</html>`
  }, [editHtml, editCss])

  const openSourcePanel = () => {
    if (!player) return
    const cc = player.customCode || { enabled: false, html: '', css: '' }
    if (!cc.html && !cc.css) {
      const generated = generatePageSource(player)
      setEditHtml(generated.html)
      setEditCss(generated.css)
    } else {
      setEditHtml(cc.html)
      setEditCss(cc.css)
    }
    setSourceEnabled(cc.enabled)
    setSourceTab('html')
    setShowSourcePanel(true)
  }

  const regenerateSource = () => {
    const generated = generatePageSource(player)
    setEditHtml(generated.html)
    setEditCss(generated.css)
  }

  const saveSource = async () => {
    if (!player) return
    const updated = {
      ...player,
      customCode: {
        enabled: sourceEnabled,
        html: editHtml,
        css: editCss,
      },
    }
    await savePlayer(updated)
    setPlayer(updated)
    setSourceSaved(true)
    setTimeout(() => setSourceSaved(false), 2000)
  }

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

  let leftWidgets = []
  let rightWidgets = []
  if (isTwoColumn) {
    const widgets = player.widgets || []
    const left = []
    const right = []
    widgets.forEach(w => {
      if (w.column === 'left') left.push(w)
      else if (w.column === 'right') right.push(w)
      else {
        if (left.length <= right.length) left.push(w)
        else right.push(w)
      }
    })
    leftWidgets = left
    rightWidgets = right
  }

  const hasAvatar = player.avatarUrl && !avatarError

  const useCustomCode = player.customCode?.enabled && (player.customCode?.html?.trim() || player.customCode?.css?.trim())

  return (
    <div className={`player-page ${useCustomCode ? 'player-page-source' : ''}`} style={sectionStyle}>
      {theme?.bgAnimation && theme.bgAnimation !== 'none' && (
        <div className={`bg-anim-overlay bg-anim-${theme.bgAnimation}`} aria-hidden="true">
          {theme.bgAnimation === 'skulls' && <SkullsParticles />}
        </div>
      )}
      {player.musicUrl && <BackgroundMusicPlayer url={player.musicUrl} />}

      <div className="player-profile">
        <div className="player-banner" style={theme?.bannerUrl ? {
            backgroundImage: `url(${theme.bannerUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : {
            background: `linear-gradient(135deg, ${theme?.accentColor || '#c9a84c'}33, transparent)`,
          }}>
            {theme?.bannerUrl && <div className="player-banner-overlay" style={{ opacity: theme?.bannerOpacity ?? 0.3 }} />}
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

          {isOwner && (
            <div className="container" style={{ position: 'relative', marginTop: 0, paddingTop: 8, paddingBottom: 0 }}>
              <NotificationsPanel playerId={player.id} />
            </div>
          )}

        {useCustomCode ? (
          <div className="container player-source-container">
            <iframe
              ref={iframeRef}
              className="player-source-frame"
              sandbox="allow-scripts"
              srcDoc={fullDoc}
              title="Character Page"
            />
            {canEdit && (
              <div className="text-center mt-2">
                <button className="btn" onClick={openSourcePanel}>
                  🔧 Edit Source
                </button>
              </div>
            )}
          </div>
        ) : (
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
              <WidgetContent key={widget.id || i} widget={widget} theme={theme} animation={anims[widget.id]} session={session} borderStyle={player.widgetBorder} />
            ))}
            {isTwoColumn && (
              <>
                <div className="player-col-left">
                  {leftWidgets.map((widget, i) => (
                    <WidgetContent key={widget.id || i} widget={widget} theme={theme} animation={anims[widget.id]} session={session} borderStyle={player.widgetBorder} />
                  ))}
                </div>
                <div className="player-col-right">
                  {rightWidgets.map((widget, i) => (
                    <WidgetContent key={widget.id || i} widget={widget} theme={theme} animation={anims[widget.id]} session={session} borderStyle={player.widgetBorder} />
                  ))}
                </div>
              </>
            )}

            {canEdit && (
              <div className="text-center mt-2" style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link to={isOwner ? '/profile' : `/dm/player/${player.id}`} className="btn btn-primary">
                  ✏️ {isOwner ? 'Edit My Profile' : 'Edit Profile (DM)'}
                </Link>
                <button className="btn" onClick={openSourcePanel}>
                  🔧 Edit Source
                </button>
                {!isNPC && <Link to={`/player/${player.id}/downtime`} className="btn">📜 Chronicle</Link>}
              </div>
            )}
          </div>
        )}
      </div>

      {player.commentsEnabled !== false && (
        <div className="container mt-3">
          <Guestbook playerId={player.id} />
        </div>
      )}

      {!isNPC && (
      <div className="container mt-3">
        <h3 className="text-gold mb-2">🎭 The Party</h3>
        <div className="party-bar">
          {allPlayers
            .filter(p => p.id !== player.id)
            .map(p => (
              <Link key={p.id} to={`/player/${p.id}`} className="party-member">
                <span className="party-avatar">{p.name?.charAt(0) || '?'}</span>
                <span className="party-name">{(p.name?.split(' ')[0]) || '??'}</span>
              </Link>
            ))}
          {allPlayers.length <= 1 && (
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>
              No other party members yet.
            </p>
          )}
        </div>
      </div>
      )}

      {showSourcePanel && (
        <div className="source-editor-overlay" onClick={() => setShowSourcePanel(false)}>
          <div className="source-editor-panel animate__animated animate__slideInUp" onClick={e => e.stopPropagation()}>
            <div className="source-editor-warning">⚠️ Source Editor is experimental — layouts, animations, and some elements may not render correctly in custom mode.</div>
            <div className="source-editor-header">
              <h3 className="source-editor-title">📝 Page Source</h3>
              <div className="source-editor-header-actions">
                <button className="btn btn-sm" onClick={regenerateSource} title="Rebuild from your widget data">
                  🔄 Regenerate
                </button>
                <button className="btn btn-sm" onClick={() => setShowPreview(true)} title="Preview your custom code">
                  👁️ Preview
                </button>
                <button className="source-editor-close" onClick={() => setShowSourcePanel(false)}>✕</button>
              </div>
            </div>

            <div className="source-editor-tabs">
              <button className={`source-tab ${sourceTab === 'html' ? 'active' : ''}`} onClick={() => setSourceTab('html')}>HTML</button>
              <button className={`source-tab ${sourceTab === 'css' ? 'active' : ''}`} onClick={() => setSourceTab('css')}>CSS</button>
            </div>

            <div className="source-editor-body">
              {sourceTab === 'html' && (
                <textarea
                  className="source-code-input"
                  value={editHtml}
                  onChange={e => setEditHtml(e.target.value)}
                  placeholder="<!-- Your custom HTML here -->"
                  spellCheck={false}
                />
              )}
              {sourceTab === 'css' && (
                <textarea
                  className="source-code-input"
                  value={editCss}
                  onChange={e => setEditCss(e.target.value)}
                  placeholder="/* Your custom CSS here */"
                  spellCheck={false}
                />
              )}
            </div>

            <div className="source-editor-footer">
              <label className="source-toggle-label">
                <input type="checkbox" checked={sourceEnabled} onChange={e => setSourceEnabled(e.target.checked)} />
                <span>Use custom code instead of widgets</span>
              </label>
              <div className="source-editor-footer-actions">
                <button className="btn" onClick={() => setShowSourcePanel(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveSource}>
                  {sourceSaved ? '✅ Saved!' : '💾 Save Source'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <Modal title="👁️ Source Preview" onClose={() => setShowPreview(false)} large>
          <div className="source-preview-frame-wrapper">
            <iframe
              className="source-preview-frame"
              sandbox="allow-scripts"
              srcDoc={fullDoc}
              title="Source Preview"
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
