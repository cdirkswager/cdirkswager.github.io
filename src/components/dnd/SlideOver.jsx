import { useEffect } from "react";

export function SlideOver({ open, onClose, title, children, width = "max-w-md" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside
        className={`absolute right-0 top-0 h-full w-full ${width} overflow-y-auto border-l border-line bg-panel shadow-2xl`}
        style={{ animation: "fadeup 0.2s ease both" }}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-4 py-3">
          <h2 className="display text-sm font-bold uppercase tracking-wide text-accent">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded px-2 py-0.5 text-dim hover:bg-panel-2 hover:text-fg"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </aside>
    </div>
  );
}
