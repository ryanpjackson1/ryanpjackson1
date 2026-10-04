"use client";
import { useNexus } from "@/state/store";
import { dispatch } from "@/commands/dispatch";

/** LOCKED / DRIFT and reduced motion. Each control states its consequence. */
export function MotionControls() {
  const drift = useNexus((s) => s.drift);
  const reduced = useNexus((s) => s.reducedMotion);
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => dispatch({ type: "motion/drift" }, "ui")}
        disabled={reduced}
        aria-pressed={drift}
        className="glass rounded-full pl-2 pr-4 py-1.5 flex items-center gap-3 text-left disabled:opacity-50 disabled:cursor-not-allowed hover:border-holo/40"
      >
        <span className="relative h-4 w-8 rounded-full bg-faint/70" aria-hidden>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-holo-hi transition-[left] duration-200 ${drift ? "left-[18px]" : "left-0.5"}`} />
        </span>
        <span>
          <span className="block font-mono text-xs tracking-[0.18em]">{drift ? "DRIFT" : "LOCKED"}</span>
          <span className="block text-[11px] text-dim">
            {reduced ? "drift unavailable with reduced motion" : drift ? "the room floats · L to lock" : "the room holds still · L to drift"}
          </span>
        </span>
      </button>
      <label className="flex items-center gap-2 text-[12px] text-dim cursor-pointer select-none">
        <input
          type="checkbox"
          checked={reduced}
          onChange={(e) => dispatch({ type: "motion/reduced", on: e.target.checked }, "ui")}
          className="accent-[#8fb8ff]"
        />
        Reduce motion
      </label>
    </div>
  );
}
