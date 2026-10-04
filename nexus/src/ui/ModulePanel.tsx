"use client";
import { useEffect, useRef } from "react";
import { useNexus } from "@/state/store";
import { dispatch } from "@/commands/dispatch";
import { MODULES, accent } from "@/modules/registry";
import { DEMO } from "@/modules/demo";
import { useSpringStyle } from "./useSpringStyle";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i / (values.length - 1)) * 300},${56 - ((v - lo) / span) * 50}`).join(" ");
  return (
    <svg viewBox="0 0 300 60" className="w-full h-16" role="img" aria-label="Sample trend line (demo data)">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

/** The expanded, readable module panel (modal). Escape or the button closes it. */
export function ModulePanel() {
  const id = useNexus((s) => s.openId);
  const reduced = useNexus((s) => s.reducedMotion);
  const root = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (id) {
      restore.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => closeBtn.current?.focus());
    } else restore.current?.focus?.();
  }, [id]);

  useSpringStyle(id ? 1 : 0, "arrive", reduced, (v) => {
    const el = root.current;
    if (!el) return;
    el.style.opacity = String(Math.max(0, Math.min(1, v)));
    el.style.transform = reduced ? "translate(-50%, -50%)" : `translate(-50%, -50%) translateY(${(1 - v) * 24}px) scale(${0.96 + v * 0.04})`;
  });

  if (!id) return null;
  const m = MODULES[id];
  const demo = DEMO[id];
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/60" aria-hidden onMouseDown={() => dispatch({ type: "panel/close" }, "mouse")} />
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        onKeyDown={(e) => { if (e.key === "Tab") { e.preventDefault(); closeBtn.current?.focus(); } }}
        className="glass-solid fixed left-1/2 top-1/2 z-40 w-[min(760px,94vw)] max-h-[86vh] overflow-y-auto rounded-3xl"
        style={{ opacity: 0, boxShadow: `0 0 0 1px ${accent(id, 0.18)} inset, 0 40px 120px -40px ${accent(id, 0.45)}` }}
      >
        <header className="flex items-start justify-between gap-4 px-7 pt-6 pb-4 border-b hairline">
          <div>
            <div className="label">{m.code}</div>
            <h2 id="panel-title" className="text-[28px] font-semibold tracking-tight mt-1">{m.label}</h2>
            <p className="text-dim text-[14px] mt-1">{m.purpose}</p>
          </div>
          <button
            ref={closeBtn}
            type="button"
            onClick={() => dispatch({ type: "panel/close" }, "mouse")}
            className="shrink-0 rounded-full border hairline px-3 py-1.5 text-[13px] hover:border-holo/50"
          >
            Close <span className="text-dim">Esc</span>
          </button>
        </header>
        <div className="px-7 py-6 space-y-6">
          <div role="note" className="rounded-xl border border-holo/30 bg-holo/[0.07] px-4 py-3 text-[14px]">
            <strong className="font-semibold">Demo data.</strong> {demo.source.replace("Demo data — ", "Every value below is a sample — ")}.
          </div>
          <div>
            <div className="label">{demo.headline.label}</div>
            <div className="text-[40px] font-semibold tnum leading-tight mt-1">{demo.headline.value}</div>
            <Sparkline values={demo.series} color={accent(id)} />
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {demo.metrics.map((mt) => (
              <div key={mt.label} className="rounded-xl border hairline px-4 py-3">
                <dt className="label">{mt.label}</dt>
                <dd className="text-[22px] font-medium tnum mt-1">{mt.value}</dd>
              </div>
            ))}
          </dl>
          {demo.sections.map((sec) => (
            <section key={sec.title}>
              <h3 className="label mb-2">{sec.title}</h3>
              <ul className="divide-y divide-[rgba(143,184,255,0.12)] rounded-xl border hairline">
                {sec.rows.map((r) => (
                  <li key={r.primary} className="flex items-baseline justify-between gap-4 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-[15px]">{r.primary}</span>
                      {r.secondary && <span className="block text-[13px] text-dim">{r.secondary}</span>}
                    </span>
                    {r.value && <span className="tnum text-[14px] shrink-0">{r.value}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
