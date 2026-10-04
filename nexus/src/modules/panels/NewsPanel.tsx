"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { accentCss } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import { fmSpring } from "@/core/motion";
import type { Article, NewsDetail } from "../types";
import { fmtAgo } from "../format";
import { Empty, Ext, HAIRLINE, PanelFrame, Section, useNow } from "./kit";

/** Horizontal travel (px) or flick speed (px/s) that commits a swipe. */
const SWIPE_DISTANCE = 90;
const SWIPE_VELOCITY = 480;
/** How many cards peek behind the top one. */
const STACK_DEPTH = 3;
const STACK_OFFSET_Y = 10;
const STACK_SCALE_STEP = 0.04;
const STACK_FADE_STEP = 0.25;

export default function NewsPanel({ payload }: { payload: ModulePayload }) {
  const d = payload.detail as NewsDetail | undefined;
  return <PanelFrame payload={payload}>{d && <NewsBody d={d} />}</PanelFrame>;
}

function NewsBody({ d }: { d: NewsDetail }) {
  const tabs = useMemo(
    () =>
      [
        { key: "front", label: "Front page", articles: d.front },
        { key: "ai", label: "AI", articles: d.ai },
        ...d.rss.map((f) => ({ key: `rss:${f.url}`, label: f.name, articles: f.articles, error: f.error })),
      ] as { key: string; label: string; articles: Article[]; error?: string }[],
    [d],
  );
  const [tab, setTab] = useState(tabs[0].key);
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === current.key}
            onClick={() => setTab(t.key)}
            className="label rounded-full border px-3 py-1 transition-colors"
            style={{
              borderColor: t.key === current.key ? accentCss("news", 0.6) : HAIRLINE,
              color: t.key === current.key ? accentCss("news") : undefined,
              background: t.key === current.key ? accentCss("news", 0.08) : undefined,
            }}
          >
            {t.label} <span className="tnum opacity-60">{t.articles.length}</span>
          </button>
        ))}
      </div>
      {current.error && <p className="mb-3 text-[12px]" style={{ color: "var(--color-warn)" }}>Feed failed: {current.error}</p>}
      {current.articles.length ? <Stack key={current.key} articles={current.articles} /> : <Empty>No stories in this feed right now.</Empty>}
      <Section title="Also on the list">
        <ol className="nx-scroll max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
          {current.articles.slice(0, 15).map((a, i) => (
            <li key={a.id} className="flex gap-3 text-[13px]">
              <span className="tnum w-5 shrink-0 text-right font-mono text-[11px] text-faint">{i + 1}</span>
              <Ext href={a.url} className="min-w-0 flex-1 truncate">{a.title}</Ext>
              <span className="shrink-0 text-[11px] text-dim">{a.source}</span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

function Stack({ articles }: { articles: Article[] }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const dragged = useRef(false);
  const now = useNow(30_000);
  const n = articles.length;

  const go = useCallback(
    (step: 1 | -1) => {
      setDir(step);
      setIndex((i) => (i + step + n) % n);
    },
    [n],
  );

  // Keyboard ←/→ while the panel is mounted (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) go(1);
    else if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) go(-1);
    // Let the click that ends a drag be swallowed.
    window.setTimeout(() => { dragged.current = false; }, 0);
  };

  const behind = Array.from({ length: Math.min(STACK_DEPTH, n - 1) }, (_, k) => articles[(index + k + 1) % n]);
  const a = articles[index];

  return (
    <div>
      <div className="relative h-[210px] select-none">
        {behind
          .map((b, k) => (
            <motion.div
              key={`behind-${b.id}`}
              className="absolute inset-0 rounded-xl border"
              style={{ borderColor: HAIRLINE, background: "rgba(14,22,40,0.55)" }}
              initial={false}
              animate={{ y: (k + 1) * STACK_OFFSET_Y, scale: 1 - (k + 1) * STACK_SCALE_STEP, opacity: 1 - (k + 1) * STACK_FADE_STEP }}
              transition={fmSpring("following")}
            />
          ))
          .reverse()}
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.article
            key={a.id}
            custom={dir}
            className="absolute inset-0 flex cursor-grab flex-col rounded-xl border p-5 active:cursor-grabbing"
            style={{ borderColor: accentCss("news", 0.35), background: "linear-gradient(180deg, rgba(214,230,255,0.06), transparent 50%), rgba(14,22,40,0.85)" }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragStart={() => { dragged.current = true; }}
            onDragEnd={onDragEnd}
            variants={{
              enter: (d: 1 | -1) => ({ x: d * 120, opacity: 0, rotate: d * 2 }),
              center: { x: 0, opacity: 1, rotate: 0 },
              exit: (d: 1 | -1) => ({ x: d * -260, opacity: 0, rotate: d * -4 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={fmSpring("arriving")}
          >
            <div className="label flex items-center justify-between">
              <span style={{ color: accentCss("news") }}>{a.source || a.feedName}</span>
              <span className="tnum">{a.time ? fmtAgo(a.time, now) : ""}</span>
            </div>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { if (dragged.current) e.preventDefault(); }}
              draggable={false}
              className="mt-3 line-clamp-3 text-[22px] font-light leading-snug text-holo-hi hover:underline"
            >
              {a.title}
            </a>
            <div className="mt-auto flex items-center justify-between pt-3 text-[12px] text-dim">
              <span className="tnum font-mono">
                {a.points !== undefined && `▲ ${a.points}`}
                {a.comments !== undefined && ` · ${a.comments} comments`}
                {a.author && ` · ${a.author}`}
              </span>
              <span className="flex gap-3">
                {a.discussionUrl && a.discussionUrl !== a.url && <Ext href={a.discussionUrl} className="label text-holo">Thread ↗</Ext>}
                <Ext href={a.url} className="label text-holo">Open ↗</Ext>
              </span>
            </div>
          </motion.article>
        </AnimatePresence>
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={() => go(-1)} className="label rounded border px-3 py-1 hover:text-holo-hi" style={{ borderColor: HAIRLINE }} aria-label="Previous story">
          ← Prev
        </button>
        <span className="tnum label">{index + 1} / {n} · swipe or ←/→</span>
        <button type="button" onClick={() => go(1)} className="label rounded border px-3 py-1 hover:text-holo-hi" style={{ borderColor: HAIRLINE }} aria-label="Next story">
          Next →
        </button>
      </div>
    </div>
  );
}
