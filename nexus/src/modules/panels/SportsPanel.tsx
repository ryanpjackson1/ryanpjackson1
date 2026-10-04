"use client";
import { motion } from "framer-motion";
import { accentCss } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import { fmSpring } from "@/core/motion";
import type { Game, LeagueBoard, SportsDetail } from "../types";
import { fmtDay, fmtTime, fmtUntil } from "../format";
import { DIM, Empty, Ext, HAIRLINE, MetricGrid, PanelFrame, PULSE, Section, STAGGER, useNow } from "./kit";

export default function SportsPanel({ payload }: { payload: ModulePayload }) {
  const d = payload.detail as SportsDetail | undefined;
  return (
    <PanelFrame payload={payload}>
      {d && (
        <div className="nx-scroll max-h-[68vh] overflow-y-auto pr-1">
          <MetricGrid metrics={payload.metrics} />
          {d.leagues.map((l) => <League key={l.path} l={l} />)}
        </div>
      )}
    </PanelFrame>
  );
}

function StatePill({ g, now }: { g: Game; now: number }) {
  if (g.state === "in") {
    const c = accentCss("sports");
    return (
      <span className="label inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5" style={{ borderColor: c, color: c }}>
        <motion.span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: c }}
          animate={{ opacity: [1, 0.25, 1] }}
          transition={PULSE}
        />
        live
      </span>
    );
  }
  if (g.state === "post") return <span className="label rounded-full border px-2 py-0.5" style={{ borderColor: HAIRLINE }}>final</span>;
  return <span className="label tnum rounded-full border px-2 py-0.5 text-holo" style={{ borderColor: HAIRLINE }}>{fmtUntil(new Date(g.date).getTime(), now)}</span>;
}

function TeamLine({ t, show, dimmed }: { t: Game["home"]; show: boolean; dimmed: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {t.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.logo} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate text-[13px]" style={{ color: dimmed ? DIM : "var(--color-ink)" }}>{t.name}</span>
      </div>
      {show && <span className="tnum font-mono text-[15px]" style={{ color: dimmed ? DIM : "var(--color-holo-hi)" }}>{t.score ?? "0"}</span>}
    </div>
  );
}

function GameRow({ g, i, now }: { g: Game; i: number; now: number }) {
  const scored = g.state !== "pre";
  const loserDim = g.state === "post";
  const body = (
    <motion.div
      className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border px-3 py-2"
      style={{ borderColor: g.state === "in" ? accentCss("sports", 0.35) : HAIRLINE }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...fmSpring("reporting"), delay: i * STAGGER }}
    >
      <div className="min-w-0 space-y-1">
        <TeamLine t={g.away} show={scored} dimmed={loserDim && g.away.winner === false} />
        <TeamLine t={g.home} show={scored} dimmed={loserDim && g.home.winner === false} />
      </div>
      <div className="flex flex-col items-end gap-1 text-right">
        <StatePill g={g} now={now} />
        <span className="tnum text-[11px] text-dim">{g.state === "pre" ? `${fmtDay(g.date)} · ${fmtTime(g.date)}` : g.status}</span>
        {g.broadcast && g.state !== "post" && <span className="text-[10px] text-faint">{g.broadcast}</span>}
      </div>
    </motion.div>
  );
  return g.url ? <Ext href={g.url} className="block">{body}</Ext> : body;
}

function League({ l }: { l: LeagueBoard }) {
  const now = useNow(30_000);
  const live = l.games.filter((g) => g.state === "in");
  const upcoming = l.games.filter((g) => g.state === "pre").slice(0, 6);
  const results = l.games.filter((g) => g.state === "post").slice(0, 4);
  const shown = [...live, ...upcoming, ...results];
  return (
    <Section title={l.name} right={live.length ? `${live.length} live` : `${upcoming.length} upcoming`}>
      {l.error ? (
        <p className="text-[12px]" style={{ color: "var(--color-warn)" }}>Scoreboard unavailable: {l.error}</p>
      ) : shown.length ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {shown.map((g, i) => <GameRow key={g.id} g={g} i={i} now={now} />)}
        </div>
      ) : (
        <Empty>No games in the next week.</Empty>
      )}

      {l.standings.length > 0 ? (
        <div className={`mt-4 grid grid-cols-1 gap-4 ${l.standings.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {l.standings.map((s) => (
            <div key={s.group}>
              <div className="label mb-1.5">{s.group}</div>
              <table className="tnum w-full text-[12px]">
                <thead>
                  <tr className="label text-left">
                    <th className="w-6 pb-1 font-normal">#</th>
                    <th className="pb-1 font-normal">Team</th>
                    <th className="pb-1 text-right font-normal">P</th>
                    <th className="pb-1 text-right font-normal">W-L{s.rows.some((r) => r.draws !== undefined) ? "-D" : ""}</th>
                    {s.rows.some((r) => r.extra) && <th className="pb-1 text-right font-normal">{s.rows.find((r) => r.extraLabel)?.extraLabel}</th>}
                    {s.rows.some((r) => r.points !== undefined) && <th className="pb-1 text-right font-normal">Pts</th>}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={r.team} className="border-t" style={{ borderColor: "rgba(143,184,255,0.06)" }}>
                      <td className="py-1 text-dim">{r.rank}</td>
                      <td className="max-w-[140px] truncate py-1">{r.team}</td>
                      <td className="py-1 text-right text-dim">{r.played ?? (r.wins ?? 0) + (r.losses ?? 0) + (r.draws ?? 0)}</td>
                      <td className="py-1 text-right">{r.wins ?? "—"}-{r.losses ?? "—"}{r.draws !== undefined ? `-${r.draws}` : ""}</td>
                      {s.rows.some((x) => x.extra) && <td className="py-1 text-right text-dim">{r.extra ?? "—"}</td>}
                      {s.rows.some((x) => x.points !== undefined) && <td className="py-1 text-right text-holo-hi">{r.points ?? "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        l.standingsError && <p className="mt-3 text-[11px] text-faint">Standings: {l.standingsError}</p>
      )}
    </Section>
  );
}
