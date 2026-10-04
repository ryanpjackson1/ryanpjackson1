"use client";
/**
 * ⌘K launcher — one ranked list over installed apps, websites, personal
 * Instagram destinations, NEXUS modules, NEXUS commands and system verbs.
 *
 * Mount it OUTSIDE the HUD visibility gate: it reads `paletteOpen` only and
 * never `hudVisible`, so ⌘K works with the HUD hidden. Every row executes by
 * handing an Intent to `dispatch(intent, "palette")`.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { InstagramDetail } from "@/core/details";
import { dispatch } from "@/core/dispatch";
import { fmSpring } from "@/core/motion";
import { useNexus } from "@/stores/nexus";
import { fetchApps, fetchBridgeStatus, type BridgeStatusResponse } from "@/bridge/client";
import type { InstalledApp } from "@/bridge/verbs";
import {
  appRows,
  buildResults,
  moduleRows,
  nexusRows,
  personalRows,
  siteRows,
  sysRows,
  type Row,
  type RowTag,
} from "./launcher/rows";

const TAG_STYLE: Record<RowTag, string> = {
  APP: "text-holo border-holo/30",
  WEB: "text-cyan border-cyan/30",
  MY: "text-violet border-violet/40",
  MODULE: "text-holo-hi border-holo-hi/25",
  NEXUS: "text-ok border-ok/25",
  SYS: "text-dim border-dim/30",
};

export default function Launcher() {
  const open = useNexus((s) => s.paletteOpen);
  const setStore = useNexus((s) => s.set);
  const instagram = useNexus((s) => s.payloads.instagram?.detail as InstagramDetail | undefined);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [status, setStatus] = useState<BridgeStatusResponse | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optId = (i: number) => `${baseId}-opt-${i}`;

  const close = useCallback(() => setStore({ paletteOpen: false }), [setStore]);

  // ⌘K / Ctrl+K toggles from anywhere — independent of HUD visibility.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setStore({ paletteOpen: !useNexus.getState().paletteOpen });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setStore]);

  // On open: reset, focus, refresh bridge status + app list (server caches ~30s).
  useEffect(() => {
    if (!open) {
      restoreFocus.current?.focus?.();
      return;
    }
    restoreFocus.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    let live = true;
    fetchBridgeStatus().then((s) => {
      if (!live) return;
      setStatus(s);
      if (s.enabled) fetchApps().then((a) => live && setApps(a));
    });
    return () => {
      live = false;
      cancelAnimationFrame(t);
    };
  }, [open]);

  const allRows = useMemo<Row[]>(
    () => [...personalRows(instagram), ...moduleRows(), ...nexusRows(), ...sysRows(), ...appRows(apps), ...siteRows()],
    [instagram, apps],
  );
  const results = useMemo(() => buildResults(query, allRows), [query, allRows]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
    // optId is stable for a given baseId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  const execute = useCallback(
    (row: Row | undefined) => {
      if (!row) return;
      close();
      void dispatch(row.intent, "palette");
    },
    [close],
  );

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const n = results.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (n) setActive((i) => (i + 1) % n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (n) setActive((i) => (i - 1 + n) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      execute(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const bridgeOff = status !== null && !status.enabled;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="nx-launcher"
          className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[16vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fmSpring("leaving")}
        >
          <div className="absolute inset-0 bg-void/50" onMouseDown={close} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Launcher"
            className="glass relative w-full max-w-[620px] overflow-hidden rounded-2xl"
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: fmSpring("arriving") }}
            exit={{ opacity: 0, y: -8, scale: 0.99, transition: fmSpring("leaving") }}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 border-b hairline px-4 py-3">
              <span className="label select-none">⌘K</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Apps, sites, modules, commands…"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint outline-none"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={results.length ? optId(active) : undefined}
                spellCheck={false}
                autoComplete="off"
              />
            </div>

            <ul id={listId} role="listbox" aria-label="Results" className="nx-scroll max-h-[52vh] overflow-y-auto py-1.5">
              {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-dim">Nothing matches “{query}”.</li>}
              {results.map((row, i) => {
                const selected = i === active;
                const reason = row.bridge && bridgeOff ? status?.reason : null;
                return (
                  <li
                    key={row.id}
                    id={optId(i)}
                    role="option"
                    aria-selected={selected}
                    onMouseMove={() => !selected && setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execute(row)}
                    className={`mx-1.5 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${selected ? "bg-holo/10" : ""}`}
                  >
                    <span className={`w-[64px] shrink-0 rounded border px-1.5 py-0.5 text-center font-mono text-[9px] uppercase tracking-[0.18em] ${TAG_STYLE[row.tag]}`}>
                      {row.tag}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${selected ? "text-holo-hi" : "text-ink"}`}>{row.title}</span>
                      {(reason || row.subtitle) && (
                        <span className={`block truncate font-mono text-[10px] ${reason ? "text-faint" : "text-dim"}`}>
                          {reason ?? row.subtitle}
                        </span>
                      )}
                    </span>
                    {selected && <span className="label shrink-0">↵</span>}
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between gap-4 border-t hairline px-4 py-2">
              <span className="label truncate">
                {bridgeOff ? `${status?.reason}${status?.fix ? ` — ${status.fix}` : ""}` : `${apps.length} apps · bridge ${status?.enabled ? "on" : "…"}`}
              </span>
              <span className="label shrink-0">↑↓ move · ↵ run · esc close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
