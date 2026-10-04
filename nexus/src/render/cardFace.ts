import { MODULES, type ModuleId } from "@/modules/registry";
import { DEMO } from "@/modules/demo";

/**
 * Card faces are drawn once into a canvas and sampled by the glass shader.
 * Fonts are system fonts (Segoe UI on Windows) so nothing has to download.
 */
export const FACE_W = 512;
export const FACE_H = 656;
const SANS = '"Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
const MONO = '"Cascadia Mono", Consolas, "SF Mono", Menlo, monospace';

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

export function drawCardFace(canvas: HTMLCanvasElement, id: ModuleId) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const m = MODULES[id];
  const demo = DEMO[id];
  const W = FACE_W, H = FACE_H, P = 40;
  const accent = `hsl(${m.hue} 80% 70%)`;
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = "top";

  ctx.font = `500 16px ${MONO}`;
  ctx.fillStyle = "rgba(180,200,235,0.8)";
  ctx.fillText(m.code, P, P);
  // DEMO tag — the card never pretends to be live
  ctx.font = `600 14px ${MONO}`;
  const tag = "DEMO DATA";
  const tw = ctx.measureText(tag).width + 18;
  ctx.strokeStyle = "rgba(180,200,235,0.55)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(W - P - tw, P - 4, tw, 26);
  ctx.fillStyle = "rgba(200,215,240,0.9)";
  ctx.fillText(tag, W - P - tw + 9, P + 1);

  ctx.font = `600 50px ${SANS}`;
  ctx.fillStyle = "#f2f6ff";
  ctx.fillText(m.label, P, P + 46);
  ctx.fillStyle = accent;
  ctx.fillRect(P, P + 116, 54, 3);

  ctx.font = `500 15px ${MONO}`;
  ctx.fillStyle = "rgba(180,200,235,0.75)";
  ctx.fillText(fit(ctx, demo.headline.label.toUpperCase(), W - 2 * P), P, P + 146);
  ctx.font = `600 44px ${SANS}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(fit(ctx, demo.headline.value, W - 2 * P), P, P + 172);

  // sparkline
  const s = demo.series;
  const sy = 300, sh = 120;
  const lo = Math.min(...s), hi = Math.max(...s), span = hi - lo || 1;
  ctx.beginPath();
  s.forEach((v, i) => {
    const x = P + (i / (s.length - 1)) * (W - 2 * P);
    const y = sy + sh - ((v - lo) / span) * sh;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.stroke();

  // metrics
  const colW = (W - 2 * P) / 3;
  demo.metrics.slice(0, 3).forEach((mt, i) => {
    const x = P + i * colW;
    ctx.font = `500 13px ${MONO}`;
    ctx.fillStyle = "rgba(180,200,235,0.7)";
    ctx.fillText(fit(ctx, mt.label.toUpperCase(), colW - 10), x, 470);
    ctx.font = `600 26px ${SANS}`;
    ctx.fillStyle = "#e9f0ff";
    ctx.fillText(fit(ctx, mt.value, colW - 10), x, 492);
  });

  ctx.fillStyle = "rgba(160,190,255,0.18)";
  ctx.fillRect(P, H - P - 36, W - 2 * P, 1);
  ctx.font = `500 13px ${MONO}`;
  ctx.fillStyle = "rgba(180,200,235,0.65)";
  ctx.fillText("SAMPLE VALUES · NOT CONNECTED", P, H - P - 20);
}
