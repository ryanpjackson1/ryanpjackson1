"use client";
import { motion } from "framer-motion";
import { accentCss } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import { fmSpring } from "@/core/motion";
import type { CalendarDetail, CalendarEvent } from "../types";
import { dayKey, fmtTime, fmtUntil, localDate } from "../format";
import { Empty, HAIRLINE, MetricGrid, PanelFrame, Section, STAGGER, useNow } from "./kit";

const HOUR_PX = 44;
/** Opacity of events that already ended today. */
const PAST_OPACITY = 0.45;

/** Day keys (local) an event touches. All-day events use their own date key. */
function daysOf(e: CalendarEvent): string[] {
  const start = e.allDay && e.date ? localDate(e.date) : new Date(e.start);
  const end = new Date(e.end);
  const out: string[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  do {
    out.push(dayKey(d));
    d.setDate(d.getDate() + 1);
  } while (d.getTime() < end.getTime() - (e.allDay ? 1 : 0) && out.length < 14);
  return out;
}

export default function CalendarPanel({ payload }: { payload: ModulePayload }) {
  const d = payload.detail as CalendarDetail | undefined;
  return (
    <PanelFrame payload={payload} aside={d?.calendarName && <span className="label">{d.calendarName}</span>}>
      {d && <CalendarBody d={d} payload={payload} />}
    </PanelFrame>
  );
}

function CalendarBody({ d, payload }: { d: CalendarDetail; payload: ModulePayload }) {
  const now = useNow(30_000);
  const today = new Date(now);
  const todayKey = dayKey(today);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of d.events) for (const k of daysOf(e)) byDay.set(k, [...(byDay.get(k) ?? []), e]);

  const todays = byDay.get(todayKey) ?? [];
  const allDay = todays.filter((e) => e.allDay);
  const timed = todays.filter((e) => !e.allDay);

  // Timeline window: at least 08:00–20:00, stretched to fit today's events and now.
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const hourOf = (t: number) => (t - dayStart) / 3_600_000;
  const startH = Math.max(0, Math.floor(Math.min(8, hourOf(now), ...timed.map((e) => hourOf(Math.max(+new Date(e.start), dayStart))))));
  const endH = Math.min(24, Math.ceil(Math.max(20, hourOf(now) + 1, ...timed.map((e) => hourOf(+new Date(e.end))))));
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);

  const week = Array.from({ length: 8 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)).slice(1);

  return (
    <div className="nx-scroll max-h-[68vh] overflow-y-auto pr-1">
      <MetricGrid metrics={payload.metrics} />

      <Section title={`Today · ${today.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}`} right={`${todays.length} events`}>
        {allDay.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {allDay.map((e) => (
              <span key={e.id} className="rounded border px-2 py-1 text-[12px]" style={{ borderColor: accentCss("calendar", 0.4), background: accentCss("calendar", 0.08) }}>
                {e.summary}
              </span>
            ))}
          </div>
        )}
        {timed.length === 0 && allDay.length === 0 ? (
          <Empty>Nothing scheduled today.</Empty>
        ) : (
          <div className="relative" style={{ height: (endH - startH) * HOUR_PX }}>
            {hours.map((h) => (
              <div key={h} className="absolute inset-x-0 flex items-start gap-3" style={{ top: (h - startH) * HOUR_PX }}>
                <span className="tnum w-10 -translate-y-1.5 text-right font-mono text-[10px] text-faint">{String(h).padStart(2, "0")}:00</span>
                <div className="flex-1 border-t" style={{ borderColor: HAIRLINE }} />
              </div>
            ))}
            {timed.map((e, i) => {
              const s = Math.max(hourOf(+new Date(e.start)), startH);
              const en = Math.min(hourOf(+new Date(e.end)), endH);
              const past = +new Date(e.end) < now;
              const current = +new Date(e.start) <= now && +new Date(e.end) > now;
              return (
                <motion.div
                  key={e.id}
                  className="absolute left-[52px] right-0 overflow-hidden rounded-md border px-2.5 py-1"
                  style={{
                    top: (s - startH) * HOUR_PX + 1,
                    height: Math.max(22, (en - s) * HOUR_PX - 2),
                    borderColor: accentCss("calendar", current ? 0.8 : 0.35),
                    background: accentCss("calendar", current ? 0.2 : 0.09),
                    originX: 0,
                  }}
                  initial={{ opacity: 0, scaleX: 0.92 }}
                  animate={{ opacity: past ? PAST_OPACITY : 1, scaleX: 1 }}
                  transition={{ ...fmSpring("reporting"), delay: i * STAGGER }}
                >
                  <div className="truncate text-[12px] text-ink">{e.summary}</div>
                  <div className="tnum truncate text-[10px] text-dim">
                    {fmtTime(e.start)}–{fmtTime(e.end)}{e.location ? ` · ${e.location}` : ""}
                  </div>
                </motion.div>
              );
            })}
            {hourOf(now) >= startH && hourOf(now) <= endH && (
              <div className="pointer-events-none absolute left-[44px] right-0 flex items-center" style={{ top: (hourOf(now) - startH) * HOUR_PX }}>
                <span className="h-2 w-2 -translate-x-1 rounded-full bg-holo-hi" />
                <div className="h-px flex-1 bg-holo-hi/70" />
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Next 7 days">
        <ul className="space-y-4">
          {week.map((day, di) => {
            const k = dayKey(day);
            const evs = byDay.get(k) ?? [];
            return (
              <motion.li
                key={k}
                className="grid grid-cols-[88px_1fr] gap-3"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...fmSpring("reporting"), delay: di * STAGGER }}
              >
                <div>
                  <div className="label">{day.toLocaleDateString([], { weekday: "short" })}</div>
                  <div className="tnum text-[13px] text-dim">{day.toLocaleDateString([], { day: "numeric", month: "short" })}</div>
                </div>
                {evs.length ? (
                  <ul className="space-y-1.5">
                    {evs.map((e) => (
                      <li key={e.id} className="flex items-baseline gap-3 text-[13px]">
                        <span className="tnum w-12 shrink-0 font-mono text-[11px] text-holo">{e.allDay ? "all day" : fmtTime(e.start)}</span>
                        <span className="min-w-0 flex-1 truncate">{e.summary}</span>
                        {e.location && <span className="hidden max-w-[180px] truncate text-[11px] text-dim sm:block">{e.location}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-[12px] text-faint">—</span>
                )}
              </motion.li>
            );
          })}
        </ul>
        {d.next && (
          <p className="mt-4 text-[12px] text-dim">
            Next up: <span className="text-ink">{d.next.summary}</span> {fmtUntil(new Date(d.next.start).getTime(), now)}
          </p>
        )}
      </Section>
    </div>
  );
}
