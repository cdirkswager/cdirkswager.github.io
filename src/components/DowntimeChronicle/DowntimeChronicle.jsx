import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getDowntimeChronicle, saveDowntimeChronicle, getPlayer } from '../../data/store'
import { getSession } from '../../data/auth'
import './DowntimeChronicle.css'

const YEARS = [
  { label: 'Year One', emoji: '🌱' },
  { label: 'Year Two', emoji: '⚔️' },
  { label: 'Year Three', emoji: '🌙' },
  { label: 'Year Four', emoji: '🔥' },
]

const PARTY_NAMES = ['Shiro', 'Gloom', 'Natalia', 'Zephyr', 'Fiix', 'Amare']

const MONTHS = [
  { name: 'Hammer', season: 'Winter', icon: '❄️', num: 1 },
  { name: 'Alturiak', season: 'Winter', icon: '❄️', num: 2 },
  { name: 'Ches', season: 'Spring', icon: '🌱', num: 3 },
  { name: 'Tarsakh', season: 'Spring', icon: '🌱', num: 4 },
  { name: 'Mirtul', season: 'Spring', icon: '🌱', num: 5 },
  { name: 'Kythorn', season: 'Summer', icon: '☀️', num: 6 },
  { name: 'Flamerule', season: 'Summer', icon: '☀️', num: 7 },
  { name: 'Eleasis', season: 'Summer', icon: '☀️', num: 8 },
  { name: 'Eleint', season: 'Autumn', icon: '🍂', num: 9 },
  { name: 'Marpenoth', season: 'Autumn', icon: '🍂', num: 10 },
  { name: 'Uktar', season: 'Autumn', icon: '🍂', num: 11 },
  { name: 'Nightal', season: 'Winter', icon: '❄️', num: 12 },
]

const EVENTS = [
  { name: 'Seeing Justice', desc: 'Thunderously sung hymns to Freya. Reminder of what an unjust world looks like.', dateDisplay: '1st of every month', seasons: ['Winter','Spring','Summer','Autumn'] },
  { name: 'Candle Rites', desc: 'Candle rites for Hel — sing, chant, and pray while dancing around lit candles.', dateDisplay: '12th of every month', seasons: ['Winter','Spring','Summer','Autumn'] },
  { name: 'The Maiming', desc: 'Thunderously sung hymns to Freya. A day to remember that goodness is hard won.', dateDisplay: '13th of most months (not Eleasis, Eleint)', seasons: ['Winter','Spring','Summer','Autumn'] },
  { name: 'The Blinding', desc: 'Thunderously sung hymns to Freya. A day to remember truth isnt always seen with the eyes.', dateDisplay: '22nd of most months (not Ches, Flamerule)', seasons: ['Winter','Spring','Summer','Autumn'] },
  { name: 'Cold Counting Comfort', desc: 'Celebrated wintertime accounting.', dateDisplay: 'Hammer 15', seasons: ['Winter'] },
  { name: 'The Rallying', desc: 'Meeting and planning for the year in heim.', dateDisplay: 'Hammer 30', seasons: ['Winter'] },
  { name: 'The Putrescent Death', desc: 'Night — details unknown.', dateDisplay: 'Hammer 30', seasons: ['Winter'] },
  { name: "Sailor's Pledge", desc: 'A day of tales of the sea, drinking, and revelry.', dateDisplay: 'Hammer · Tarsakh · Eleint · Uktar', seasons: ['Winter','Spring','Autumn'] },
  { name: 'Holiday of Revelry', desc: 'Night — masquerade balls, midwinter costumes and outerwear. Also celebrated as an indoor Halloween with parties.', dateDisplay: 'Hammer · Flamerule · Uktar', seasons: ['Winter','Summer','Autumn'] },
  { name: 'Midwinter Festival (Widwinter Festival)', desc: 'Day — giving gifts and outdoor ice events.', dateDisplay: 'Hammer', seasons: ['Winter'] },
  { name: 'Remembrance of the Dark Court Slaughter', desc: 'Night — elves give thanks and remembrance to those who defeated the spider queen.', dateDisplay: 'Hammer', seasons: ['Winter'] },
  { name: 'The Unveiling', desc: 'Night — details unknown.', dateDisplay: 'Hammer', seasons: ['Winter'] },
  { name: 'Great Weave', desc: 'Celebrated wintertime textile practices and tapestry weaving.', dateDisplay: 'Alturiak 20', seasons: ['Winter'] },
  { name: 'The Festival of the Pride', desc: 'Ten-day sacred mating festival for all beastkin.', dateDisplay: 'Ches 1–10', seasons: ['Spring'] },
  { name: 'Vernal Equinox', desc: 'The spring equinox.', dateDisplay: 'Ches 19', seasons: ['Spring'] },
  { name: 'Four Feasts', desc: 'Night — a feast prepared from what hunters return with.', dateDisplay: 'Ches 19 · Kythorn 20 · Eleint 21 · Nightal 20', seasons: ['Spring','Summer','Autumn','Winter'] },
  { name: 'High Hunt', desc: 'Morning — a celebrated hunt. Many new hunters are christened as Venari (warriors of Evalis) on this day.', dateDisplay: 'Ches 19 · Kythorn 20 · Eleint 21 · Nightal 20', seasons: ['Spring','Summer','Autumn','Winter'] },
  { name: 'Last Storm', desc: 'A fishing festival marking the day Umberlee left to explore the Mists and the storm that parted for her.', dateDisplay: 'Ches 19', seasons: ['Spring'] },
  { name: 'Rite of Pain and Purity', desc: 'A ritual of burning impurities away.', dateDisplay: 'Ches 19 · Kythorn 20 · Nightal 20', seasons: ['Spring','Summer','Winter'] },
  { name: 'Song of Dawn', desc: 'A day to worship the sun and the gods that give life to the universe.', dateDisplay: 'Ches 19 · Eleint 21', seasons: ['Spring','Autumn'] },
  { name: 'The Dance of Swirling Winds', desc: 'A grand performance at the House of Fallen Leaves.', dateDisplay: 'Ches 19 · Eleint 21', seasons: ['Spring','Autumn'] },
  { name: 'Endless Revel of Life', desc: 'Enjoy life and family — large beastkin gathering with tamed beasts, brawling, and prideful boasting.', dateDisplay: 'Ches 19 · Kythorn 20 · Flamerule 30 · Eleint 21 · Uktar · Nightal 20', seasons: ['Spring','Summer','Autumn','Winter'] },
  { name: 'High Coin', desc: 'Celebrated the accomplishments of the wealthy and collected donations for the next festival.', dateDisplay: 'Ches 30', seasons: ['Spring'] },
  { name: "Queen's Gambit", desc: 'A competition of games, particularly chess and Three-Dragon Ante.', dateDisplay: 'Tarsakh 1', seasons: ['Spring'] },
  { name: 'Windride', desc: 'A day dedicated to learning to use a sand skiff. Children play with wind riders; adults race on sand skiffs.', dateDisplay: 'Tarsakh 15', seasons: ['Spring'] },
  { name: 'Coin Festival', desc: 'A trade festival in Jutland, marked by the yearly visit of Avernus Corp.', dateDisplay: 'Tarsakh', seasons: ['Spring'] },
  { name: 'Greengrass', desc: 'Festival of appreciating the earth and grown things.', dateDisplay: 'Tarsakh', seasons: ['Spring'] },
  { name: 'Orgy of Destruction', desc: 'Details unknown.', dateDisplay: 'Tarsakh', seasons: ['Spring'] },
  { name: 'Song of the Trees', desc: 'A witchs ritual to commune with the forces of nature.', dateDisplay: 'Tarsakh · Eleint', seasons: ['Spring','Autumn'] },
  { name: 'Wild Ride', desc: 'Day of beasts — riding, taming, zoos.', dateDisplay: 'Tarsakh · Flamerule', seasons: ['Spring','Summer'] },
  { name: 'Convergence of Minds', desc: 'A 12-day Magi-Science convention with panels, speeches, reward ceremonies, and magical breakthroughs.', dateDisplay: 'Mirtul 1–12', seasons: ['Spring'] },
  { name: 'Day of Riches', desc: 'Last day of the Convergence of Minds, where merchants gain exclusive rights to inventors products.', dateDisplay: 'Mirtul 12', seasons: ['Spring'] },
  { name: 'Summer Solstice', desc: 'The summer solstice.', dateDisplay: 'Kythorn 20', seasons: ['Summer'] },
  { name: 'The Newborn Celebration', desc: 'Birth celebrations for beastkin newborns.', dateDisplay: 'Kythorn 21–29', seasons: ['Summer'] },
  { name: 'Sornyn', desc: 'Marked by business planning, signing of new opportunities, and meetings between adversaries.', dateDisplay: 'Flamerule 3–5', seasons: ['Summer'] },
  { name: 'Celebration of the Moon', desc: 'Night — songs and stories told over campfire in the deserts of Evadonia.', dateDisplay: 'Flamerule 30', seasons: ['Summer'] },
  { name: 'Ceremony of Contagion', desc: 'Night — details unknown.', dateDisplay: 'Flamerule', seasons: ['Summer'] },
  { name: 'Deeds of the Dead', desc: 'Very important day of Hel. Remembering the dead for their loyalty and strength to the cause.', dateDisplay: 'Flamerule', seasons: ['Summer'] },
  { name: 'Oath Making', desc: 'The day all Paladin orders make their oaths.', dateDisplay: 'Flamerule', seasons: ['Summer'] },
  { name: 'Day of Peace', desc: 'Day of reflection on ourselves and our past — to seek inner peace and relaxation.', dateDisplay: 'Flamerule', seasons: ['Summer'] },
  { name: 'The Melding of the Three', desc: 'Night — a night to come together: essence, enjoyment, transformation.', dateDisplay: 'Flamerule', seasons: ['Summer'] },
  { name: "Morrigan's Mirror", desc: 'A 9-day tournament testing the will of Venari (warriors of Evalis) with races, battles, and feats of strength.', dateDisplay: 'Eleasis 1–9', seasons: ['Summer'] },
  { name: 'Divine Death', desc: 'A full day event celebrating death in service of goodness and justice, and its link to divinity.', dateDisplay: 'Eleasis 13', seasons: ['Summer'] },
  { name: 'Huldark', desc: 'Feast to celebrate the bounty of the land and the planting of new trees.', dateDisplay: 'Eleasis 17', seasons: ['Summer'] },
  { name: 'Spryndalstar', desc: 'Celebrated the enrichment provided by the use of magic.', dateDisplay: 'Eleint 7', seasons: ['Autumn'] },
  { name: 'Autumnal Equinox', desc: 'The autumn equinox.', dateDisplay: 'Eleint 21', seasons: ['Autumn'] },
  { name: 'Feast of the Stags', desc: 'Gard celebrates a feast hunting the Nkyur Stag — an elusive blue stag said to impart immortality when eaten.', dateDisplay: 'Eleint', seasons: ['Autumn'] },
  { name: 'Harvestide', desc: 'Harvest festival of food and flowers.', dateDisplay: 'Eleint', seasons: ['Autumn'] },
  { name: 'Marthoon', desc: 'Homage to soldiers and guards for their efforts to protect wealth.', dateDisplay: 'Marpenoth 1', seasons: ['Autumn'] },
  { name: 'Ascension Day', desc: 'The day all Strix take on an apprentice as successor — now a graduation day for witches in Aeaea.', dateDisplay: 'Marpenoth 15', seasons: ['Autumn'] },
  { name: 'Starfall', desc: 'A day of wishes — a yearly meteor shower lights the sky.', dateDisplay: 'Marpenoth 23', seasons: ['Autumn'] },
  { name: 'Tehennteahan', desc: 'Celebrated everyday inventions and non-magical crafts.', dateDisplay: 'Uktar 10', seasons: ['Autumn'] },
  { name: 'Ceremony of Remembrance', desc: 'Night — a massive bonfire with dancing and celebration for those who made our lives possible.', dateDisplay: 'Uktar', seasons: ['Autumn'] },
  { name: 'Coming of the Winter Cave', desc: 'Details unknown.', dateDisplay: 'Uktar', seasons: ['Autumn'] },
  { name: 'Commemoration of the Fallen', desc: 'A recounting of the deeds of Morrigan. Venari from across the realm gather in solemn parade for fallen warriors.', dateDisplay: 'Uktar', seasons: ['Autumn'] },
  { name: 'Honoring the Dead', desc: 'Evening — a candle festival at the center of town, gathering in silence to appreciate those lost.', dateDisplay: 'Uktar', seasons: ['Autumn'] },
  { name: 'Mystic Rites of the Luminous Cloud', desc: 'Monks of the Temple of Yomi arrive at Lake Tazo and perform rites and martial arts.', dateDisplay: 'Uktar', seasons: ['Autumn'] },
  { name: 'The Feast of the Moon', desc: 'Night — a night in which beastkin indulge in their primal selves.', dateDisplay: 'Uktar', seasons: ['Autumn'] },
  { name: 'Winter Solstice', desc: 'The winter solstice.', dateDisplay: 'Nightal 20', seasons: ['Winter'] },
  { name: 'The Coming', desc: 'The day Umberlee returned from the Mists unscathed — a day of celebration and rest for all sailors.', dateDisplay: 'Nightal 20', seasons: ['Winter'] },
  { name: 'Orbar', desc: 'A cautionary warning against the dark side of wealth and greed.', dateDisplay: 'Nightal 25', seasons: ['Winter'] },
  { name: 'Night of Another Year', desc: 'Night — fireworks to ring in the new year.', dateDisplay: 'Nightal 30', seasons: ['Winter'] },
]

function emptyChronicleData() {
  return {
    name: '',
    years: YEARS.map(() => ({
      objectives: ['', '', ''],
      events: Array.from({ length: 5 }, () => ({ name: '', memory: '' })),
      scars: ['', ''],
    })),
    relationships: {
      romantic: { name: '', desc: '' },
      work: { name: '', desc: '' },
      friend: { name: '', desc: '' },
    },
    factions: [{ name: '', note: '' }, { name: '', note: '' }, { name: '', note: '' }],
    party: Array.from({ length: 5 }, () => ({ name: '', note: '' })),
    hobby: '',
    memories: ['', '', ''],
    threads: ['', ''],
  }
}

const DRAFT_KEY = 'dc-draft-'

export default function DowntimeChronicle() {
  const { id: playerId } = useParams()
  const [chronicle, setChronicle] = useState(null)
  const [data, setData] = useState(() => emptyChronicleData())
  const [draftReady, setDraftReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [discordOut, setDiscordOut] = useState('')
  const [copied, setCopied] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const debounceRef = useRef(null)
  const player = getPlayer(playerId)
  const session = getSession()
  const isOwner = session?.playerId === playerId
  const isDm = session?.role === 'dm'

  function mergeData(src) {
    const base = emptyChronicleData()
    const merged = { ...base, ...src }
    if (src?.years) {
      merged.years = src.years.map((yr, i) => ({
        ...base.years[i],
        ...yr,
        events: Array.from({ length: 5 }, (_, ei) => ({
          ...(base.years[i]?.events?.[ei] || { name: '', memory: '' }),
          ...(yr.events?.[ei] || {}),
        })),
        objectives: yr.objectives?.length ? yr.objectives : base.years[i]?.objectives || ['', '', ''],
        scars: yr.scars?.length ? yr.scars : base.years[i]?.scars || ['', ''],
      }))
    }
    return merged
  }

  useEffect(() => {
    const existing = getDowntimeChronicle(playerId)
    if (existing) {
      setChronicle(existing)
      const draftRaw = localStorage.getItem(DRAFT_KEY + playerId)
      if (draftRaw) {
        try {
          const draft = JSON.parse(draftRaw)
          if (draft && draft._updatedAt && existing.updatedAt) {
            if (draft._updatedAt > existing.updatedAt) {
              setData(mergeData(draft))
              setDraftReady(true)
              return
            }
          } else if (draft) {
            setData(mergeData(draft))
            setDraftReady(true)
            return
          }
        } catch { }
      }
      setData(mergeData(existing.data))
    } else {
      const draftRaw = localStorage.getItem(DRAFT_KEY + playerId)
      if (draftRaw) {
        try {
          setData(mergeData(JSON.parse(draftRaw)))
        } catch {
          setData(emptyChronicleData())
        }
      }
    }
    setDraftReady(true)
  }, [playerId])

  const persistDraft = useCallback((d) => {
    if (!playerId) return
    const toStore = { ...d, _updatedAt: Date.now() }
    localStorage.setItem(DRAFT_KEY + playerId, JSON.stringify(toStore))
  }, [playerId])

  const updateData = useCallback((updater) => {
    setData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => persistDraft(next), 500)
      return next
    })
  }, [persistDraft])

  const handleName = (e) => updateData(d => ({ ...d, name: e.target.value }))

  const handleObj = (yi, oi, val) => updateData(d => {
    const years = d.years.map((y, i) =>
      i === yi ? { ...y, objectives: y.objectives.map((o, j) => j === oi ? val : o) } : y
    )
    return { ...d, years }
  })

  const addObj = (yi) => updateData(d => {
    const years = d.years.map((y, i) =>
      i === yi ? { ...y, objectives: [...y.objectives, ''] } : y
    )
    return { ...d, years }
  })

  const removeObj = (yi, oi) => updateData(d => {
    const years = d.years.map((y, i) =>
      i === yi ? { ...y, objectives: y.objectives.filter((_, j) => j !== oi) } : y
    )
    return { ...d, years }
  })

  const handleEvent = (yi, ei, field, val) => updateData(d => {
    const years = d.years.map((y, i) =>
      i === yi ? {
        ...y,
        events: y.events.map((e, j) =>
          j === ei ? { ...e, [field]: val } : e
        ),
      } : y
    )
    return { ...d, years }
  })

  const handleScar = (yi, si, val) => updateData(d => {
    const years = d.years.map((y, i) =>
      i === yi ? { ...y, scars: y.scars.map((s, j) => j === si ? val : s) } : y
    )
    return { ...d, years }
  })

  const handleRel = (key, field, val) => updateData(d => ({
    ...d,
    relationships: {
      ...d.relationships,
      [key]: { ...d.relationships[key], [field]: val },
    },
  }))

  const handleFactionNote = (fi, val) => updateData(d => ({
    ...d,
    factions: d.factions.map((f, i) => i === fi ? { ...f, note: val } : f),
  }))

  const addFaction = () => updateData(d => ({
    ...d,
    factions: [...d.factions, { name: '', note: '' }],
  }))

  const rmvFaction = (fi) => updateData(d => ({
    ...d,
    factions: d.factions.filter((_, i) => i !== fi),
  }))

  const handlePartyName = (pi, val) => updateData(d => ({
    ...d,
    party: d.party.map((p, i) => i === pi ? { ...p, name: val } : p),
  }))

  const handlePartyNote = (pi, val) => updateData(d => ({
    ...d,
    party: d.party.map((p, i) => i === pi ? { ...p, note: val } : p),
  }))

  const handleHobby = (e) => updateData(d => ({ ...d, hobby: e.target.value }))

  const handleMemory = (mi, val) => updateData(d => ({
    ...d,
    memories: d.memories.map((m, i) => i === mi ? val : m),
  }))

  const handleThread = (ti, val) => updateData(d => ({
    ...d,
    threads: d.threads.map((t, i) => i === ti ? val : t),
  }))

  const t = (val) => (val || '').trim()

  const generate = useCallback(() => {
    const name = t(data.name) || 'Unknown Adventurer'
    let o = `# ⚔️ ${name} — Downtime Chronicle\n*Four Years Have Passed...*\n${'━'.repeat(38)}\n\n`

    YEARS.forEach((yr, yi) => {
      const year = data.years[yi]
      const items = (year?.objectives || []).filter(Boolean).map(t).filter(Boolean)
      const scarTexts = (year?.scars || []).filter(Boolean).map(t).filter(Boolean)

      let yearEvents = []
      for (let s = 0; s < 5; s++) {
        const ev = year?.events?.[s]
        if (ev?.name) yearEvents.push({ name: ev.name, mem: t(ev.memory) })
      }

      o += `## ${yr.emoji} ${yr.label}\n`
      if (items.length) items.forEach(it => o += `> • ${it}\n`)
      else o += '> *Nothing recorded.*\n'

      if (yearEvents.length) {
        o += '\n🎉 **Events**\n'
        yearEvents.forEach(ev => {
          o += `> **${ev.name}**`
          if (ev.mem) o += ` — *${ev.mem}*`
          o += '\n'
        })
      }

      if (scarTexts.length) {
        o += '\n🩸 **Potential Scars**\n'
        scarTexts.forEach((s, i) => o += `> **Scar ${i + 1}:** *${s}*\n`)
      }
      o += '\n'
    })

    o += `${'━'.repeat(38)}\n## ♡ Relationships\n`
    const rels = data.relationships || {}
    for (const [key, rel] of Object.entries(rels)) {
      const labels = { romantic: '♡ Romantic', work: '⚒ Professional', friend: '✦ Friendship' }
      o += `**${labels[key] || key}**`
      if (t(rel.name)) o += ` — *${t(rel.name)}*`
      o += '\n'
      if (t(rel.desc)) o += `> ${t(rel.desc)}\n`
      o += '\n'
    }

    const hasFactions = (data.factions || []).some(f => t(f.name) || t(f.note))
    const hasParty = (data.party || []).some(p => t(p.name) || t(p.note))

    if (hasFactions || hasParty) {
      o += `${'━'.repeat(38)}\n## ⚜ Factions & Notable People\n`
      if (hasFactions) {
        data.factions.forEach(f => {
          if (t(f.name) || t(f.note)) {
            o += t(f.note) ? `**${t(f.name) || '—'}** — *${t(f.note)}*\n` : `**${t(f.name)}**\n`
          }
        })
      }
      if (hasParty) {
        o += '\n**The Party**\n'
        data.party.forEach(p => {
          if (t(p.name) || t(p.note)) {
            o += t(p.note) ? `**${t(p.name)}** — *${t(p.note)}*\n` : `**${t(p.name)}**\n`
          }
        })
      }
      o += '\n'
    }

    if (t(data.hobby)) o += `${'━'.repeat(38)}\n## 🎲 Hobby or Skill\n> ${t(data.hobby)}\n\n`

    const mems = (data.memories || []).map(t).filter(Boolean)
    if (mems.length) {
      o += `${'━'.repeat(38)}\n## 📖 Memories\n`
      mems.forEach((m, i) => o += `**Memory ${i + 1}:** *${m}*\n`)
      o += '\n'
    }

    const threads = (data.threads || []).map(t).filter(Boolean)
    if (threads.length) {
      o += `${'━'.repeat(38)}\n## ⧖ Unresolved Threads\n`
      threads.forEach((th, i) => o += `**Thread ${i + 1}:** *${th}*\n`)
      o += '\n'
    }

    o += `${'━'.repeat(38)}\n*⚜️ End of Chronicle — ${name} ⚜️*`
    setDiscordOut(o)
    setShowOutput(true)
  }, [data])

  const copyOut = async () => {
    if (!discordOut) generate()
    try {
      await navigator.clipboard.writeText(discordOut)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch { }
  }

  const handleSubmit = async () => {
    setSaving(true)
    const now = Date.now()
    const payload = {
      ...(chronicle || { playerId }),
      playerId,
      status: 'submitted',
      submittedAt: chronicle?.submittedAt || now,
      data,
      updatedAt: now,
    }
    const saved = await saveDowntimeChronicle(payload)
    setChronicle(saved)
    setSaved(true)
    localStorage.removeItem(DRAFT_KEY + playerId)
    setSaving(false)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    const now = Date.now()
    const payload = {
      ...(chronicle || { playerId }),
      playerId,
      status: chronicle?.status || 'pending',
      submittedAt: chronicle?.submittedAt || null,
      data,
      updatedAt: now,
    }
    const saved = await saveDowntimeChronicle(payload)
    setChronicle(saved)
    setSaved(true)
    localStorage.removeItem(DRAFT_KEY + playerId)
    setSaving(false)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleClear = () => {
    if (!confirm('Clear everything?')) return
    setData(emptyChronicleData())
    setDiscordOut('')
    setShowOutput(false)
    localStorage.removeItem(DRAFT_KEY + playerId)
  }

  const status = chronicle?.status || 'pending'

  if (!player) {
    return (
      <div className="chronicle-page">
        <div className="scroll">
          <div className="torn" />
          <div className="scroll-inner text-center">
            <h2 style={{ color: '#8b1a1a', fontFamily: "'Cinzel Decorative', serif" }}>Character Not Found</h2>
            <p style={{ color: '#5c3d1a', marginTop: 12 }}>
              No adventurer with that ID exists. Are you sure they're part of this world?
            </p>
            <Link to="/" className="ctrl-btn" style={{ display: 'inline-block', marginTop: 20, textDecoration: 'none' }}>
              Return Home
            </Link>
          </div>
          <div className="torn bottom" />
        </div>
      </div>
    )
  }

  return (
    <div className="chronicle-page">
      <h1 className="page-title">⚔ Downtime Chronicle ⚔</h1>
      <p className="page-sub">Four Years — D&amp;D Campaign Template</p>

      <div className="chronicle-status">
        <span className={`status-badge ${status}`}>
          {status === 'pending' && '⏳ Pending'}
          {status === 'submitted' && '✅ Submitted'}
          {status === 'closed' && '🔒 Closed'}
        </span>
      </div>

      <div className="controls">
        <button className="ctrl-btn" onClick={generate}>📜 Generate Discord Post</button>
        {isDm && (
          <button className={`ctrl-btn ${status !== 'submitted' ? 'primary' : ''}`}
            onClick={handleSubmit} disabled={saving || status === 'submitted'}>
            {saving ? 'Saving...' : status === 'submitted' ? '✅ Submitted' : '📤 Submit Chronicle'}
          </button>
        )}
        <button className="ctrl-btn" onClick={handleSaveDraft} disabled={saving}>
          💾 Save Draft
        </button>
        <button className="ctrl-btn danger" onClick={handleClear}>✕ Clear All</button>
      </div>

      <div className="scroll">
        <div className="torn" />
        <div className="scroll-inner">
          <div className="char-header">
            <input
              className="char-name"
              value={data.name}
              onChange={handleName}
              placeholder="Character Name"
            />
            <div className="ornament">· · · ✦ · · ·</div>
            <div className="time-label">Four Years of Downtime</div>
          </div>

          {/* YEARS */}
          <div className="section">
            <div className="section-head">
              <div className="section-head-line" />
              <div className="section-title">⚔ Yearly Objectives, Events &amp; Scars</div>
              <div className="section-head-line" />
            </div>
            <div className="years">
              {YEARS.map((yr, yi) => (
                <div key={yi} className="year-block">
                  <span className="year-tag">{yr.emoji} {yr.label}</span>

                  {/* Objectives */}
                  <ul className="obj-list">
                    {(data.years[yi]?.objectives || []).map((obj, oi) => (
                      <li key={oi} className="obj-row">
                        <span className="obj-bullet">⚔</span>
                        <input
                          className="obj-text"
                          value={obj}
                          onChange={e => handleObj(yi, oi, e.target.value)}
                          placeholder="Describe an objective, action, or activity..."
                        />
                        <button className="rmv-btn" onClick={() => removeObj(yi, oi)} title="Remove">✕</button>
                      </li>
                    ))}
                  </ul>
                  <button className="add-btn" onClick={() => addObj(yi)}>+ Add Objective</button>

                  {/* Events */}
                  <div className="year-events">
                    <div className="year-events-label">🎉 Events Attended — choose 5 and note a memory</div>
                    {(data.years[yi]?.events || []).map((ev, ei) => (
                      <div key={ei} className="event-entry">
                        <div className="event-select-wrap">
                          <select
                            className="event-select"
                            value={ev.name}
                            onChange={e => handleEvent(yi, ei, 'name', e.target.value)}
                          >
                            <option value="">— Choose an event —</option>
                            <option value="__custom__">📝 Custom Event</option>
                            {EVENTS.map(evt => (
                              <option key={evt.name} value={evt.name}>{evt.name}</option>
                            ))}
                          </select>
                          {(() => {
                            const match = EVENTS.find(e => e.name === ev.name);
                            if (!match) return null;
                            const seasonIcons = match.seasons.map(s => {
                              const m = MONTHS.find(mo => mo.season === s);
                              return m ? m.icon : '';
                            }).filter(Boolean);
                            const uniqueIcons = [...new Set(seasonIcons)];
                            return (
                              <div className="event-desc-hint visible">
                                <div className="event-dates">
                                  {uniqueIcons.join(' ')} {match.dateDisplay}
                                </div>
                                <div className="event-desc-text">{match.desc}</div>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="event-memory-field">
                          <input
                            className="event-memory-text"
                            value={ev.memory}
                            onChange={e => handleEvent(yi, ei, 'memory', e.target.value)}
                            placeholder="What do they remember?..."
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Scars */}
                  <div className="year-scars">
                    <div className="year-scars-label">🩸 Potential Scars This Year</div>
                    <div className="scar-row">
                      {(data.years[yi]?.scars || ['', '']).map((scar, si) => (
                        <div key={si} className="scar-mini">
                          <span className="scar-mini-label">Scar {si + 1 === 1 ? 'I' : 'II'}</span>
                          <input
                            className="scar-mini-text"
                            value={scar}
                            onChange={e => handleScar(yi, si, e.target.value)}
                            placeholder="A wound — physical, emotional, or spiritual..."
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RELATIONSHIPS */}
          <div className="section">
            <div className="section-head">
              <div className="section-head-line" />
              <div className="section-title">♡ Relationships</div>
              <div className="section-head-line" />
            </div>
            <div className="cards-grid col3">
              {[
                { key: 'romantic', label: '♡ Romantic', ph: 'Their name...', descPh: 'How did this relationship grow, change, or strain over the years?' },
                { key: 'work', label: '⚒ Professional', ph: 'Their name...', descPh: 'A colleague, mentor, rival — what defines this bond?' },
                { key: 'friend', label: '✦ Friendship', ph: 'Their name...', descPh: 'What keeps this friendship alive across four years?' },
              ].map(rel => (
                <div key={rel.key} className="rel-card">
                  <span className="rel-type">{rel.label}</span>
                  <input
                    className="rel-name"
                    value={data.relationships?.[rel.key]?.name || ''}
                    onChange={e => handleRel(rel.key, 'name', e.target.value)}
                    placeholder={rel.ph}
                  />
                  <input
                    className="rel-desc"
                    value={data.relationships?.[rel.key]?.desc || ''}
                    onChange={e => handleRel(rel.key, 'desc', e.target.value)}
                    placeholder={rel.descPh}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* FACTIONS */}
          <div className="section">
            <div className="section-head">
              <div className="section-head-line" />
              <div className="section-title">⚜ Factions &amp; Notable People</div>
              <div className="section-head-line" />
            </div>
            <div className="faction-box">
              <div className="faction-subsection-label">Factions &amp; Other Contacts</div>
                  <div>
                    {data.factions.map((f, fi) => (
                      <div key={fi} className="faction-row">
                        <input
                          className="faction-name"
                          value={f.name}
                          onChange={e => updateData(d => ({
                            ...d,
                            factions: d.factions.map((ff, i) => i === fi ? { ...ff, name: e.target.value } : ff),
                          }))}
                          placeholder="Name or faction..."
                        />
                        <span className="faction-sep">—</span>
                        <input
                          className="faction-note"
                          value={f.note}
                          onChange={e => handleFactionNote(fi, e.target.value)}
                          placeholder="Relationship, standing, or why they matter..."
                        />
                        <button className="rmv-btn" onClick={() => rmvFaction(fi)} title="Remove">✕</button>
                      </div>
                    ))}
                  </div>
              <button className="add-btn" onClick={addFaction}>+ Add Faction or Person</button>

              <div className="faction-subsection-label">The Party</div>
              <div>
                {data.party.map((p, pi) => (
                  <div key={pi} className="party-row">
                    <select
                      className="party-select"
                      value={p.name}
                      onChange={e => handlePartyName(pi, e.target.value)}
                    >
                      <option value="">— Choose —</option>
                      {PARTY_NAMES.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <textarea
                      className="party-note"
                      value={p.note}
                      onChange={e => handlePartyNote(pi, e.target.value)}
                      placeholder="How did things stand between you two over these four years?..."
                      rows={3}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* HOBBY */}
          <div className="section">
            <div className="section-head">
              <div className="section-head-line" />
              <div className="section-title">🎲 Hobby or Skill Picked Up</div>
              <div className="section-head-line" />
            </div>
            <div className="card accent-gold">
              <span className="card-label">Something they did with their spare time — a craft, habit, or art</span>
              <input
                className="card-text"
                value={data.hobby}
                onChange={handleHobby}
                placeholder="e.g. Took up woodcarving during long winter nights in the guild hall..."
              />
            </div>
          </div>

          {/* MEMORIES */}
          <div className="section">
            <div className="section-head">
              <div className="section-head-line" />
              <div className="section-title">📖 Memories</div>
              <div className="section-head-line" />
            </div>
            <div className="cards-grid col3">
              {[1, 2, 3].map(i => (
                <div key={i} className="card">
                  <span className="card-label">Memory {i}</span>
                  <input
                    className="card-text"
                    value={data.memories[i - 1] || ''}
                    onChange={e => handleMemory(i - 1, e.target.value)}
                    placeholder="A vivid moment from these four years..."
                  />
                </div>
              ))}
            </div>
          </div>

          {/* THREADS */}
          <div className="section">
            <div className="section-head">
              <div className="section-head-line" />
              <div className="section-title red">⧖ Unresolved Threads</div>
              <div className="section-head-line" />
            </div>
            <div className="cards-grid col2">
              {['Unresolved Thread I', 'Unresolved Thread II'].map((lbl, ti) => (
                <div key={ti} className="card accent-red">
                  <span className="card-label">⧖ {lbl}</span>
                  <input
                    className="card-text"
                    value={data.threads[ti] || ''}
                    onChange={e => handleThread(ti, e.target.value)}
                    placeholder="Something left undone — still hanging over them. A promise unkept, a question unanswered..."
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="seal">⚜ ✦ ⚜</div>
        </div>
        <div className="torn bottom" />
      </div>

      {saved && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1a3a1a', border: '1px solid #3a7a3a', color: '#8dd88d',
          padding: '10px 24px', borderRadius: 4, fontFamily: "'Cinzel', serif",
          fontSize: '0.8rem', letterSpacing: '0.1em', zIndex: 1000,
        }}>
          ✅ Chronicle saved!
        </div>
      )}

      {showOutput && (
        <div className="output-panel">
          <div className="output-header">
            <span className="output-label">Discord Output</span>
            <button className="copy-btn" onClick={copyOut}>{copied ? '✓ Copied!' : 'Copy'}</button>
          </div>
          <textarea id="discord-out" readOnly value={discordOut}
            placeholder="Click 'Generate Discord Post' to create your chronicle output..." />
        </div>
      )}
    </div>
  )
}
