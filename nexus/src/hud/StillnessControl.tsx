"use client";
import { motion } from "framer-motion";
import { useNexus } from "@/stores/nexus";
import { dispatch } from "@/core/dispatch";
import { fmSpring } from "@/core/motion";

/**
 * LOCKED / DRIFT. The control states its own consequence, so nobody has to
 * guess what the toggle does. Ambient motion is OFF by default.
 */
export function StillnessControl() {
  const drift = useNexus((s) => s.driftEnabled);
  const frozen = useNexus((s) => s.frozen);
  return (
    <button
      data-ui
      onClick={() => void dispatch({ kind: "drift" }, "mouse")}
      className="group flex items-center gap-3 rounded-full border hairline px-3 py-1.5 bg-black/20 backdrop-blur hover:border-holo/40 transition-colors"
      aria-pressed={drift}
      aria-label={drift ? "Drift on: ambient motion. Click to lock." : "Locked: the room holds still. Click to let it drift."}
    >
      <span className="relative flex h-4 w-8 rounded-full bg-faint/50">
        <motion.span className="absolute top-0.5 h-3 w-3 rounded-full bg-holo-hi" animate={{ left: drift ? 18 : 2 }} transition={fmSpring("acknowledging")} />
      </span>
      <span className="text-left">
        <span className="block font-mono text-[11px] tracking-[0.2em] text-ink">{frozen ? "FROZEN" : drift ? "DRIFT" : "LOCKED"}</span>
        <span className="block label !text-[9px] !tracking-[0.12em] normal-case">
          {frozen ? "palm held · nothing moves" : drift ? "the room floats · L to lock" : "the room holds still · L to drift"}
        </span>
      </span>
    </button>
  );
}
