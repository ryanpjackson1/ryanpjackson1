"use client";
import { useNexus } from "@/stores/nexus";
import { MODULE_IDS, MODULES, accentCss } from "@/core/modules";
import { dispatch } from "@/core/dispatch";

/**
 * Graceful fallback when WebGL2 is unavailable: the same modules as an
 * accessible, keyboard-navigable grid. Everything still works — voice,
 * ⌘K, the bridge and the panels — just without the room.
 */
export function Fallback2D() {
  const payloads = useNexus((s) => s.payloads);
  return (
    <main className="fixed inset-0 overflow-y-auto nx-scroll px-8 pt-40 pb-24" aria-label="Modules">
      <div className="mx-auto max-w-5xl grid grid-cols-2 md:grid-cols-5 gap-4">
        {MODULE_IDS.map((id) => {
          const p = payloads[id];
          return (
            <button key={id} data-ui onClick={() => void dispatch({ kind: "open-module", id }, "mouse")}
              className="glass rounded-2xl p-4 text-left hover:border-holo/40 transition-colors" style={{ boxShadow: `0 0 0 1px ${accentCss(id, 0.15)} inset` }}>
              <div className="label">{MODULES[id].code}</div>
              <div className="text-lg font-semibold mt-1">{MODULES[id].label}</div>
              <div className="text-2xl tnum mt-3 truncate">{p?.headline.value ?? "···"}</div>
              <div className="label mt-1 truncate">{p?.headline.label ?? "connecting"}</div>
            </button>
          );
        })}
      </div>
    </main>
  );
}
