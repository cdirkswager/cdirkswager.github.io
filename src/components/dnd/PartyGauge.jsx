import { useState } from "react";

const COLOR = {
  ok: "var(--ok)", warn: "var(--warn)", risk: "var(--risk)", crit: "var(--crit)",
};

function Bar({ label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[10px] uppercase tracking-wide text-dim">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink">
        <div className="gauge-fill h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="mono w-9 text-right text-xs">{value}%</span>
    </div>
  );
}

export function PartyGauge({ report, playerNames }) {
  const [open, setOpen] = useState(false);
  if (!report) return null;
  const tierColor = COLOR[report.risk.color] ?? "var(--dim)";

  return (
    <div className="fixed inset-x-0 bottom-0 z-30">
      {open && (
        <div className="mx-auto max-w-[1400px] px-4">
          <div className="fadeup rounded-t-lg border border-b-0 border-line bg-panel p-4 shadow-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="min-w-[220px] flex-1">
                <Bar label="Offense" value={report.category.offense} color="var(--accent)" />
                <div className="mt-1.5"><Bar label="Defense" value={report.category.defense} color="var(--player)" /></div>
                <div className="mt-1.5"><Bar label="Sustain" value={report.category.sustain} color="var(--ok)" /></div>
              </div>
              <div className="text-xs text-dim">
                <p className="text-fg">{report.risk.guidance}</p>
                <p className="mt-1">Safe to run: {report.risk.safeEncounter}</p>
                {report.shortRestWouldHelp && (
                  <p className="mt-1 text-warn">⟳ A short rest would restore meaningful combat value.</p>
                )}
              </div>
            </div>

            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {report.perPlayer.map((p) => {
                const spotlight = p.playerId === report.spotlightPlayerId;
                const depleted = p.playerId === report.depletedPlayerId;
                return (
                  <div key={p.playerId} className="flex items-center gap-2 rounded border border-line bg-ink px-2.5 py-1.5">
                    <span className="flex-1 truncate text-sm">
                      {spotlight && <span title="Most resources left — spotlight them">🎯 </span>}
                      {depleted && <span title="Running on empty">⚠ </span>}
                      {p.name}
                    </span>
                    <span className="mono text-xs text-dim">{p.resourcesRemainingPct}%</span>
                    <span className="mono text-sm font-bold" style={{ color: tierColorFor(p.overall) }}>
                      {p.overall}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full border-t border-line bg-panel/95 backdrop-blur"
        style={{ boxShadow: `inset 0 2px 0 0 ${tierColor}` }}
      >
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: tierColor, boxShadow: `0 0 8px ${tierColor}` }} />
          <span className="display text-sm font-bold uppercase tracking-wide" style={{ color: tierColor }}>
            {report.risk.label}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink">
            <div className="gauge-fill h-full rounded-full" style={{ width: `${report.overall}%`, background: tierColor }} />
          </div>
          <span className="mono text-sm font-bold" style={{ color: tierColor }}>{report.overall}%</span>
          <span className="text-xs text-dim">{open ? "▾" : "▴"}</span>
        </div>
      </button>
    </div>
  );
}

function tierColorFor(v) {
  if (v > 75) return COLOR.ok;
  if (v > 50) return COLOR.warn;
  if (v > 25) return COLOR.risk;
  return COLOR.crit;
}
