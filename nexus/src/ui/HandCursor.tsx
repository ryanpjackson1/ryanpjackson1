"use client";
import { useEffect, useRef } from "react";
import { rt } from "@/render/runtime";

/** A small ring that follows the tracked fingertip; it tightens while pinching. */
export function HandCursor() {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const d = el.current;
      if (d) {
        d.style.opacity = rt.hand.active ? "1" : "0";
        const x = (rt.hand.x * 0.5 + 0.5) * window.innerWidth;
        const y = (0.5 - rt.hand.y * 0.5) * window.innerHeight;
        const s = rt.hand.pinching ? 0.55 : 1;
        d.style.transform = `translate(${x - 14}px, ${y - 14}px) scale(${s})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={el} aria-hidden className="fixed left-0 top-0 z-[60] h-7 w-7 rounded-full border-2 border-holo-hi/90 shadow-[0_0_18px_rgba(143,184,255,0.8)] pointer-events-none" style={{ opacity: 0 }} />;
}
