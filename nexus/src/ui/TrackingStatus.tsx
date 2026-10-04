"use client";
import { useNexus } from "@/state/store";
import { dispatch } from "@/commands/dispatch";
import type { TrackingStatus as Status } from "@/state/types";

const LABEL: Record<Status, string> = {
  off: "Off",
  requesting: "Requesting permission",
  loading: "Loading model",
  active: "Tracking",
  "no-hand": "No hand in view",
  denied: "Permission denied",
  "no-camera": "No camera found",
  "in-use": "Camera busy",
  insecure: "Insecure address",
  unsupported: "Not supported",
  "model-failed": "Model failed to load",
  error: "Error",
};

const PROBLEM = new Set<Status>(["denied", "no-camera", "in-use", "insecure", "unsupported", "model-failed", "error"]);
const RUNNING = new Set<Status>(["requesting", "loading", "active", "no-hand"]);

/** Webcam control + clear status. The camera is only ever started from here or ⌘K. */
export function TrackingStatus() {
  const t = useNexus((s) => s.tracking);
  const problem = PROBLEM.has(t.status);
  const running = RUNNING.has(t.status);
  return (
    <section aria-labelledby="tracking-title" className={`glass rounded-2xl p-4 w-[min(360px,86vw)] ${problem ? "border-alert/50" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="tracking-title" className="label">Hand tracking</h2>
        <span role="status" aria-live="polite" className={`flex items-center gap-2 font-mono text-xs ${problem ? "text-alert" : t.status === "active" ? "text-ok" : "text-dim"}`}>
          <span className={`h-2 w-2 rounded-full ${problem ? "bg-alert" : t.status === "active" ? "bg-ok" : running ? "bg-holo animate-pulse" : "bg-faint"}`} aria-hidden />
          {LABEL[t.status]}
        </span>
      </div>
      {t.message && <p className="mt-2 text-[13px] leading-snug">{t.message}</p>}
      {t.hint && <p className="mt-1 text-[12px] leading-snug text-dim">{t.hint}</p>}
      {t.status === "off" && (
        <p className="mt-2 text-[12px] leading-snug text-dim">Optional. Swipe left/right to rotate, pinch to open. The camera stays off until you enable it; frames never leave your machine.</p>
      )}
      <div className="mt-3 flex gap-2">
        {running ? (
          <button type="button" onClick={() => dispatch({ type: "tracking/stop" }, "ui")} className="rounded-lg border hairline px-3 py-1.5 text-[13px] hover:border-holo/50">
            Turn camera off
          </button>
        ) : (
          <button type="button" onClick={() => dispatch({ type: "tracking/start" }, "ui")} className="rounded-lg bg-holo/15 border border-holo/40 px-3 py-1.5 text-[13px] hover:bg-holo/25">
            {problem ? "Try again" : "Enable camera"}
          </button>
        )}
      </div>
    </section>
  );
}
