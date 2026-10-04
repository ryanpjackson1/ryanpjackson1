"use client";
import { useEffect, useRef } from "react";
import { motion, useMotionValue, animate, type MotionValue } from "framer-motion";
import { useNexus } from "@/stores/nexus";
import { MODULES, accentCss, type ModuleId } from "@/core/modules";
import { rt } from "@/core/runtime";
import { presenter } from "@/render/form/HandRig";
import { useFrameLoop } from "@/hooks/useFrameLoop";
import { SPRING } from "@/core/motion";
import { fmtAgo } from "@/modules/format";

/**
 * While embodied there is no ring, so modules are PRESENTED: a glass panel
 * beside the figure — 24 px title, tabular figures a person across the
 * room could quote, a sparkline that draws itself, status, provenance,
 * age. Two at most.
 *
 * The panel is never IN the hand. It stays DOM (readability is the whole
 * point) and is carried as a hologram: the rig publishes the held panel's
 * centre in screen space each frame; the panel follows it with motion
 * values (no React render per frame) and springs to its slot the moment
 * the hand lets go. No hand ready → it slides in from the edge.
 */
const W = 360;

function slotFor(i: number, n: number) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const x = vw - W / 2 - Math.max(32, vw * 0.06);
  const gap = 24;
  const h = 300;
  const total = n * h + (n - 1) * gap;
  const y = vh / 2 - total / 2 + i * (h + gap) + h / 2;
  return { x, y };
}

function Spark({ series, id }: { series?: number[]; id: ModuleId }) {
  if (!series || series.length < 2) return <div className="h-14" />;
  let lo = Infinity, hi = -Infinity;
  for (const v of series) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const d = series.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (series.length - 1)) * 300).toFixed(1)},${(52 - ((v - lo) / (hi - lo || 1)) * 48).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 300 56" className="w-full h-14" aria-hidden>
      <motion.path d={d} fill="none" stroke={accentCss(id)} strokeWidth={2} strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ type: "spring", ...SPRING.reporting, delay: 0.25 }} />
    </svg>
  );
}

function Presented({ id, index, count }: { id: ModuleId; index: number; count: number }) {
  const p = useNexus((s) => s.payloads[id]);
  const x = useMotionValue(window.innerWidth + W);
  const y = useMotionValue(window.innerHeight / 2);
  const opacity = useMotionValue(0);
  const mode = useRef<"follow" | "slot" | "init">("init");
  const anim = useRef<{ stop: () => void }[]>([]);

  const toSlot = (mx: MotionValue<number>, my: MotionValue<number>) => {
    const s = slotFor(index, count);
    anim.current.forEach((a) => a.stop());
    anim.current = [
      animate(mx, s.x, { type: "spring", ...SPRING.arriving }),
      animate(my, s.y, { type: "spring", ...SPRING.arriving }),
      animate(opacity, 1, { duration: 0.35 }),
    ];
  };

  useFrameLoop(() => {
    const held = presenter.id === id && !presenter.released && rt.handAnchor;
    if (held && rt.handAnchor) {
      // follow the palm: hologram above the open hand
      mode.current = "follow";
      anim.current.forEach((a) => a.stop());
      x.set(rt.handAnchor.x);
      y.set(rt.handAnchor.y - 40);
      opacity.set(rt.handAnchor.visible * 0.95);
      return;
    }
    if (mode.current !== "slot") {
      const waiting = presenter.queue.includes(id) || (presenter.id === id && !presenter.released);
      if (waiting && mode.current === "init") return; // hand about to rise
      mode.current = "slot";
      toSlot(x, y);
    }
  });

  // re-slot when the set of panels changes; after settling the panel stays still
  useEffect(() => { if (mode.current === "slot") toSlot(x, y); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [index, count]);

  // the head turns toward presented panels
  useEffect(() => {
    const s = slotFor(index, count);
    rt.panelTargets[index] = { x: (s.x / window.innerWidth) * 2 - 1, y: -((s.y / window.innerHeight) * 2 - 1) };
    return () => { rt.panelTargets = rt.panelTargets.slice(0, count - 1); };
  }, [index, count]);

  const meta = MODULES[id];
  return (
    <motion.section
      data-ui
      style={{ x, y, opacity, translateX: "-50%", translateY: "-50%", width: W }}
      className="fixed left-0 top-0 z-30 glass rounded-[22px] p-6"
      aria-label={`${meta.label} panel`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[24px] font-semibold tracking-tight leading-none">{meta.label}</h3>
        <span className="flex items-center gap-2 label">
          <span className={`h-1.5 w-1.5 rounded-full ${p?.status === "live" ? "bg-ok" : p?.warning || p?.status === "error" ? "bg-warn" : "bg-dim"}`} />
          {p?.status ?? "connecting"}
        </span>
      </div>
      <div className="label mt-5">{p?.headline.label ?? "—"}</div>
      <div className="text-[44px] font-semibold tnum leading-[1.05] tracking-tight mt-1 truncate">{p?.headline.value ?? "···"}</div>
      <div className="mt-3"><Spark series={p?.series} id={id} /></div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        {(p?.metrics ?? []).slice(0, 3).map((m) => (
          <div key={m.label}>
            <div className="label !text-[9px] truncate">{m.label}</div>
            <div className={`text-[17px] tnum font-medium ${m.warn ? "text-warn" : ""}`}>{m.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t hairline flex justify-between label !text-[9px]">
        <span className="truncate mr-3">{p?.source ?? "awaiting feed"}</span>
        <span className="tnum">{p ? fmtAgo(p.fetchedAt) : ""}</span>
      </div>
      {p?.hint && p.status !== "live" && <p className="mt-3 text-[12px] text-dim leading-snug">{p.hint}</p>}
    </motion.section>
  );
}

export function EmbodiedPanels() {
  const ids = useNexus((s) => s.embodiedPanels);
  return (
    <>
      {ids.map((id, i) => (
        <Presented key={id} id={id} index={i} count={ids.length} />
      ))}
    </>
  );
}
