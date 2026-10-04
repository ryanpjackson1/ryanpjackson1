"use client";
import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { accentCss } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import { fmSpring } from "@/core/motion";
import type { MediaAction } from "@/bridge/verbs";
import type { MusicDetail } from "../types";
import { refreshModule } from "../useModuleData";
import { fmtDuration } from "../format";
import { HAIRLINE, PanelFrame, useNow, WARN } from "./kit";

/** Progress interpolation tick while playing (between 3s polls). */
const PROGRESS_TICK_MS = 250;

async function sendMedia(action: MediaAction): Promise<{ ok: boolean; message: string; fix?: string }> {
  try {
    const res = await fetch("/api/bridge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verb: "media", args: { action } }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; fix?: string } | null;
    return { ok: !!body?.ok && res.ok, message: body?.message ?? `Bridge answered HTTP ${res.status}`, fix: body?.fix };
  } catch {
    return { ok: false, message: "Couldn't reach the desktop bridge.", fix: "Run NEXUS on macOS with NEXUS_BRIDGE=1." };
  }
}

function TransportButton({ label, onClick, children, primary }: { label: string; onClick: () => void; children: ReactNode; primary?: boolean }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      transition={fmSpring("acknowledging")}
      className={`flex items-center justify-center rounded-full border ${primary ? "h-14 w-14" : "h-11 w-11"}`}
      style={{ borderColor: primary ? accentCss("music", 0.7) : HAIRLINE, background: primary ? accentCss("music", 0.12) : "transparent", color: primary ? accentCss("music") : "var(--color-ink)" }}
    >
      {children}
    </motion.button>
  );
}

export default function MusicPanel({ payload }: { payload: ModulePayload }) {
  const d = payload.detail as MusicDetail | undefined;
  return <PanelFrame payload={payload}>{d && <MusicBody d={d} fetchedAt={payload.fetchedAt} />}</PanelFrame>;
}

function MusicBody({ d, fetchedAt }: { d: MusicDetail; fetchedAt: number }) {
  const now = useNow(PROGRESS_TICK_MS);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string; fix?: string } | null>(null);
  const playing = d.state === "playing";
  const elapsed = playing ? (now - fetchedAt) / 1000 : 0;
  const pos = d.duration ? Math.min(d.duration, (d.position ?? 0) + elapsed) : d.position;
  const progress = d.duration && pos !== undefined ? pos / d.duration : 0;

  const act = async (action: MediaAction) => {
    const r = await sendMedia(action);
    setFeedback(r.ok ? null : r);
    void refreshModule("music");
  };

  const Icon = ({ path }: { path: string }) => (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={path} /></svg>
  );

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-[220px_1fr]">
      <motion.div
        className="relative aspect-square overflow-hidden rounded-lg border"
        style={{ borderColor: HAIRLINE, background: accentCss("music", 0.08) }}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: playing ? 1 : 0.97 }}
        transition={fmSpring("arriving")}
      >
        {d.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.artwork} alt={d.album ? `${d.album} artwork` : "Album artwork"} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.2em] text-dim">
            {d.player ?? "No player"}
          </div>
        )}
      </motion.div>

      <div className="flex min-w-0 flex-col justify-between">
        <div className="min-w-0">
          <div className="label" style={{ color: accentCss("music") }}>{d.player ?? "Spotify / Music closed"} · {d.state}</div>
          <div className="mt-2 truncate text-[26px] font-light leading-tight text-holo-hi">{d.track ?? "Nothing playing"}</div>
          {d.artist && <div className="mt-1 truncate text-[15px] text-ink">{d.artist}</div>}
          {d.album && <div className="mt-0.5 truncate text-[13px] text-dim">{d.album}</div>}
        </div>

        {d.track && (
          <div className="mt-6">
            <div className="relative h-1 w-full overflow-hidden rounded-full" style={{ background: "rgba(143,184,255,0.1)" }}>
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: accentCss("music"), originX: 0, width: "100%" }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: progress }}
                transition={fmSpring("reporting")}
              />
            </div>
            <div className="tnum mt-1.5 flex justify-between font-mono text-[11px] text-dim">
              <span>{fmtDuration(pos)}</span>
              <span>−{fmtDuration(d.duration && pos !== undefined ? d.duration - pos : undefined)}</span>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <TransportButton label="Previous track" onClick={() => act("previous")}>
            <Icon path="M6 6h2v12H6zM9.5 12L18 6v12z" />
          </TransportButton>
          <TransportButton label={playing ? "Pause" : "Play"} onClick={() => act("toggle")} primary>
            {playing ? <Icon path="M7 5h4v14H7zM13 5h4v14h-4z" /> : <Icon path="M8 5v14l11-7z" />}
          </TransportButton>
          <TransportButton label="Next track" onClick={() => act("next")}>
            <Icon path="M16 6h2v12h-2zM6 18l8.5-6L6 6z" />
          </TransportButton>
        </div>
        {feedback && (
          <p className="mt-3 text-[12px]" style={{ color: WARN }}>
            {feedback.message}{feedback.fix ? ` — ${feedback.fix}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
