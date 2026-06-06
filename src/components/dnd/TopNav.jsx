import { Link, useLocation } from "react-router-dom";

const LINKS = [
  { href: "/dm/dnd/combat", label: "Combat" },
  { href: "/dm/dnd/players", label: "Party" },
  { href: "/dm/dnd/monsters", label: "Bestiary" },
  { href: "/dm/dnd/npcs", label: "NPCs" },
  { href: "/dm/dnd/encounters", label: "Encounters" },
];

export function TopNav() {
  const { pathname } = useLocation();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-1 px-4 py-2">
        <Link to="/dm/dnd/combat" className="display mr-3 text-lg font-extrabold tracking-tight text-accent">
          DM<span className="text-fg">·</span>CONSOLE
        </Link>
        <nav className="flex items-center gap-0.5">
          {LINKS.map((l) => {
            const active = pathname === l.href || (l.href !== "/dm/dnd/combat" && pathname.startsWith(l.href));
            return (
              <Link
                key={l.href}
                to={l.href}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-panel-2 text-fg" : "text-dim hover:text-fg"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-xs text-dim">
          <kbd className="rounded border border-line bg-panel px-1.5 py-0.5 mono">⌘K</kbd>
          <span className="hidden sm:inline">to search</span>
        </div>
      </div>
    </header>
  );
}
