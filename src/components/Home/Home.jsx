import { Link } from 'react-router-dom'
import { getPlayers } from '../../data/store'
import { useEffect, useState, useRef } from 'react'
import './Home.css'

function initGenieIdle(root = document) {
  const q = (s) => root.querySelector(s)
  const qa = (s) => root.querySelectorAll(s)

  const genie = q('#genie')
  const lamp = q('#lamp')
  const eyes = q('#eyes')
  const shadow = q('#shadow')
  const handL = q('#hand-left')
  const handR = q('#hand-right')
  const sparkles = qa('.sparkle')
  const levGlow = q('#lev-glow')
  const levRings = qa('.lev-ring')
  const levDust = qa('.lev-dust')

  const EASE = 'cubic-bezier(.45,.05,.55,.95)'
  const animations = []

  animations.push(genie.animate([
    { transform: 'translateY(2px)  rotate(-1deg)' },
    { transform: 'translateY(-10px) rotate(1.2deg)' },
    { transform: 'translateY(2px)  rotate(-1deg)' },
  ], { duration: 3800, iterations: Infinity, easing: EASE }))

  animations.push(lamp.animate([
    { transform: 'scale(1, 1)' },
    { transform: 'scale(1.015, 0.985)' },
    { transform: 'scale(0.992, 1.012)' },
    { transform: 'scale(1, 1)' },
  ], { duration: 3200, iterations: Infinity, easing: EASE }))

  animations.push(shadow.animate([
    { transform: 'scaleX(1)', opacity: 0.22 },
    { transform: 'scaleX(0.78)', opacity: 0.10 },
    { transform: 'scaleX(1)', opacity: 0.22 },
  ], { duration: 3800, iterations: Infinity, easing: EASE }))

  animations.push(levGlow.animate([
    { transform: 'scale(0.9)', opacity: 0.55 },
    { transform: 'scale(1.08)', opacity: 0.9 },
    { transform: 'scale(0.9)', opacity: 0.55 },
  ], { duration: 3800, iterations: Infinity, easing: EASE }))

  levRings.forEach((r, i) => {
    animations.push(r.animate([
      { transform: 'scale(0.4)', opacity: 0 },
      { transform: 'scale(0.62)', opacity: 0.7, offset: 0.18 },
      { transform: 'scale(1.3)', opacity: 0 },
    ], { duration: 2600, delay: i * 870, iterations: Infinity, easing: 'ease-out' }))
  })

  levDust.forEach((d, i) => {
    animations.push(d.animate([
      { transform: 'translateY(6px)  scale(0.5)', opacity: 0 },
      { transform: 'translateY(-3px) scale(1)', opacity: 1, offset: 0.3 },
      { transform: 'translateY(-20px) scale(0.4)', opacity: 0 },
    ], { duration: 2200, delay: i * 420, iterations: Infinity, easing: 'ease-out' }))
  })

  animations.push(handL.animate(
    [{ transform: 'rotate(0deg)' }, { transform: 'rotate(7deg)' }, { transform: 'rotate(0deg)' }],
    { duration: 2600, iterations: Infinity, easing: EASE }))
  animations.push(handR.animate(
    [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(0deg)' }],
    { duration: 2950, iterations: Infinity, easing: EASE }))

  sparkles.forEach((s, i) => {
    animations.push(s.animate([
      { transform: 'scale(0.2) rotate(0deg)', opacity: 0 },
      { transform: 'scale(1)   rotate(45deg)', opacity: 1 },
      { transform: 'scale(0.2) rotate(90deg)', opacity: 0 },
    ], { duration: 1900, delay: i * 480, iterations: Infinity, easing: 'ease-in-out' }))
  })

  let blinkTimer = null
  function blink() {
    eyes.animate(
      [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.06)' }, { transform: 'scaleY(1)' }],
      { duration: 190, easing: 'ease-in-out' })
  }
  function scheduleBlink() {
    blinkTimer = setTimeout(() => {
      blink()
      if (Math.random() < 0.25) setTimeout(blink, 250)
      scheduleBlink()
    }, 2200 + Math.random() * 3200)
  }
  scheduleBlink()

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    animations.forEach(a => a.cancel())
    clearTimeout(blinkTimer)
  }

  function wave() {
    const waveHand = (el, angle) => {
      el.animate([
        { transform: 'rotate(0deg)' },
        { transform: `rotate(${angle}deg)` },
        { transform: `rotate(0deg)` },
        { transform: `rotate(${angle}deg)` },
        { transform: 'rotate(0deg)' },
      ], { duration: 500, easing: 'ease-in-out' })
    }
    waveHand(handL, 28)
    waveHand(handR, -28)
    blink()
    setTimeout(blink, 300)
  }

  return {
    pause() { animations.forEach(a => a.pause()) },
    play() { animations.forEach(a => a.play()) },
    wave,
    destroy() {
      animations.forEach(a => a.cancel())
      clearTimeout(blinkTimer)
    },
  }
}

const SFX = ['/recordings/Hello1.m4a', '/recordings/Hello2.m4a', '/recordings/Heretohelp.m4a']

export default function Home() {
  const [players, setPlayers] = useState([])
  const [loaded, setLoaded] = useState(false)
  const stageRef = useRef(null)
  const ctlRef = useRef(null)
  const cooldownRef = useRef(0)

  useEffect(() => {
    setPlayers(getPlayers())
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    const stage = stageRef.current
    if (!stage) return
    const ctl = initGenieIdle(stage)
    ctlRef.current = ctl
    return () => ctl.destroy()
  }, [loaded])

  const handleLampClick = () => {
    ctlRef.current?.wave()
    const now = Date.now()
    if (now - cooldownRef.current < 20000) return
    cooldownRef.current = now
    const audio = new Audio(SFX[Math.floor(Math.random() * SFX.length)])
    audio.volume = 0.6
    audio.play().catch(() => {})
  }

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-bg" />
        <div className="container hero-content">
         
          <div ref={stageRef} className={`genie-stage ${loaded ? 'animate__animated animate__fadeIn' : ''}`} onClick={handleLampClick}>
            <svg id="genie-lamp" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" aria-label="Genie lamp">
              <defs>
                <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#f7e6ad"/>
                  <stop offset="0.35" stop-color="#e6c468"/>
                  <stop offset="0.7" stop-color="#cb9f3e"/>
                  <stop offset="1" stop-color="#9b7220"/>
                </linearGradient>
                <linearGradient id="brassDark" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#d8b35a"/>
                  <stop offset="1" stop-color="#8a6219"/>
                </linearGradient>
                <radialGradient id="iris" cx="0.4" cy="0.35" r="0.75">
                  <stop offset="0" stop-color="#cfeaff"/>
                  <stop offset="0.45" stop-color="#5ba6e6"/>
                  <stop offset="0.8" stop-color="#2f7fd1"/>
                  <stop offset="1" stop-color="#1c5a9e"/>
                </radialGradient>
                <radialGradient id="cheek" cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0" stop-color="#f0a07a" stop-opacity="0.55"/>
                  <stop offset="1" stop-color="#f0a07a" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="levGlow" cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0" stop-color="#fff6cf" stop-opacity="0.95"/>
                  <stop offset="0.45" stop-color="#ffd86b" stop-opacity="0.55"/>
                  <stop offset="1" stop-color="#ffd86b" stop-opacity="0"/>
                </radialGradient>
              </defs>

              <g id="levitation">
                <ellipse id="shadow" cx="150" cy="260" rx="60" ry="9" fill="rgba(90,55,12,.22)"/>
                <ellipse id="lev-glow" cx="150" cy="257" rx="74" ry="15" fill="url(#levGlow)"/>
                <ellipse className="lev-ring" cx="150" cy="257" rx="52" ry="11" fill="none" stroke="#ffe9a8" strokeWidth="2.4"/>
                <ellipse className="lev-ring" cx="150" cy="257" rx="52" ry="11" fill="none" stroke="#fff3c2" strokeWidth="2"/>
                <ellipse className="lev-ring" cx="150" cy="257" rx="52" ry="11" fill="none" stroke="#ffe9a8" strokeWidth="1.8"/>
                <g transform="translate(108,255)"><circle className="lev-dust" r="2.6" fill="#fff3c2"/></g>
                <g transform="translate(150,259)"><circle className="lev-dust" r="3" fill="#ffe9a8"/></g>
                <g transform="translate(192,255)"><circle className="lev-dust" r="2.4" fill="#fff3c2"/></g>
                <g transform="translate(128,258)"><circle className="lev-dust" r="2" fill="#ffe9a8"/></g>
                <g transform="translate(172,258)"><circle className="lev-dust" r="2.2" fill="#fff3c2"/></g>
              </g>

              <g id="genie">
                <g id="lamp" stroke="var(--ink)" strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round">
                  <path d="M212 146 C254 142 262 190 215 192" fill="none" stroke="var(--ink)" strokeWidth="14"/>
                  <path d="M212 146 C254 142 262 190 215 192" fill="none" stroke="url(#brass)" strokeWidth="9.5"/>
                  <path d="M215 149 C246 146 252 178 218 184" fill="none" stroke="#fff" strokeWidth="2" opacity="0.4" strokeLinecap="round"/>
                  <path d="M139 200 C137 214 136 222 132 231 L168 231 C164 222 163 214 161 200 Z" fill="url(#brassDark)"/>
                  <ellipse cx="150" cy="240" rx="45" ry="12" fill="url(#brass)"/>
                  <path d="M107 240 C107 247 128 252 150 252 C172 252 193 247 193 240" fill="none" stroke="url(#brassDark)" strokeWidth="5"/>
                  <path d="M150 122 C196 120 224 144 223 172 C222 202 188 215 150 215 C118 215 92 206 84 185 C68 191 48 189 34 181 C24 177 16 171 16 163 C16 155 22 150 31 151 C47 150 66 150 84 150 C96 136 116 124 150 122 Z" fill="url(#brass)"/>
                  <ellipse cx="120" cy="143" rx="46" ry="28" fill="#fff" opacity="0.20" stroke="none"/>
                  <ellipse cx="150" cy="200" rx="58" ry="16" fill="#6a4d18" opacity="0.20" stroke="none"/>
                  <path d="M30 156 C48 152 66 151 80 152" fill="none" stroke="#fff" strokeWidth="3" opacity="0.22" strokeLinecap="round"/>
                  <ellipse cx="22" cy="162" rx="3" ry="7" fill="#6a4d18" stroke="none" transform="rotate(-6 22 162)"/>
                  <path d="M124 121 C126 102 174 102 176 121 Z" fill="url(#brassDark)"/>
                  <rect x="143" y="98" width="14" height="13" rx="3" fill="url(#brass)"/>
                  <circle cx="150" cy="95" r="9" fill="url(#brass)"/>
                  <g fill="url(#brass)" stroke="var(--ink)" strokeWidth="2">
                    <circle cx="160" cy="100" r="3.6"/>
                    <circle cx="170" cy="104" r="3.6"/>
                    <circle cx="180" cy="110" r="3.6"/>
                    <circle cx="189" cy="118" r="3.6"/>
                    <circle cx="196" cy="128" r="3.6"/>
                    <circle cx="201" cy="139" r="3.6"/>
                    <circle cx="204" cy="151" r="3.6"/>
                    <circle cx="205" cy="163" r="3.6"/>
                    <circle cx="203" cy="174" r="3.6"/>
                  </g>
                  <path d="M203 178 C198 184 198 191 203 194 C208 191 208 184 203 178 Z" fill="url(#brassDark)" strokeWidth="2.4"/>
                  <ellipse cx="104" cy="178" rx="13" ry="9" fill="url(#cheek)" stroke="none"/>
                  <ellipse cx="196" cy="178" rx="13" ry="9" fill="url(#cheek)" stroke="none"/>
                  <path d="M104 130 Q124 121 143 128" fill="none" stroke="var(--ink)" strokeWidth="4.5"/>
                  <path d="M157 128 Q176 120 196 130" fill="none" stroke="var(--ink)" strokeWidth="4.5"/>
                  <g id="eyes">
                    <circle cx="124" cy="152" r="25" fill="#ffffff"/>
                    <circle cx="180" cy="152" r="25" fill="#ffffff"/>
                    <circle cx="130" cy="153" r="15" fill="url(#iris)" stroke="none"/>
                    <circle cx="174" cy="153" r="15" fill="url(#iris)" stroke="none"/>
                    <circle cx="131" cy="154" r="7.5" fill="#16243a" stroke="none"/>
                    <circle cx="173" cy="154" r="7.5" fill="#16243a" stroke="none"/>
                    <circle cx="126" cy="148" r="4.6" fill="#fff" stroke="none"/>
                    <circle cx="168" cy="148" r="4.6" fill="#fff" stroke="none"/>
                    <circle cx="136" cy="159" r="2.3" fill="#fff" stroke="none"/>
                    <circle cx="178" cy="159" r="2.3" fill="#fff" stroke="none"/>
                    <g stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" fill="none">
                      <path d="M105 138 L97 132"/>
                      <path d="M110 132 L104 124"/>
                      <path d="M199 138 L207 132"/>
                      <path d="M194 132 L200 124"/>
                    </g>
                  </g>
                  <path d="M119 178 Q152 175 185 178 Q183 206 152 207 Q121 206 119 178 Z" fill="#7c1f24"/>
                  <ellipse cx="152" cy="200" rx="20" ry="9" fill="#e8788a" stroke="none"/>
                  <path d="M122 179 Q152 177 182 179 L180 187 Q152 184 124 187 Z" fill="#fff" stroke="none"/>
                  <path d="M119 178 Q152 175 185 178 Q183 206 152 207 Q121 206 119 178 Z" fill="none"/>
                </g>

                <g id="hand-left">
                  <g fill="var(--ink)">
                    <circle cx="64" cy="206" r="16"/>
                    <circle cx="52" cy="198" r="9"/>
                    <circle cx="58" cy="188" r="9"/>
                    <circle cx="67" cy="186" r="9"/>
                    <circle cx="75" cy="191" r="9"/>
                    <circle cx="78" cy="204" r="9"/>
                  </g>
                  <g fill="#ffffff">
                    <circle cx="64" cy="206" r="13"/>
                    <circle cx="52" cy="198" r="6"/>
                    <circle cx="58" cy="188" r="6"/>
                    <circle cx="67" cy="186" r="6"/>
                    <circle cx="75" cy="191" r="6"/>
                    <circle cx="78" cy="204" r="6"/>
                  </g>
                </g>
                <g id="hand-right">
                  <g fill="var(--ink)">
                    <circle cx="236" cy="206" r="16"/>
                    <circle cx="248" cy="198" r="9"/>
                    <circle cx="242" cy="188" r="9"/>
                    <circle cx="233" cy="186" r="9"/>
                    <circle cx="225" cy="191" r="9"/>
                    <circle cx="222" cy="204" r="9"/>
                  </g>
                  <g fill="#ffffff">
                    <circle cx="236" cy="206" r="13"/>
                    <circle cx="248" cy="198" r="6"/>
                    <circle cx="242" cy="188" r="6"/>
                    <circle cx="233" cy="186" r="6"/>
                    <circle cx="225" cy="191" r="6"/>
                    <circle cx="222" cy="204" r="6"/>
                  </g>
                </g>

                <g transform="translate(96,92)"><g className="sparkle"><path d="M0,-9 C1,-3 3,-1 9,0 C3,1 1,3 0,9 C-1,3 -3,1 -9,0 C-3,-1 -1,-3 0,-9 Z" fill="#fff7d6"/></g></g>
                <g transform="translate(214,150)"><g className="sparkle"><path d="M0,-7 C0.8,-2.4 2.4,-0.8 7,0 C2.4,0.8 0.8,2.4 0,7 C-0.8,2.4 -2.4,0.8 -7,0 C-2.4,-0.8 -0.8,-2.4 0,-7 Z" fill="#fff7d6"/></g></g>
                <g transform="translate(52,154)"><g className="sparkle"><path d="M0,-6 C0.7,-2 2,-0.7 6,0 C2,0.7 0.7,2 0,6 C-0.7,2 -2,0.7 -6,0 C-2,-0.7 -0.7,-2 0,-6 Z" fill="#fffaee"/></g></g>
                <g transform="translate(206,96)"><g className="sparkle"><path d="M0,-5 C0.6,-1.7 1.7,-0.6 5,0 C1.7,0.6 0.6,1.7 0,5 C-0.6,1.7 -1.7,0.6 -5,0 C-1.7,-0.6 -0.6,-1.7 0,-5 Z" fill="#fffaee"/></g></g>
              </g>
            </svg>
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