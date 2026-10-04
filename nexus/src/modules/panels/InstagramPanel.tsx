"use client";
import { motion } from "framer-motion";
import { accentCss } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import { fmSpring } from "@/core/motion";
import type { InstagramDetail, InstagramMedia } from "../types";
import { fmtAgo, fmtCompact, fmtNum, localDate } from "../format";
import { Empty, Ext, HBar, LineChart, MetricGrid, PanelFrame, Section, STAGGER } from "./kit";

const engagement = (m: InstagramMedia) => (m.likes ?? 0) + (m.comments ?? 0);
const isReel = (m: InstagramMedia) => m.productType === "REELS" || m.mediaType === "VIDEO" || m.mediaType === "REELS";

function Thumb({ m, className = "" }: { m: InstagramMedia; className?: string }) {
  return m.thumbnail ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.thumbnail} alt={m.caption.slice(0, 80) || "Instagram post"} loading="lazy" referrerPolicy="no-referrer" className={`h-full w-full object-cover ${className}`} />
  ) : (
    <div className={`flex h-full w-full items-center justify-center text-[10px] text-dim ${className}`} style={{ background: accentCss("instagram", 0.12) }}>
      {m.mediaType}
    </div>
  );
}

export default function InstagramPanel({ payload }: { payload: ModulePayload }) {
  const d = payload.detail as InstagramDetail | undefined;
  return (
    <PanelFrame
      payload={payload}
      aside={d && <Ext href={d.profileUrl} className="label text-holo">@{d.username} ↗</Ext>}
    >
      {d && <InstagramBody d={d} payload={payload} />}
    </PanelFrame>
  );
}

function InstagramBody({ d, payload }: { d: InstagramDetail; payload: ModulePayload }) {
  const hist = d.followerHistory;
  const reels = d.media.filter(isReel).slice(0, 8);
  const top = [...d.media].sort((a, b) => engagement(b) - engagement(a)).slice(0, 5);
  const topMax = Math.max(1, ...top.map(engagement));
  const fmtDate = (iso: string) => localDate(iso).toLocaleDateString([], { day: "numeric", month: "short" });

  return (
    <div className="nx-scroll max-h-[68vh] overflow-y-auto pr-1">
      <MetricGrid metrics={payload.metrics} />

      <Section
        title="Followers · reconstructed"
        right={hist.length ? `${fmtNum(hist[0].total)} → ${fmtNum(hist[hist.length - 1].total)}` : undefined}
      >
        {hist.length >= 2 ? (
          <LineChart id="instagram" values={hist.map((h) => h.total)} labels={[fmtDate(hist[0].date), fmtDate(hist[hist.length - 1].date)]} />
        ) : (
          <Empty>Instagram returned no daily follower insights (needs a professional account with ≥100 followers and the insights permission).</Empty>
        )}
      </Section>

      <Section title="Reels" right={`${reels.length} recent`}>
        {reels.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {reels.map((m, i) => (
              <motion.a
                key={m.id}
                href={m.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-[9/16] overflow-hidden rounded-md border"
                style={{ borderColor: "rgba(143,184,255,0.14)" }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...fmSpring("reporting"), delay: i * STAGGER }}
                title={m.caption}
              >
                <Thumb m={m} className="transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <div className="tnum font-mono text-[11px] text-ink">
                    {m.plays !== undefined ? `▶ ${fmtCompact(m.plays)}` : `♥ ${fmtCompact(m.likes)}`}
                  </div>
                  <div className="text-[10px] text-dim">{fmtAgo(new Date(m.timestamp).getTime())}</div>
                </div>
              </motion.a>
            ))}
          </div>
        ) : (
          <Empty>No reels in the {d.media.length} most recent posts.</Empty>
        )}
      </Section>

      <Section title="Top content · engagement">
        {top.length ? (
          <ul className="space-y-3">
            {top.map((m, i) => (
              <li key={m.id}>
                <Ext href={m.permalink} className="flex items-center gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded">
                    <Thumb m={m} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">{m.caption || "(no caption)"}</div>
                    <div className="mt-1.5">
                      <HBar value={engagement(m) / topMax} color={accentCss("instagram")} delay={i * STAGGER} />
                    </div>
                  </div>
                  <div className="tnum shrink-0 text-right font-mono text-[11px] text-dim">
                    <div className="text-ink">♥ {fmtCompact(m.likes)} · ✎ {fmtCompact(m.comments)}</div>
                    <div>
                      {d.followers ? `${((engagement(m) / d.followers) * 100).toFixed(2)}%` : "—"}
                      {m.reach !== undefined ? ` · reach ${fmtCompact(m.reach)}` : ""}
                    </div>
                  </div>
                </Ext>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No posts yet.</Empty>
        )}
      </Section>
    </div>
  );
}
