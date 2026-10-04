"use client";
import { useRef } from "react";
import { useFrameLoop } from "@/hooks/useFrameLoop";
import { rt } from "@/core/runtime";

/** Every gesture leaves a light trail: the fingertips' recent path, fading in ~0.5 s. */
type P = { x: number; y: number; t: number; pinch: number };

export function GestureTrail() {
  const ref = useRef<HTMLCanvasElement>(null);
  const trails = useRef<P[][]>([[], []]);
  useFrameLoop((t) => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    if (c.width !== Math.floor(w * dpr)) { c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr); }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    rt.hands.forEach((hand, i) => {
      const tr = trails.current[i];
      if (hand.present) tr.push({ x: (hand.px * 0.5 + 0.5) * w, y: (0.5 - hand.py * 0.5) * h, t, pinch: hand.pinch });
      while (tr.length && t - tr[0].t > 0.5) tr.shift();
      for (let k = 1; k < tr.length; k++) {
        const a = tr[k - 1], b = tr[k];
        const age = 1 - (t - b.t) / 0.5;
        g.strokeStyle = b.pinch > 0.6 ? `rgba(220,235,255,${age * 0.9})` : `rgba(120,170,255,${age * 0.7})`;
        g.lineWidth = 1 + age * (b.pinch > 0.6 ? 5 : 3);
        g.lineCap = "round";
        g.shadowColor = "rgba(120,170,255,0.9)";
        g.shadowBlur = 12 * age;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
      if (hand.present) {
        const x = (hand.px * 0.5 + 0.5) * w, y = (0.5 - hand.py * 0.5) * h;
        // cursor ring: contracts as you pinch
        g.shadowBlur = 16;
        g.strokeStyle = "rgba(214,230,255,0.9)";
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, y, 16 - hand.pinch * 10, 0, Math.PI * 2);
        g.stroke();
      }
    });
    g.shadowBlur = 0;
  });
  return <canvas ref={ref} className="fixed inset-0 z-10 pointer-events-none" aria-hidden />;
}
