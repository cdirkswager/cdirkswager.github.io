import { DAMAGE_ICON } from "../../lib/dnd/reference";

function parseJson(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

function DamageTags({ list, label, tone }) {
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="text-dim">{label}</span>
      {list.map((d) => (
        <span key={d} className="rounded px-1.5 py-0.5" style={{ background: "var(--ink)", color: tone }}>
          <span title={d}>{DAMAGE_ICON[d.split(" ")[0]] ?? "•"}</span> {d}
        </span>
      ))}
    </div>
  );
}

function ActionGroup({ title, actions }) {
  if (!actions.length) return null;
  return (
    <div className="mt-3">
      <h4 className="display text-xs font-bold uppercase tracking-wide text-accent">{title}</h4>
      <div className="mt-1 space-y-2">
        {actions.map((a) => (
          <div key={a.id} className="rounded border border-line bg-ink px-2.5 py-2 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold">{a.name}</span>
              {a.attack_bonus != null && (
                <span className="mono text-xs text-accent">
                  {a.attack_bonus >= 0 ? "+" : ""}{a.attack_bonus} to hit
                </span>
              )}
              {a.save_dc != null && (
                <span className="mono text-xs text-player">DC {a.save_dc} {a.save_ability}</span>
              )}
            </div>
            {a.advantage_note && (
              <p className="mt-0.5 text-xs text-warn">⚑ {a.advantage_note}</p>
            )}
            {(a.avg_damage != null || a.damage_dice) && (
              <p className="mono mt-0.5 text-xs text-dim">
                {a.reach_range && <span>{a.reach_range} · </span>}
                {a.avg_damage != null && <span className="text-fg">{a.avg_damage}</span>} avg
                {a.damage_dice && <span> ({a.damage_dice})</span>}
                {a.damage_type && <span> {DAMAGE_ICON[a.damage_type] ?? ""} {a.damage_type}</span>}
                {a.secondary_avg_damage != null && (
                  <span> + {a.secondary_avg_damage} ({a.secondary_damage_dice}) {a.secondary_damage_type}</span>
                )}
              </p>
            )}
            {a.description && <p className="mt-1 text-xs text-dim">{a.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatBlockPanel({ monster }) {
  const speed = parseJson(monster.speed, {});
  const senses = parseJson(monster.senses, {});
  const saves = parseJson(monster.saving_throws, {});
  const skills = parseJson(monster.skills, {});
  const passives = parseJson(monster.passives, []);
  const spells = parseJson(monster.spells_available, {});
  const res = parseJson(monster.damage_resistances, []);
  const imm = parseJson(monster.damage_immunities, []);
  const vul = parseJson(monster.damage_vulnerabilities, []);

  const byType = (t) => monster.actions.filter((a) => a.action_type === t);

  return (
    <div className="text-sm">
      <div className="flex items-baseline justify-between">
        <h3 className="display text-lg font-bold">{monster.name}</h3>
        {monster.cr != null && <span className="mono text-xs text-dim">CR {monster.cr}</span>}
      </div>
      <p className="text-xs text-dim">
        {[monster.size, monster.monster_type, monster.alignment].filter(Boolean).join(" · ")}
        {monster.source !== "srd" && <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-accent">{monster.source}</span>}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Vital label="AC" value={monster.ac ?? "—"} sub={monster.ac_notes ?? undefined} />
        <Vital label="HP" value={monster.hp_max} sub={monster.hp_formula ?? undefined} />
        <Vital
          label="Speed"
          value={Object.entries(speed).filter(([, v]) => v > 0).map(([k, v]) => `${k[0].toUpperCase()}${v}`).join(" ") || "—"}
        />
      </div>

      <div className="mono mt-3 grid grid-cols-6 gap-1 text-center text-xs">
        {["str", "dex", "con", "int", "wis", "cha"].map((k) => {
          const v = monster[k];
          const mod = v != null ? Math.floor((v - 10) / 2) : null;
          return (
            <div key={k} className="rounded border border-line bg-ink py-1">
              <div className="uppercase text-dim">{k}</div>
              <div className="font-bold">{v ?? "—"}</div>
              {mod != null && <div className="text-dim">{mod >= 0 ? "+" : ""}{mod}</div>}
            </div>
          );
        })}
      </div>

      <div className="mt-3 space-y-1 text-xs text-dim">
        {Object.keys(saves).length > 0 && (
          <p><span className="text-fg">Saves:</span> {Object.entries(saves).map(([k, v]) => `${k.toUpperCase()} ${v >= 0 ? "+" : ""}${v}`).join(", ")}</p>
        )}
        {Object.keys(skills).length > 0 && (
          <p><span className="text-fg">Skills:</span> {Object.entries(skills).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`).join(", ")}</p>
        )}
        {Object.keys(senses).length > 0 && (
          <p><span className="text-fg">Senses:</span> {Object.entries(senses).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}</p>
        )}
        {monster.languages && <p><span className="text-fg">Languages:</span> {monster.languages}</p>}
      </div>

      <div className="mt-3 space-y-1">
        <DamageTags list={vul} label="Vulnerable" tone="var(--crit)" />
        <DamageTags list={res} label="Resistant" tone="var(--player)" />
        <DamageTags list={imm} label="Immune" tone="var(--ok)" />
      </div>

      {(monster.spell_dc != null || Object.keys(spells).length > 0) && (
        <div className="mt-3 rounded border border-line bg-ink p-2">
          <div className="flex gap-3 text-xs">
            {monster.spell_dc != null && <span className="mono text-player">Spell DC {monster.spell_dc}</span>}
            {monster.spell_attack_bonus != null && <span className="mono text-player">+{monster.spell_attack_bonus} attack</span>}
          </div>
          {Object.entries(spells).map(([lvl, list]) => (
            <p key={lvl} className="mt-1 text-xs">
              <span className="text-dim">{lvl === "cantrips" ? "Cantrips" : `Level ${lvl}`}:</span> {list.join(", ")}
            </p>
          ))}
        </div>
      )}

      {passives.length > 0 && (
        <div className="mt-3">
          <h4 className="display text-xs font-bold uppercase tracking-wide text-accent">Traits</h4>
          {passives.map((p, i) => (
            <p key={i} className="mt-1 text-xs"><span className="font-semibold">{p.name}.</span> <span className="text-dim">{p.description}</span></p>
          ))}
        </div>
      )}

      <ActionGroup title="Multiattack" actions={byType("multiattack")} />
      <ActionGroup title="Actions" actions={byType("action")} />
      <ActionGroup title="Bonus Actions" actions={byType("bonus_action")} />
      <ActionGroup title="Reactions" actions={byType("reaction")} />
      <ActionGroup title="Legendary Actions" actions={byType("legendary")} />
      <ActionGroup title="Lair Actions" actions={byType("lair")} />

      {(monster.bloodied_reminder || monster.death_reminder) && (
        <div className="mt-3 space-y-1 text-xs">
          {monster.bloodied_reminder && <p className="rounded bg-risk/10 px-2 py-1 text-risk">🩸 Bloodied: {monster.bloodied_reminder}</p>}
          {monster.death_reminder && <p className="rounded bg-crit/10 px-2 py-1 text-crit">☠ Death: {monster.death_reminder}</p>}
        </div>
      )}
      {monster.rp_notes && (
        <div className="mt-3 rounded border border-dashed border-line p-2 text-xs">
          <span className="text-accent">RP:</span> <span className="text-dim">{monster.rp_notes}</span>
        </div>
      )}
      {monster.description && <p className="mt-3 text-xs italic text-dim">{monster.description}</p>}
    </div>
  );
}

function Vital({ label, value, sub }) {
  return (
    <div className="rounded border border-line bg-ink px-2 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-dim">{label}</div>
      <div className="mono text-base font-bold">{value}</div>
      {sub && <div className="text-[10px] text-dim">{sub}</div>}
    </div>
  );
}
