"use client";
import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { useNexus } from "@/stores/nexus";
import { MODULES, accentCss } from "@/core/modules";
import { PANELS } from "@/modules/panels";
import { presentation } from "@/core/clocks/presentation";
import { useFrameLoop } from "@/hooks/useFrameLoop";
import { dispatch } from "@/core/dispatch";
import { emptyPayload } from "@/core/payload";

/**
 * The expanded module: a DOM glass panel (readability is the point) that
 * rises out of the card at the end of the presentation sequence. Its
 * presence is the master clock's `panel` envelope — never its own timer.
 */
export function ExpandedPanel() {
  const id = useNexus((s) => s.expanded);
  const payload = useNexus((s) => (s.expanded ? s.payloads[s.expanded] : undefined));
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useFrameLoop(() => {
    const el = root.current;
    if (!el) return;
    const env = presentation.envelopes();
    const k = env.id ? env.panel : 0;
    el.style.opacity = String(k);
    el.style.transform = `translate(-50%, -50%) translateY(${(1 - k) * 28}px) scale(${0.96 + k * 0.04})`;
    el.style.pointerEvents = k > 0.5 ? "auto" : "none";
    el.style.visibility = k < 0.01 ? "hidden" : "visible";
  });

  useEffect(() => {
    if (!scroller.current) return;
    const content = scroller.current.querySelector<HTMLElement>(".nx-scroll") ?? scroller.current;
    const lenis = new Lenis({ wrapper: scroller.current, content: content === scroller.current ? (scroller.current.firstElementChild as HTMLElement) : content, smoothWheel: true, lerp: 0.12 });
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, [id]);

  if (!id) return null;
  const Panel = PANELS[id];
  const meta = MODULES[id];
  const p = payload ?? emptyPayload(id, "stale", "connecting", "Fetching live data…");
  return (
    <div
      ref={root}
      data-ui
      role="dialog"
      aria-label={`${meta.label} module`}
      className="fixed left-1/2 top-1/2 z-30 w-[min(820px,92vw)] max-h-[82vh] glass rounded-[28px] overflow-hidden flex flex-col"
      style={{ opacity: 0, boxShadow: `0 0 0 1px ${accentCss(id, 0.16)} inset, 0 40px 120px -40px ${accentCss(id, 0.5)}` }}
    >
      <header className="flex items-center justify-between px-7 pt-6 pb-4 border-b hairline">
        <div className="flex items-baseline gap-4">
          <span className="label">{meta.code}</span>
          <h2 className="text-[26px] font-semibold tracking-tight">{meta.label}</h2>
        </div>
        <button
          onClick={() => void dispatch({ kind: "close" }, "mouse")}
          className="h-8 w-8 rounded-full border hairline grid place-items-center text-dim hover:text-ink hover:border-holo/40 transition-colors"
          aria-label="Close (Esc, push gesture, or closed hand)"
        >
          ✕
        </button>
      </header>
      <div ref={scroller} className="nx-scroll overflow-y-auto px-7 py-6">
        <div>
          <Panel payload={p} />
        </div>
      </div>
    </div>
  );
}
