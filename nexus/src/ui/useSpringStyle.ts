"use client";
import { useEffect, useRef } from "react";
import { springFor, stepSpring, type Spring, type SpringIntent } from "@/motion/spring";

/**
 * Drives a 0..1 spring toward `target` and hands each value to `apply`
 * (which writes element styles directly — no React render per frame).
 */
export function useSpringStyle(target: number, intent: SpringIntent, reducedMotion: boolean, apply: (v: number) => void) {
  const s = useRef<Spring>({ x: target, v: 0 });
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      stepSpring(s.current, target, springFor(intent, reducedMotion), dt, 1e-3);
      applyRef.current(s.current.x);
      if (s.current.x !== target || s.current.v !== 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, intent, reducedMotion]);
}
