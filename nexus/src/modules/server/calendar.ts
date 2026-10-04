/**
 * Calendar — today plus the next 7 days from any iCal (.ics) feed
 * (NEXUS_CALENDAR_ICS), parsed and expanded by ./ics.
 */
import { emptyPayload, type ModulePayload } from "@/core/payload";
import type { CalendarDetail, CalendarEvent } from "@/modules/types";
import { errorMessage, formatUntil, getText, truncate, UpstreamError } from "./http";
import { expandIcs, parseIcs } from "./ics";

const SOURCE = "iCal feed";
const SETUP_HINT =
  "Set NEXUS_CALENDAR_ICS in .env.local to your calendar's secret iCal address (Google Calendar → Settings → your calendar → Integrate calendar → Secret address in iCal format; Apple iCloud: share calendar publicly and copy the webcal link).";

function hm(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function fetchCalendar(_req: Request): Promise<ModulePayload<CalendarDetail>> {
  const raw = process.env.NEXUS_CALENDAR_ICS?.trim();
  if (!raw) return emptyPayload("calendar", "unconfigured", SOURCE, SETUP_HINT) as ModulePayload<CalendarDetail>;

  const url = raw.replace(/^webcals?:\/\//i, "https://");
  let host = "calendar";
  try {
    host = new URL(url).host;
  } catch {
    return emptyPayload("calendar", "error", SOURCE, `NEXUS_CALENDAR_ICS is not a URL. ${SETUP_HINT}`) as ModulePayload<CalendarDetail>;
  }
  const source = `${SOURCE} · ${host}`;

  let text: string;
  try {
    text = await getText(url, { timeoutMs: 10_000, revalidate: 120 });
  } catch (e) {
    const status = e instanceof UpstreamError ? e.status : undefined;
    const hint =
      status === 404 || status === 401 || status === 403
        ? `${host} refused the iCal URL (${status}). The secret address may have been reset — copy it again from your calendar's settings into NEXUS_CALENDAR_ICS.`
        : `${errorMessage(e)}. Check NEXUS_CALENDAR_ICS in .env.local.`;
    return emptyPayload("calendar", "error", source, hint) as ModulePayload<CalendarDetail>;
  }
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    return emptyPayload("calendar", "error", source, `NEXUS_CALENDAR_ICS returned something that isn't an iCal feed (no BEGIN:VCALENDAR). Use the "iCal format" address, not the calendar's web page. ${SETUP_HINT}`) as ModulePayload<CalendarDetail>;
  }

  const cal = parseIcs(text);
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8);
  const occ = expandIcs(cal.events, rangeStart, rangeEnd);

  const events: CalendarEvent[] = occ.map((o) => ({
    id: `${o.uid}@${o.start.getTime()}`,
    summary: o.summary,
    location: o.location,
    start: o.start.toISOString(),
    end: o.end.toISOString(),
    allDay: o.allDay,
    date: o.date,
    recurring: o.recurring,
  }));

  const t = now.getTime();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const current = events.find((e) => !e.allDay && +new Date(e.start) <= t && +new Date(e.end) > t);
  const next = events.find((e) => !e.allDay && +new Date(e.start) > t);
  const today = events.filter((e) => +new Date(e.start) < tomorrow && +new Date(e.end) > rangeStart.getTime());
  const remainingToday = today.filter((e) => !e.allDay && +new Date(e.start) > t);
  const busyMs = today.filter((e) => !e.allDay).reduce((s, e) => s + (+new Date(e.end) - +new Date(e.start)), 0);

  const headline = current
    ? { label: `Now · ${truncate(current.summary, 28)}`, value: `ends ${formatUntil(+new Date(current.end) - t)}` }
    : next
      ? { label: `Next · ${truncate(next.summary, 28)}`, value: formatUntil(+new Date(next.start) - t) }
      : { label: "Next event", value: "Clear week" };

  const summary = next
    ? `${current ? `In "${current.summary}" now. ` : ""}Next: "${next.summary}" at ${hm(new Date(next.start))} (${formatUntil(+new Date(next.start) - t)}); ${remainingToday.length} more today, ${events.length} events this week.`
    : `${current ? `In "${current.summary}" now. ` : ""}Nothing else scheduled in the next 7 days.`;

  // Series: events per day for the 8-day window.
  const series = Array.from({ length: 8 }, (_, i) => {
    const a = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + i).getTime();
    const b = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + i + 1).getTime();
    return events.filter((e) => +new Date(e.start) < b && +new Date(e.end) > a).length;
  });

  return {
    id: "calendar",
    status: "live",
    fetchedAt: t,
    source,
    headline,
    metrics: [
      { label: "Today", value: String(today.length) },
      { label: "Remaining", value: String(remainingToday.length) },
      { label: "Booked today", value: `${(busyMs / 3_600_000).toFixed(1)}h` },
      { label: "This week", value: String(events.length) },
      { label: "Next", value: next ? hm(new Date(next.start)) : "—" },
    ],
    series,
    summary,
    detail: {
      calendarName: cal.name,
      events,
      next: next,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
    },
  };
}
