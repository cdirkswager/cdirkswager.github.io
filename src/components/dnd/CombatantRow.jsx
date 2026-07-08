import { useState } from "react";
import { CONDITIONS } from "../../lib/dnd/reference";

function conditions(c) {
  try { return JSON.parse(c.conditions); } catch { return []; }
}

export function CombatantRow({ c, isCurrent, onChange, onRemove, onViewStatBlock, onConvertNpc, onAddNote }) {
  const [dmg, setDmg] = useState("");
  const [healMode, setHealMode] = useState(false);
  const [condMenu, setCondMenu] = useState(false);
  const conds = conditions(c);
  const hpPct = c.hp_max > 0 ? (c.hp_current / c.hp_max) * 100 : 0;
  const bloodied = hpPct <= 50 && hpPct > 0;
  const down = c.hp_current <= 0;
  const isPlayer = c.is_player === 1;

  const applyDamage = (heal = false) => {
    const n = parseInt(dmg, 10);
    if (isNaN(n)) return;
    let hp = c.hp_current;
    let temp = c.hp_temp;
    if (heal || n < 0) {
      hp = Math.min(c.hp_max, hp + Math.abs(n));
    } else {
      let remaining = n;
      if (temp > 0) { const a = Math.min(temp, remaining); temp -= a; remaining -= a; }
      hp = Math.max(0, hp - remaining);
    }
    onChange({ hp_current: hp, hp_temp: temp });
    setDmg("");
  };

  const toggleCondition = (key) => {
    const exists = conds.find((x) => x.type === key);
    const next = exists ? conds.filter((x) => x.type !== key) : [...conds, { type: key, rounds_remaining: null }];
    onChange({ conditions: JSON.stringify(next) });
  };

  const hpColor = down ? "var(--dim)" : bloodied ? "var(--risk)" : "var(--ok)";
  const accent = isPlayer ? "var(--player)" : "var(--accent)";

  return (
    <div
      className={`fadeup relative rounded border bg-panel px-3 py-2 ${isCurrent ? "turn-active border-accent" : "border-line"}`}
      style={{ marginLeft: isCurrent ? 3 : 0 }}
    >
      <div className="flex items-center gap-3">
        <input
          className="hp-input mono w-9 py-0.5 text-sm font-bold"
          value={c.initiative}
          onChange={(e) => onChange({ initiative: parseInt(e.target.value, 10) || 0 })}
          title="Initiative"
          style={{ color: accent }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`truncate text-sm font-semibold ${down ? "text-dim line-through" : ""}`} style={{ color: down ? undefined : accent }}>
              {c.display_name}
            </span>
            {c.is_concentrating === 1 && <span title="Concentrating" className="text-xs text-player">◎</span>}
            {c.has_used_reaction === 1 && <span title="Reaction used" className="text-xs text-dim">↩✗</span>}
            {c.is_readied === 1 && <span title={c.readied_trigger ?? "Readied"} className="text-xs text-warn">⏳</span>}
            {c.legendary_actions_remaining > 0 && (
              <span title="Legendary actions" className="mono text-xs text-accent">L{c.legendary_actions_remaining}</span>
            )}
            {bloodied && !down && <span title="Bloodied" className="text-xs">🩸</span>}
          </div>
          {conds.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {conds.map((cond) => (
                <button
                  key={cond.type}
                  onClick={() => toggleCondition(cond.type)}
                  className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-dim hover:text-crit"
                  title="Click to remove"
                >
                  {cond.type}{cond.rounds_remaining != null ? ` ${cond.rounds_remaining}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="mono text-sm font-bold" style={{ color: hpColor }}>
              {c.hp_current}<span className="text-dim">/{c.hp_max}</span>
              {c.hp_temp > 0 && <span className="text-player"> +{c.hp_temp}</span>}
            </div>
            <div className="relative h-1 w-20 overflow-hidden rounded-full bg-ink">
              <div className="gauge-fill h-full rounded-full pointer-events-none" style={{ width: `${Math.max(0, hpPct)}%`, background: hpColor }} />
              <input
                type="range"
                min="0"
                max={c.hp_max}
                step="1"
                value={c.hp_current}
                onChange={(e) => onChange({ hp_current: Math.min(c.hp_max, parseInt(e.target.value) || 0) })}
                className="absolute inset-0 cursor-col-resize opacity-0"
              />
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => setHealMode((v) => !v)}
              className={`heal-toggle absolute -top-3 left-1/2 -translate-x-1/2 ${healMode ? "active" : ""}`}
              title={healMode ? "Healing mode (click for damage)" : "Damage mode (click for healing)"}
            >
              ♥
            </button>
            <input
              className="hp-input mono w-10 py-0.5 text-xs"
              placeholder="val"
              value={dmg}
              onChange={(e) => setDmg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyDamage(healMode);
              }}
              style={healMode ? { borderColor: 'var(--ok)' } : undefined}
              title="Enter applies damage or healing based on toggle"
            />
          </div>
        </div>

        <div className="flex items-center gap-0.5 text-dim">
          <IconBtn title="Conditions" onClick={() => setCondMenu((v) => !v)}>✦</IconBtn>
          <IconBtn title="Concentration" active={c.is_concentrating === 1} onClick={() => onChange({ is_concentrating: c.is_concentrating === 1 ? 0 : 1 })}>◎</IconBtn>
          <IconBtn title="Reaction used" active={c.has_used_reaction === 1} onClick={() => onChange({ has_used_reaction: c.has_used_reaction === 1 ? 0 : 1 })}>↩</IconBtn>
          {!isPlayer && (
            <>
              <IconBtn title="View stat block" onClick={onViewStatBlock}>▤</IconBtn>
              <IconBtn title="Convert to named NPC" onClick={onConvertNpc}>★</IconBtn>
            </>
          )}
          {(c.npc_id || !isPlayer) && <IconBtn title="Quick note" onClick={onAddNote}>✎</IconBtn>}
          <IconBtn title="Remove" onClick={onRemove}>✕</IconBtn>
        </div>
      </div>

      {isPlayer && down && (
        <div className="mt-2 flex items-center gap-3 border-t border-line pt-2 text-xs">
          <span className="text-dim">Death saves</span>
          <DeathTrack label="✓" tone="var(--ok)" count={c.death_saves_successes}
            onSet={(n) => onChange({ death_saves_successes: n })} />
          <DeathTrack label="✗" tone="var(--crit)" count={c.death_saves_failures}
            onSet={(n) => onChange({ death_saves_failures: n })} />
          {c.death_saves_failures >= 3 && <span className="text-crit">DEAD</span>}
          {c.death_saves_successes >= 3 && <span className="text-ok">STABLE</span>}
        </div>
      )}

      {condMenu && (
        <div className="mt-2 grid grid-cols-2 gap-1 border-t border-line pt-2 sm:grid-cols-3">
          {CONDITIONS.map((cd) => {
            const on = conds.some((x) => x.type === cd.key);
            return (
              <button
                key={cd.key}
                onClick={() => toggleCondition(cd.key)}
                title={cd.short}
                className={`rounded px-1.5 py-1 text-left text-[11px] ${on ? "bg-accent-soft text-accent" : "bg-ink text-dim hover:text-fg"}`}
              >
                {cd.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, title, active, onClick }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded px-1.5 py-1 text-xs transition-colors hover:bg-panel-2 hover:text-fg ${active ? "text-accent" : ""}`}
    >
      {children}
    </button>
  );
}

function DeathTrack({ label, tone, count, onSet }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          onClick={() => onSet(count >= n ? n - 1 : n)}
          className="h-4 w-4 rounded-full border"
          style={{ borderColor: tone, background: count >= n ? tone : "transparent" }}
          title={`${label} ${n}`}
        />
      ))}
    </div>
  );
}
