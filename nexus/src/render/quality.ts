import type { QualityTier } from "@/state/types";

/**
 * Adaptive quality. The pixel ratio is ALWAYS capped — a 4K laptop at 200%
 * scaling would otherwise render 4× the pixels for no visible gain.
 */
export const DPR_CAP: Record<QualityTier, number> = { 0: 1, 1: 1.25, 2: 1.5 };

export function pixelRatio(tier: QualityTier, devicePixelRatio: number): number {
  return Math.max(0.75, Math.min(devicePixelRatio || 1, DPR_CAP[tier]));
}

/** Starting tier from coarse device hints; the runtime monitor refines it. */
export function initialTier(hints: { cores?: number; memoryGB?: number; minSide: number }): QualityTier {
  const cores = hints.cores ?? 4;
  const mem = hints.memoryGB ?? 8;
  if (hints.minSide < 700 || cores <= 4 || mem <= 4) return 0;
  if (cores >= 8 && mem >= 8) return 2;
  return 1;
}

export interface WebGLProbe { ok: boolean; reason?: string }

/** Detects WebGL; `?renderer=2d` forces the 2D fallback (useful for testing). */
export function probeWebGL(doc: Document, search: string): WebGLProbe {
  if (new URLSearchParams(search).get("renderer") === "2d") return { ok: false, reason: "2D view requested (?renderer=2d)" };
  try {
    const c = doc.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return { ok: false, reason: "WebGL is unavailable (disabled, blocked, or no GPU driver support)" };
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `WebGL failed to start: ${(e as Error).message}` };
  }
}
