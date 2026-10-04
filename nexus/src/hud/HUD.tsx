"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNexus } from "@/stores/nexus";
import { formClock } from "@/core/clocks/form";
import { useFrameLoop } from "@/hooks/useFrameLoop";
import { fmSpring } from "@/core/motion";
import { WORLDS } from "@/render/scene/worlds";
import { HandPreview } from "./HandPreview";
import { StillnessControl } from "./StillnessControl";
import { VoiceOrb } from "./VoiceOrb";

/**
 * Very minimal HUD. Four corners:
 *   TL system status · FPS · tracking · GPU     TR clock · date
 *   BL system log                              BR gesture · confidence
 */
const TRACK_LABEL: Record<string, string> = {
  off: "OFF", loading: "LOADING", active: "LOCKED ON", "no-hand": "SEARCHING", denied: "DENIED", error: "ERROR",
};

function Row({ k, v, tone }: { k: string; v: string; tone?: "ok" | "warn" | "dim" }) {
  return (
    <div className="flex gap-3 items-baseline">
      <span className="label w-[74px]">{k}</span>
      <span className={`font-mono text-[11px] tnum ${tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "dim" ? "text-dim" : "text-ink"}`}>{v}</span>
    </div>
  );
}

function TopLeft({ onTracking }: { onTracking: () => void }) {
  const fps = useNexus((s) => s.fps);
  const tracking = useNexus((s) => s.tracking);
  const gpu = useNexus((s) => s.gpu);
  const tier = useNexus((s) => s.tier);
  const voice = useNexus((s) => s.voice);
  const world = useNexus((s) => s.world);
  const form = useNexus((s) => s.form);
  return (
    <div className="absolute top-5 left-6 space-y-1.5" data-ui>
      <div className="flex items-center gap-2 mb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_8px_#7dffc4]" />
        <span className="font-mono text-[11px] tracking-[0.32em] text-holo-hi">NEXUS</span>
        <span className="label">OS · 7.0</span>
      </div>
      <Row k="System" v={form === "human" ? "EMBODIED" : "NOMINAL"} tone="ok" />
      <Row k="FPS" v={`${fps} · T${tier}`} tone={fps < 45 ? "warn" : undefined} />
      <button onClick={onTracking} className="block text-left cursor-pointer" aria-label="Toggle hand tracking">
        <Row k="Tracking" v={TRACK_LABEL[tracking] ?? tracking} tone={tracking === "active" ? "ok" : tracking === "denied" || tracking === "error" ? "warn" : "dim"} />
      </button>
      <Row k="GPU" v={gpu} tone="dim" />
      <Row k="Voice" v={voice.toUpperCase()} tone={voice === "offline" ? "dim" : voice === "interrupted" ? "warn" : "ok"} />
      <Row k="World" v={WORLDS[world].name.toUpperCase()} tone="dim" />
      <div className="pt-2"><HandPreview /></div>
    </div>
  );
}

function TopRight() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  if (!now) return null;
  return (
    <div className="absolute top-5 right-6 text-right" data-ui>
      <div className="font-sans text-[30px] font-light tracking-tight tnum leading-none text-ink">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        <span className="text-dim text-[16px] ml-1">{String(now.getSeconds()).padStart(2, "0")}</span>
      </div>
      <div className="label mt-2">{now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: "numeric" })}</div>
      <div className="mt-4 flex justify-end"><StillnessControl /></div>
    </div>
  );
}

function BottomLeft() {
  const lines = useNexus((s) => s.log);
  return (
    <div className="absolute bottom-5 left-6 w-[min(420px,40vw)]" data-ui aria-live="polite">
      <div className="label mb-2">System log</div>
      <div className="space-y-0.5 font-mono text-[10.5px] leading-[1.55]">
        <AnimatePresence initial={false}>
          {lines.slice(-7).map((l) => (
            <motion.div
              key={l.t + l.msg}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={fmSpring("reporting")}
              className={`truncate ${l.level === "warn" ? "text-warn" : l.level === "ok" ? "text-holo-hi" : "text-dim"}`}
            >
              <span className="text-faint mr-2 tnum">{new Date(l.t).toLocaleTimeString([], { hour12: false })}</span>
              {l.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function BottomRight() {
  const g = useNexus((s) => s.gesture);
  const tracking = useNexus((s) => s.tracking);
  return (
    <div className="absolute bottom-5 right-6 text-right" data-ui>
      <div className="label mb-1">Gesture</div>
      <motion.div key={g.at} initial={{ scale: 1.08, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={fmSpring("acknowledging")}
        className="font-mono text-[18px] tracking-[0.12em] text-ink">
        {tracking === "off" ? "MOUSE" : g.name}
      </motion.div>
      <div className="flex items-center justify-end gap-2 mt-2">
        <span className="label">Confidence</span>
        <div className="w-24 h-[3px] bg-faint/40 rounded overflow-hidden">
          <motion.div className="h-full bg-holo" animate={{ width: `${Math.round(g.confidence * 100)}%` }} transition={fmSpring("reporting")} />
        </div>
        <span className="font-mono text-[11px] tnum text-dim w-9">{Math.round(g.confidence * 100)}%</span>
      </div>
    </div>
  );
}

export function HUD({ onTracking }: { onTracking: () => void }) {
  const visible = useNexus((s) => s.hudVisible);
  const booted = useNexus((s) => s.booted);
  const root = useRef<HTMLDivElement>(null);
  // the HUD dims (and dissolves into the journey) with the form clock
  useFrameLoop(() => {
    const el = root.current;
    if (!el) return;
    const f = formClock.envelopes();
    const o = 1 - Math.min(1, f.T / 1.0) * (1 - f.presence * 0.85);
    el.style.opacity = String(o);
    el.style.filter = f.T > 0 && f.presence < 1 ? `blur(${(1 - o) * 6}px)` : "";
  });
  return (
    <AnimatePresence>
      {visible && booted && (
        <motion.div
          className="fixed inset-0 pointer-events-none z-20 [&_[data-ui]]:pointer-events-auto select-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div ref={root} className="absolute inset-0">
            <TopLeft onTracking={onTracking} />
            <TopRight />
            <BottomLeft />
            <BottomRight />
            <VoiceOrb />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
