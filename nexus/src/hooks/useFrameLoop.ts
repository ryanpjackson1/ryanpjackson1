"use client";
import { useEffect, useRef } from "react";

/** rAF loop for DOM layers that must follow per-frame state without React renders. */
export function useFrameLoop(fn: (t: number, dt: number) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      ref.current(now / 1000, Math.min(0.05, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
