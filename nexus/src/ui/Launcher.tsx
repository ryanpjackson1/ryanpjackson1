"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNexus } from "@/state/store";
import { dispatch } from "@/commands/dispatch";
import { searchLauncher } from "@/commands/launcher";
import { useSpringStyle } from "./useSpringStyle";

/** Ctrl+K launcher: one searchable list of modules and actions. */
export function Launcher() {
  const open = useNexus((s) => s.launcherOpen);
  const reduced = useNexus((s) => s.reducedMotion);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  const results = useMemo(() => searchLauncher(query), [query]);

  // Focus synchronously on open: keys typed straight after Ctrl+K must land
  // in the search box even on a slow frame.
  useLayoutEffect(() => {
    if (open) {
      restore.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActive(0);
      input.current?.focus();
    } else {
      restore.current?.focus?.();
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);

  useSpringStyle(open ? 1 : 0, "arrive", reduced, (v) => {
    const el = panel.current;
    if (!el) return;
    el.style.opacity = String(Math.max(0, Math.min(1, v)));
    el.style.transform = reduced ? "none" : `translateY(${(1 - v) * -12}px) scale(${0.97 + v * 0.03})`;
  });

  if (!open) return null;

  const run = (i: number) => {
    const e = results[i];
    if (!e) return;
    dispatch({ type: "launcher/close" }, "launcher");
    dispatch(e.command, "launcher");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(active); }
    else if (e.key === "Tab") e.preventDefault(); // keep focus inside the dialog
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60" onMouseDown={() => dispatch({ type: "launcher/close" }, "mouse")}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Module launcher"
        className="glass-solid absolute left-1/2 top-[16vh] -translate-x-1/2 w-[min(620px,92vw)] rounded-2xl overflow-hidden"
        style={{ opacity: 0 }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b hairline">
          <span className="label">Ctrl K</span>
          <input
            ref={input}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules and actions…"
            aria-label="Search modules and actions"
            role="combobox"
            aria-expanded="true"
            aria-controls="launcher-list"
            aria-activedescendant={results[active] ? `opt-${results[active].id}` : undefined}
            className="flex-1 bg-transparent outline-none text-[17px] placeholder:text-faint"
          />
        </div>
        <ul id="launcher-list" role="listbox" className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 && <li className="px-5 py-3 text-dim text-sm">No matches.</li>}
          {results.map((e, i) => (
            <li
              key={e.id}
              id={`opt-${e.id}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(i)}
              className={`mx-2 px-3 py-2.5 rounded-lg flex items-center justify-between gap-4 cursor-pointer ${i === active ? "bg-holo/12 text-ink" : "text-ink/85"}`}
            >
              <span className="min-w-0">
                <span className="block text-[15px]">{e.title}</span>
                <span className="block text-[12px] text-dim truncate">{e.subtitle}</span>
              </span>
              <span className="label shrink-0">{e.group}</span>
            </li>
          ))}
        </ul>
        <div className="px-5 py-2 border-t hairline label flex gap-4">
          <span>↑↓ choose</span><span>Enter run</span><span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
