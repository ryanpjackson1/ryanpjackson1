"use client";
import { useRef } from "react";
import { useFrameLoop } from "@/hooks/useFrameLoop";
import { handPreview } from "@/gesture/useGestures";
import { useNexus } from "@/stores/nexus";

const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

/** A tiny wireframe of the tracked hands — so you can see what NEXUS sees. */
export function HandPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const tracking = useNexus((s) => s.tracking);
  useFrameLoop(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.strokeStyle = "rgba(143,184,255,0.14)";
    g.strokeRect(0.5, 0.5, c.width - 1, c.height - 1);
    if (performance.now() / 1000 - handPreview.t > 0.5) return;
    handPreview.raw.forEach((lm, h) => {
      g.strokeStyle = h === 0 ? "rgba(214,230,255,0.9)" : "rgba(111,227,255,0.8)";
      g.lineWidth = 1;
      g.beginPath();
      for (const [a, b] of BONES) {
        g.moveTo(lm[a].x * c.width, lm[a].y * c.height);
        g.lineTo(lm[b].x * c.width, lm[b].y * c.height);
      }
      g.stroke();
      g.fillStyle = "#fff";
      for (const i of [4, 8]) g.fillRect(lm[i].x * c.width - 1.5, lm[i].y * c.height - 1.5, 3, 3);
    });
  });
  if (tracking === "off") return null;
  return <canvas ref={ref} width={120} height={90} className="opacity-80" aria-hidden />;
}
