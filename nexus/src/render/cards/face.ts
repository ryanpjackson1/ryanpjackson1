"use client";
import { MODULES, type ModuleId } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";

/**
 * Card faces are drawn into a 2D canvas that the card's shader samples.
 * The SAME canvas is what the Phase 7 dissolve rasterises — so the
 * particles that leave a card are exactly what the card showed, live data
 * included.
 */
export const FACE_W = 512;
export const FACE_H = 648;

const MONO = '500 15px "JetBrains Mono", ui-monospace, Menlo, monospace';

export function createFaceCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = FACE_W;
  c.height = FACE_H;
  return c;
}

function age(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

export function drawCardFace(canvas: HTMLCanvasElement, id: ModuleId, p: ModulePayload | undefined) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const meta = MODULES[id];
  const accent = `hsl(${meta.hue} 85% 68%)`;
  const W = FACE_W, H = FACE_H, M = 40;

  // Transparent background: the glass is the shader's job. Alpha here = ink.
  ctx.clearRect(0, 0, W, H);

  // Header: code + live dot
  ctx.font = MONO;
  ctx.fillStyle = "rgba(170,190,230,0.75)";
  ctx.textBaseline = "top";
  ctx.fillText(meta.code, M, M);
  const status = p?.status ?? "stale";
  const dot = status === "live" ? "#7dffc4" : status === "error" || p?.warning ? "#ff8a3d" : "rgba(170,190,230,0.6)";
  ctx.fillStyle = dot;
  ctx.beginPath();
  ctx.arc(W - M - 5, M + 8, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(170,190,230,0.75)";
  const st = status.toUpperCase();
  ctx.fillText(st, W - M - 16 - ctx.measureText(st).width, M);

  // Title
  ctx.fillStyle = "#eef4ff";
  ctx.font = '600 46px "Inter", ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(meta.label, M, M + 44);

  // Accent rule
  ctx.fillStyle = accent;
  ctx.fillRect(M, M + 108, 56, 3);

  // Headline
  ctx.font = MONO;
  ctx.fillStyle = "rgba(170,190,230,0.75)";
  ctx.fillText(fitText(ctx, (p?.headline.label ?? "Connecting").toUpperCase(), W - 2 * M), M, M + 136);
  ctx.fillStyle = "#ffffff";
  ctx.font = '600 72px "Inter", ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(fitText(ctx, p?.headline.value ?? "···", W - 2 * M), M, M + 160);
  if (p?.headline.delta !== undefined) {
    const d = p.headline.delta;
    ctx.font = '500 22px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = d >= 0 ? "#8fe9ff" : "#b59cff";
    ctx.fillText(`${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(2)}%`, M, M + 244);
  }

  // Sparkline — accent stream
  const s = p?.series;
  const sy = 330, sh = 110;
  if (s && s.length > 1) {
    let lo = Infinity, hi = -Infinity;
    for (const v of s) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1;
    ctx.beginPath();
    s.forEach((v, i) => {
      const x = M + (i / (s.length - 1)) * (W - 2 * M);
      const y = sy + sh - ((v - lo) / span) * sh;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.stroke();
    // fill
    ctx.lineTo(W - M, sy + sh);
    ctx.lineTo(M, sy + sh);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, sy, 0, sy + sh);
    g.addColorStop(0, `hsla(${meta.hue} 85% 68% / 0.28)`);
    g.addColorStop(1, `hsla(${meta.hue} 85% 68% / 0)`);
    ctx.fillStyle = g;
    ctx.fill();
  } else {
    // baseline ticks — Teenage Engineering ruler
    ctx.fillStyle = `hsla(${meta.hue} 85% 68% / 0.5)`;
    for (let i = 0; i <= 24; i++) {
      const x = M + (i / 24) * (W - 2 * M);
      ctx.fillRect(x, sy + sh - (i % 6 === 0 ? 18 : 8), 2, i % 6 === 0 ? 18 : 8);
    }
  }

  // Metrics grid (3)
  const metrics = p?.metrics.slice(0, 3) ?? [];
  const my = 476;
  const colW = (W - 2 * M) / 3;
  metrics.forEach((m, i) => {
    const x = M + i * colW;
    ctx.font = '500 13px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = "rgba(170,190,230,0.7)";
    ctx.fillText(fitText(ctx, m.label.toUpperCase(), colW - 12), x, my);
    ctx.font = '600 27px "Inter", ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = m.warn ? "#ff8a3d" : "#e8f0ff";
    ctx.fillText(fitText(ctx, m.value, colW - 12), x, my + 22);
  });

  // Footer: provenance + age
  ctx.fillStyle = "rgba(160,196,255,0.16)";
  ctx.fillRect(M, H - M - 34, W - 2 * M, 1);
  ctx.font = '500 13px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = "rgba(170,190,230,0.6)";
  const src = p ? p.source : "awaiting feed";
  ctx.fillText(fitText(ctx, src.toUpperCase(), W - 2 * M - 70), M, H - M - 20);
  if (p) {
    const a = age(p.fetchedAt);
    ctx.fillText(a, W - M - ctx.measureText(a).width, H - M - 20);
  }
}
