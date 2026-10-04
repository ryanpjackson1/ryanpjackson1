"use client";
import { useNexus } from "@/state/store";
import { dispatch } from "@/commands/dispatch";
import { MODULES, MODULE_IDS, accent } from "@/modules/registry";
import { DEMO } from "@/modules/demo";
import { frontModule } from "@/commands/reducer";

/**
 * Used when WebGL is unavailable or fails. Same modules, same commands,
 * same panel and launcher — just laid out flat.
 */
export function Fallback2D() {
  const front = useNexus((s) => frontModule(s.ringIndex));
  const hovered = useNexus((s) => s.hoveredId);
  return (
    <main className="fixed inset-0 overflow-y-auto pl-[420px] pr-6 pt-36 pb-48 max-lg:pl-6 max-lg:pt-[420px]">
      <ul className="mx-auto max-w-5xl grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" aria-label="Modules">
        {MODULE_IDS.map((id) => {
          const m = MODULES[id];
          const on = front === id || hovered === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => dispatch({ type: "module/open", id }, "mouse")}
                onMouseEnter={() => dispatch({ type: "card/hover", id }, "mouse")}
                onMouseLeave={() => dispatch({ type: "card/hover", id: null }, "mouse")}
                className={`glass w-full text-left rounded-2xl p-4 transition-colors ${on ? "border-holo/60" : ""}`}
                style={{ boxShadow: `0 0 0 1px ${accent(id, on ? 0.35 : 0.12)} inset` }}
              >
                <span className="flex justify-between label"><span>{m.code}</span><span>Demo</span></span>
                <span className="block text-[18px] font-semibold mt-2">{m.label}</span>
                <span className="block text-[15px] tnum mt-3 truncate">{DEMO[id].headline.value}</span>
                <span className="block text-[11px] text-dim mt-1 truncate">{DEMO[id].headline.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
