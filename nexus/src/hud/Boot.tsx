"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { BOOT } from "@/core/motion";
import { useNexus } from "@/stores/nexus";
import { uiSound } from "@/audio/engine";

/**
 * Booting into an operating system, not opening a web page. One composed
 * GSAP timeline whose every offset comes from the BOOT beat constant.
 */
const DIAG = [
  "KERNEL · spatial runtime 7.0",
  "RENDER · WebGL2 · film grade online",
  "GESTURE · MediaPipe hand landmarker standing by",
  "VOICE · wake phrase “Nexus”",
  "BRIDGE · desktop verbs sealed",
  "FORM · figure field baked on demand",
];

export function Boot({ onEnter }: { onEnter: (sensors: boolean) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"boot" | "gate" | "done">("boot");
  const set = useNexus((s) => s.set);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.set(el.querySelectorAll("[data-letter]"), { opacity: 0, y: 18, filter: "blur(8px)" })
      .set(el.querySelectorAll("[data-diag]"), { opacity: 0, x: -10 })
      .to(el.querySelectorAll("[data-letter]"), { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.1, stagger: 0.06 }, BOOT.wordmark)
      .to(el.querySelector("[data-rule]"), { scaleX: 1, duration: 1.2, ease: "expo.inOut" }, BOOT.wordmark + 0.2)
      .to(el.querySelectorAll("[data-diag]"), { opacity: 1, x: 0, duration: 0.5, stagger: 0.12 }, BOOT.diagnostics)
      .to(el.querySelector("[data-veil]"), { opacity: 0, duration: 1.6, ease: "power2.inOut" }, BOOT.atmosphere)
      .call(() => set({ booted: true }), [], BOOT.hud)
      .call(() => setPhase("gate"), [], BOOT.ready);
    if (reduce) tl.progress(1);
    return () => { tl.kill(); };
  }, [set]);

  const enter = (sensors: boolean) => {
    if (phase === "done") return;
    setPhase("done");
    onEnter(sensors);
    uiSound("boot");
    gsap.to(root.current, { opacity: 0, duration: 0.9, ease: "power2.out", onComplete: () => { if (root.current) root.current.style.display = "none"; } });
  };

  useEffect(() => {
    if (phase !== "gate") return;
    const k = (e: KeyboardEvent) => { if (e.key === "Enter") enter(true); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  return (
    <div ref={root} className="fixed inset-0 z-50 pointer-events-none">
      <div data-veil className="absolute inset-0 bg-void" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="flex justify-center gap-[0.32em] text-[64px] font-extralight tracking-[0.06em] text-ink">
            {"NEXUS".split("").map((l, i) => <span key={i} data-letter>{l}</span>)}
          </div>
          <div data-rule className="mx-auto mt-4 h-px w-64 bg-gradient-to-r from-transparent via-holo to-transparent origin-center" style={{ transform: "scaleX(0)" }} />
          <div className="mt-6 space-y-1 font-mono text-[11px] text-dim text-left inline-block">
            {DIAG.map((d) => <div key={d} data-diag><span className="text-ok mr-2">●</span>{d}</div>)}
          </div>
        </div>
      </div>
      {phase === "gate" && (
        <div className="absolute inset-x-0 bottom-[14vh] flex flex-col items-center gap-3 pointer-events-auto">
          <button
            autoFocus
            onClick={() => enter(true)}
            className="glass rounded-full px-8 py-3 font-mono text-[12px] tracking-[0.3em] text-ink hover:text-white hover:border-holo/50 transition-colors"
          >
            ENTER NEXUS
          </button>
          <div className="label">camera for hand tracking · microphone for voice · press ↵</div>
          <button onClick={() => enter(false)} className="label underline-offset-4 hover:underline hover:text-ink">enter with mouse + keyboard only</button>
        </div>
      )}
    </div>
  );
}
