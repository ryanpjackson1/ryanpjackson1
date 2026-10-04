"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { accentCss } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import { fmSpring } from "@/core/motion";
import type { Project, ProjectsDetail } from "../types";
import { fmtAgo, fmtCompact } from "../format";
import { Empty, Ext, HAIRLINE, MetricGrid, PanelFrame, Section, STAGGER } from "./kit";

export default function ProjectsPanel({ payload }: { payload: ModulePayload }) {
  const d = payload.detail as ProjectsDetail | undefined;
  return (
    <PanelFrame payload={payload} aside={d && <Ext href={d.profileUrl} className="label text-holo">github/{d.user} ↗</Ext>}>
      {d && (
        <div className="nx-scroll max-h-[68vh] overflow-y-auto pr-1">
          <MetricGrid metrics={payload.metrics} />
          <Section title="Project worlds" right={`${d.projects.filter((p) => p.active).length} active · 30d`}>
            {d.projects.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {d.projects.map((p, i) => <ProjectCard key={p.name} p={p} index={i} />)}
              </div>
            ) : (
              <Empty>No repositories yet.</Empty>
            )}
            {d.manifest === "missing" && (
              <p className="mt-4 text-[12px] leading-relaxed text-dim">
                Add <code className="font-mono text-holo">nexus.projects.json</code> at the project root to attach videos, images and prompt
                history to each repo — schema documented in <code className="font-mono">src/modules/server/projects.ts</code>.
              </p>
            )}
          </Section>
        </div>
      )}
    </PanelFrame>
  );
}

function Media({ p }: { p: Project }) {
  const video = p.media.videos[0];
  const image = p.media.images[0];
  if (video) {
    return <video src={video} poster={image} muted loop autoPlay playsInline preload="metadata" className="h-full w-full object-cover" />;
  }
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={`${p.name} preview`} loading="lazy" className="h-full w-full object-cover" />;
  }
  // No media: a typographic "world" seeded from the repo name.
  const seed = [...p.name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return (
    <div
      className="flex h-full w-full items-end p-3"
      style={{
        background: `radial-gradient(120% 90% at ${20 + (seed % 60)}% ${10 + (seed % 40)}%, ${accentCss("projects", 0.35)}, transparent 60%), linear-gradient(160deg, rgba(14,22,40,0.9), rgba(3,5,10,0.9))`,
      }}
    >
      <span className="font-mono text-[28px] font-light uppercase tracking-[0.2em] text-holo-hi/70">{p.name.slice(0, 2)}</span>
    </div>
  );
}

function ProjectCard({ p, index }: { p: Project; index: number }) {
  const [open, setOpen] = useState(false);
  const prompts = open ? p.prompts : p.prompts.slice(0, 2);
  return (
    <motion.article
      className="flex flex-col overflow-hidden rounded-lg border"
      style={{ borderColor: p.active ? accentCss("projects", 0.35) : HAIRLINE, background: "rgba(14,22,40,0.35)" }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...fmSpring("arriving"), delay: index * STAGGER * 2 }}
    >
      <div className="relative aspect-video overflow-hidden border-b" style={{ borderColor: HAIRLINE }}>
        <Media p={p} />
        {p.active && (
          <span className="label absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5" style={{ color: accentCss("projects") }}>
            active
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="truncate font-mono text-[14px] text-ink">{p.name}</h4>
          <span className="tnum shrink-0 font-mono text-[11px] text-dim">★ {fmtCompact(p.stars)}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-dim">{p.description || "No description."}</p>
        <div className="label mt-2 flex flex-wrap gap-x-3 gap-y-1 normal-case tracking-[0.06em]">
          {p.language && <span>{p.language}</span>}
          {p.pushedAt && <span>pushed {fmtAgo(new Date(p.pushedAt).getTime())}</span>}
          {p.archived && <span>archived</span>}
          {p.fork && <span>fork</span>}
        </div>
        {p.topics.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {p.topics.slice(0, 5).map((t) => (
              <span key={t} className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-dim" style={{ borderColor: HAIRLINE }}>{t}</span>
            ))}
          </div>
        )}

        {p.prompts.length > 0 && (
          <div className="mt-3 border-t pt-2" style={{ borderColor: HAIRLINE }}>
            <div className="label mb-2">Prompt history · {p.prompts.length}</div>
            <ol className="relative ml-1 space-y-2 border-l pl-3" style={{ borderColor: accentCss("projects", 0.3) }}>
              {prompts.map((pr, i) => (
                <li key={`${pr.at}-${i}`} className="relative">
                  <span className="absolute -left-[16.5px] top-1.5 h-2 w-2 rounded-full" style={{ background: accentCss("projects") }} />
                  <div className="tnum font-mono text-[10px] text-faint">{pr.at ? new Date(pr.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "undated"}</div>
                  <p className={`text-[12px] leading-snug text-ink/90 ${open ? "" : "line-clamp-2"}`}>{pr.text}</p>
                </li>
              ))}
            </ol>
            {p.prompts.length > 2 && (
              <button type="button" onClick={() => setOpen((o) => !o)} className="label mt-2 text-holo hover:text-holo-hi">
                {open ? "Show less" : `Show all ${p.prompts.length}`}
              </button>
            )}
          </div>
        )}

        <div className="mt-auto flex gap-3 pt-3">
          {p.url && <Ext href={p.url} className="label text-holo">GitHub ↗</Ext>}
          {p.homepage && <Ext href={p.homepage} className="label text-holo">Live ↗</Ext>}
        </div>
      </div>
    </motion.article>
  );
}
