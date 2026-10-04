"use client";
import { useNexus } from "@/state/store";
import { dispatch } from "@/commands/dispatch";
import { MODULES, MODULE_IDS } from "@/modules/registry";
import { frontModule } from "@/commands/reducer";

/** Keyboard-focusable index of all modules; also usable without WebGL. */
export function ModuleDock() {
  const front = useNexus((s) => frontModule(s.ringIndex));
  return (
    <nav aria-label="Modules" className="flex flex-wrap justify-center gap-1.5">
      {MODULE_IDS.map((id, i) => (
        <button
          key={id}
          type="button"
          onClick={() => dispatch({ type: "module/open", id }, "ui")}
          aria-current={front === id ? "true" : undefined}
          className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${front === id ? "border-holo/60 text-ink bg-holo/10" : "hairline text-dim hover:text-ink hover:border-holo/40"}`}
        >
          <span className="font-mono text-faint mr-1.5">{i === 9 ? 0 : i + 1}</span>{MODULES[id].label}
        </button>
      ))}
    </nav>
  );
}
