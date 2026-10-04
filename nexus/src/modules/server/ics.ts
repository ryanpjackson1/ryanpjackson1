/**
 * A small, dependency-free iCalendar (RFC 5545) reader — just enough for a
 * personal agenda:
 *
 *  - line unfolding (CRLF/LF followed by a space or tab)
 *  - VEVENT: UID, SUMMARY, LOCATION, DTSTART, DTEND, DURATION, STATUS,
 *    EXDATE, RRULE, RECURRENCE-ID (overrides of a single occurrence)
 *  - all-day dates (VALUE=DATE), UTC "Z" times, floating times, and
 *    TZID= times interpreted as wall-clock time in that IANA zone (offsets via
 *    Intl, so DST transitions are handled; common Windows zone names mapped)
 *  - RRULE expansion for FREQ=DAILY | WEEKLY (+BYDAY) | MONTHLY (+BYDAY /
 *    BYMONTHDAY) | YEARLY with INTERVAL, COUNT, UNTIL
 *
 * Pure: no I/O. Recurrences are expanded in wall-clock time of the event's
 * zone, so a 09:00 weekly meeting stays at 09:00 across DST changes.
 */

/* ─────────────────────────── types ─────────────────────────── */

export interface WallTime { y: number; mo: number; d: number; h: number; mi: number; s: number }
export type TzRef = { kind: "utc" } | { kind: "floating" } | { kind: "zone"; tz: string };
export interface IcsDate { wall: WallTime; tz: TzRef; dateOnly: boolean }

export interface Rrule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count?: number;
  until?: IcsDate;
  /** e.g. [{ ord: 0, wd: 1 }] for MO, [{ ord: -1, wd: 5 }] for -1FR. wd: 0=SU … 6=SA */
  byDay: { ord: number; wd: number }[];
  byMonthDay: number[];
  byMonth: number[];
  wkst: number;
}

export interface IcsRawEvent {
  uid: string;
  summary: string;
  location?: string;
  status?: string;
  start: IcsDate;
  end?: IcsDate;
  /** From DURATION when there is no DTEND. */
  durationMs?: number;
  rrule?: Rrule;
  exdates: IcsDate[];
  recurrenceId?: IcsDate;
}

export interface IcsCalendar { name?: string; events: IcsRawEvent[] }

export interface IcsOccurrence {
  uid: string;
  summary: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  /** YYYY-MM-DD for all-day occurrences. */
  date?: string;
  recurring: boolean;
}

/* ─────────────────────────── lexing ─────────────────────────── */

/** Join folded lines: a line break followed by one space/tab continues the previous line. */
export function unfoldLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter((l) => l.length > 0);
}

export interface ContentLine { name: string; params: Record<string, string>; value: string }

/** Split `NAME;P1=a;P2="b:c":value` respecting quoted parameter values. */
export function parseContentLine(line: string): ContentLine | null {
  let i = 0;
  while (i < line.length && line[i] !== ";" && line[i] !== ":") i++;
  if (i >= line.length) return null;
  const name = line.slice(0, i).toUpperCase();
  const params: Record<string, string> = {};
  while (line[i] === ";") {
    i++;
    const eq = line.indexOf("=", i);
    if (eq < 0) return null;
    const key = line.slice(i, eq).toUpperCase();
    i = eq + 1;
    let val = "";
    if (line[i] === '"') {
      const close = line.indexOf('"', i + 1);
      if (close < 0) return null;
      val = line.slice(i + 1, close);
      i = close + 1;
    } else {
      const start = i;
      while (i < line.length && line[i] !== ";" && line[i] !== ":") i++;
      val = line.slice(start, i);
    }
    params[key] = val;
  }
  if (line[i] !== ":") return null;
  return { name, params, value: line.slice(i + 1) };
}

/** TEXT value unescaping (\n, \, \; \\). */
export const unescapeText = (v: string) => v.replace(/\\([\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));

/* ─────────────────────────── time zones ─────────────────────────── */

/** Windows zone names Outlook/Exchange emit, mapped to IANA. */
const WINDOWS_ZONES: Record<string, string> = {
  "UTC": "UTC",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "E. Europe Standard Time": "Europe/Chisinau",
  "FLE Standard Time": "Europe/Kiev",
  "GTB Standard Time": "Europe/Bucharest",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "US Mountain Standard Time": "America/Phoenix",
  "Pacific Standard Time": "America/Los_Angeles",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Atlantic Standard Time": "America/Halifax",
  "E. South America Standard Time": "America/Sao_Paulo",
  "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Singapore Standard Time": "Asia/Singapore",
  "Arabian Standard Time": "Asia/Dubai",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "New Zealand Standard Time": "Pacific/Auckland",
};

const zoneCache = new Map<string, string | null>();

/** Resolve a TZID parameter to a valid IANA zone, or null (→ floating). */
export function resolveZone(tzid: string): string | null {
  if (zoneCache.has(tzid)) return zoneCache.get(tzid)!;
  const candidates = [tzid, WINDOWS_ZONES[tzid], tzid.replace(/^\/?(mozilla\.org\/[^/]+\/|freeassociation\.sourceforge\.net\/(Tzfile\/)?)/, "")];
  let found: string | null = null;
  for (const c of candidates) {
    if (!c) continue;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: c });
      found = c;
      break;
    } catch {
      /* not a zone */
    }
  }
  zoneCache.set(tzid, found);
  return found;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Offset (ms) of `tz` from UTC at instant `utcMs` (positive east of Greenwich). */
export function tzOffsetMs(utcMs: number, tz: string): number {
  const t = Math.floor(utcMs / 1000) * 1000;
  const p: Record<string, number> = {};
  for (const part of dtf(tz).formatToParts(new Date(t))) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
  return asUtc - t;
}

/** Wall-clock time in `tz` → UTC instant (ms). Gaps resolve forward, overlaps to the first instant. */
export function zonedToUtc(w: WallTime, tz: string): number {
  const naive = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  const off1 = tzOffsetMs(naive, tz);
  let utc = naive - off1;
  const off2 = tzOffsetMs(utc, tz);
  if (off2 !== off1) utc = naive - off2;
  return utc;
}

/* ─────────────────────────── values ─────────────────────────── */

const naiveOf = (w: WallTime) => Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
function wallOf(naive: number): WallTime {
  const d = new Date(naive);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}

/** Real instant of a date value (all-day → local midnight). */
export function instantOf(v: IcsDate): number {
  const w = v.wall;
  if (v.dateOnly || v.tz.kind === "floating") return new Date(w.y, w.mo - 1, w.d, w.h, w.mi, w.s).getTime();
  if (v.tz.kind === "utc") return naiveOf(w);
  return zonedToUtc(w, v.tz.tz);
}

/** Parse a DATE or DATE-TIME value with its params. */
export function parseDateValue(value: string, params: Record<string, string>): IcsDate | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const dateOnly = !m[4] || params.VALUE === "DATE";
  const wall: WallTime = {
    y: +m[1], mo: +m[2], d: +m[3],
    h: dateOnly ? 0 : +m[4], mi: dateOnly ? 0 : +m[5], s: dateOnly ? 0 : +(m[6] ?? 0),
  };
  let tz: TzRef = { kind: "floating" };
  if (!dateOnly) {
    if (m[7]) tz = { kind: "utc" };
    else if (params.TZID) {
      const zone = resolveZone(params.TZID);
      tz = zone === "UTC" ? { kind: "utc" } : zone ? { kind: "zone", tz: zone } : { kind: "floating" };
    }
  }
  return { wall, tz, dateOnly };
}

/** ISO 8601 duration (P1DT2H30M, PT45M, P2W) → ms. */
export function parseDuration(v: string): number | undefined {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return undefined;
  const ms = ((+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 86400 + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0)) * 1000;
  return m[1] === "-" ? -ms : ms;
}

const WD: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function parseRrule(value: string, startTz: TzRef): Rrule | undefined {
  const parts: Record<string, string> = {};
  for (const kv of value.split(";")) {
    const [k, v] = kv.split("=");
    if (k && v !== undefined) parts[k.toUpperCase()] = v;
  }
  const freq = parts.FREQ as Rrule["freq"];
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return undefined;
  let until: IcsDate | undefined;
  if (parts.UNTIL) {
    const u = parseDateValue(parts.UNTIL, {});
    // A non-UTC UNTIL is in the same zone as DTSTART.
    if (u && !u.dateOnly && u.tz.kind === "floating") u.tz = startTz;
    until = u ?? undefined;
  }
  return {
    freq,
    interval: Math.max(1, parseInt(parts.INTERVAL ?? "1", 10) || 1),
    count: parts.COUNT ? parseInt(parts.COUNT, 10) : undefined,
    until,
    byDay: (parts.BYDAY ?? "")
      .split(",")
      .map((s) => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(s.trim().toUpperCase()))
      .filter((x): x is RegExpExecArray => !!x)
      .map((x) => ({ ord: x[1] ? parseInt(x[1], 10) : 0, wd: WD[x[2]] })),
    byMonthDay: (parts.BYMONTHDAY ?? "").split(",").map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n !== 0),
    byMonth: (parts.BYMONTH ?? "").split(",").map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 12),
    wkst: WD[(parts.WKST ?? "MO").toUpperCase()] ?? 1,
  };
}

/* ─────────────────────────── parse ─────────────────────────── */

export function parseIcs(text: string): IcsCalendar {
  const cal: IcsCalendar = { events: [] };
  const stack: string[] = [];
  let cur: { props: ContentLine[] } | null = null;

  for (const raw of unfoldLines(text)) {
    const line = parseContentLine(raw);
    if (!line) continue;
    if (line.name === "BEGIN") {
      const comp = line.value.trim().toUpperCase();
      stack.push(comp);
      if (comp === "VEVENT") cur = { props: [] };
      continue;
    }
    if (line.name === "END") {
      const comp = stack.pop();
      if (comp === "VEVENT" && cur) {
        const ev = buildEvent(cur.props);
        if (ev) cal.events.push(ev);
        cur = null;
      }
      continue;
    }
    const top = stack[stack.length - 1];
    if (top === "VEVENT" && cur) cur.props.push(line);
    else if (top === "VCALENDAR" && line.name === "X-WR-CALNAME") cal.name = unescapeText(line.value);
  }
  return cal;
}

function buildEvent(props: ContentLine[]): IcsRawEvent | null {
  const get = (n: string) => props.find((p) => p.name === n);
  const dtstart = get("DTSTART");
  if (!dtstart) return null;
  const start = parseDateValue(dtstart.value, dtstart.params);
  if (!start) return null;
  const dtend = get("DTEND");
  const end = dtend ? parseDateValue(dtend.value, dtend.params) ?? undefined : undefined;
  const dur = get("DURATION");
  const rr = get("RRULE");
  const rid = get("RECURRENCE-ID");
  const exdates: IcsDate[] = [];
  for (const p of props.filter((x) => x.name === "EXDATE")) {
    for (const v of p.value.split(",")) {
      const d = parseDateValue(v, p.params);
      if (d) exdates.push(d);
    }
  }
  return {
    uid: get("UID")?.value ?? `${dtstart.value}-${get("SUMMARY")?.value ?? ""}`,
    summary: unescapeText(get("SUMMARY")?.value ?? "(no title)").trim() || "(no title)",
    location: get("LOCATION") ? unescapeText(get("LOCATION")!.value).trim() || undefined : undefined,
    status: get("STATUS")?.value.toUpperCase(),
    start,
    end,
    durationMs: dur ? parseDuration(dur.value) : undefined,
    rrule: rr ? parseRrule(rr.value, start.tz) : undefined,
    exdates,
    recurrenceId: rid ? parseDateValue(rid.value, rid.params) ?? undefined : undefined,
  };
}

/* ─────────────────────────── expansion ─────────────────────────── */

const DAY = 86_400_000;
const MAX_CANDIDATES = 100_000;

const daysInMonth = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
const dateKey = (w: WallTime) => `${w.y}-${String(w.mo).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;

/** Day-of-month numbers in (y, mo) matching a BYDAY entry (ord 0 = every). */
function monthDaysFor(y: number, mo: number, bd: { ord: number; wd: number }): number[] {
  const n = daysInMonth(y, mo);
  const firstWd = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const all: number[] = [];
  for (let d = 1 + ((bd.wd - firstWd + 7) % 7); d <= n; d += 7) all.push(d);
  if (bd.ord === 0) return all;
  const pick = bd.ord > 0 ? all[bd.ord - 1] : all[all.length + bd.ord];
  return pick ? [pick] : [];
}

/**
 * Generate naive (wall-clock-as-UTC) start times for a recurring event in
 * chronological order, starting with DTSTART itself (RFC 5545: DTSTART is
 * always the first instance). `stopAfter(naive)` ends generation early.
 */
function* candidates(start: WallTime, r: Rrule): Generator<number> {
  const s0 = naiveOf(start);
  const tod = s0 - Date.UTC(start.y, start.mo - 1, start.d);
  yield s0;
  const okMonth = (mo: number) => r.byMonth.length === 0 || r.byMonth.includes(mo);

  if (r.freq === "DAILY") {
    for (let k = 1; ; k++) {
      const c = s0 + k * r.interval * DAY;
      const w = wallOf(c);
      if (!okMonth(w.mo)) continue;
      if (r.byDay.length && !r.byDay.some((b) => b.wd === new Date(c).getUTCDay())) continue;
      yield c;
    }
  }

  if (r.freq === "WEEKLY") {
    const startWd = new Date(s0).getUTCDay();
    const weekStart = s0 - ((startWd - r.wkst + 7) % 7) * DAY;
    const offsets = (r.byDay.length ? r.byDay.map((b) => b.wd) : [startWd])
      .map((wd) => (wd - r.wkst + 7) % 7)
      .sort((a, b) => a - b)
      .filter((v, i, a) => a.indexOf(v) === i);
    for (let k = 0; ; k++) {
      const ws = weekStart + k * r.interval * 7 * DAY;
      for (const off of offsets) {
        const c = ws + off * DAY;
        if (c <= s0 || !okMonth(wallOf(c).mo)) continue;
        yield c;
      }
    }
  }

  if (r.freq === "MONTHLY" || r.freq === "YEARLY") {
    for (let k = 0; ; k++) {
      const months: { y: number; mo: number }[] = [];
      if (r.freq === "MONTHLY") {
        const idx = start.y * 12 + (start.mo - 1) + k * r.interval;
        const mo = (idx % 12) + 1;
        if (okMonth(mo)) months.push({ y: Math.floor(idx / 12), mo });
      } else {
        const y = start.y + k * r.interval;
        for (const mo of r.byMonth.length ? [...r.byMonth].sort((a, b) => a - b) : [start.mo]) months.push({ y, mo });
      }
      for (const { y, mo } of months) {
        const n = daysInMonth(y, mo);
        let days: number[];
        if (r.byDay.length) days = r.byDay.flatMap((b) => monthDaysFor(y, mo, b));
        else if (r.byMonthDay.length) days = r.byMonthDay.map((d) => (d > 0 ? d : n + 1 + d));
        else days = [start.d];
        days = [...new Set(days)].filter((d) => d >= 1 && d <= n).sort((a, b) => a - b);
        for (const d of days) {
          const c = Date.UTC(y, mo - 1, d) + tod;
          if (c <= s0) continue;
          yield c;
        }
      }
    }
  }
}

/**
 * Expand events into concrete occurrences overlapping [rangeStart, rangeEnd),
 * sorted by start. Cancelled events and EXDATEs are dropped; RECURRENCE-ID
 * overrides replace the occurrence they name.
 */
export function expandIcs(events: IcsRawEvent[], rangeStart: Date, rangeEnd: Date): IcsOccurrence[] {
  const lo = rangeStart.getTime();
  const hi = rangeEnd.getTime();
  const out: IcsOccurrence[] = [];

  // Occurrence instants replaced by RECURRENCE-ID overrides, per UID.
  const overridden = new Map<string, Set<number>>();
  for (const e of events) {
    if (!e.recurrenceId) continue;
    const set = overridden.get(e.uid) ?? new Set<number>();
    set.add(instantOf(e.recurrenceId));
    overridden.set(e.uid, set);
  }

  for (const e of events) {
    if (e.status === "CANCELLED") continue;
    const allDay = e.start.dateOnly;

    // Duration: days for all-day events (DST-proof), ms otherwise.
    let durDays = 1;
    let durMs = 0;
    if (allDay) {
      if (e.end) durDays = Math.max(1, Math.round((naiveOf(e.end.wall) - naiveOf(e.start.wall)) / DAY));
      else if (e.durationMs !== undefined) durDays = Math.max(1, Math.round(e.durationMs / DAY));
    } else if (e.end) durMs = Math.max(0, instantOf(e.end) - instantOf(e.start));
    else if (e.durationMs !== undefined) durMs = Math.max(0, e.durationMs);

    const emit = (naive: number, recurring: boolean) => {
      const wall = wallOf(naive);
      const v: IcsDate = { wall, tz: e.start.tz, dateOnly: allDay };
      const start = instantOf(v);
      const end = allDay ? instantOf({ wall: wallOf(naive + durDays * DAY), tz: v.tz, dateOnly: true }) : start + durMs;
      const overlaps = end > start ? end > lo && start < hi : start >= lo && start < hi;
      if (!overlaps) return;
      out.push({
        uid: e.uid,
        summary: e.summary,
        location: e.location,
        start: new Date(start),
        end: new Date(end),
        allDay,
        date: allDay ? dateKey(wall) : undefined,
        recurring,
      });
    };

    if (!e.rrule || e.recurrenceId) {
      emit(naiveOf(e.start.wall), !!e.recurrenceId);
      continue;
    }

    const r = e.rrule;
    const exInstants = new Set(e.exdates.filter((x) => !x.dateOnly).map(instantOf));
    const exDates = new Set(e.exdates.map((x) => dateKey(x.wall)));
    const skip = overridden.get(e.uid);
    const untilNaive = r.until?.dateOnly ? Date.UTC(r.until.wall.y, r.until.wall.mo - 1, r.until.wall.d, 23, 59, 59) : undefined;
    const untilInstant = r.until && !r.until.dateOnly ? instantOf(r.until) : undefined;
    const spanMs = allDay ? durDays * DAY : durMs;

    let n = 0;
    let guard = 0;
    for (const c of candidates(e.start.wall, r)) {
      if (++guard > MAX_CANDIDATES) break;
      const v: IcsDate = { wall: wallOf(c), tz: e.start.tz, dateOnly: allDay };
      const inst = instantOf(v);
      if (untilNaive !== undefined && c > untilNaive) break;
      if (untilInstant !== undefined && inst > untilInstant) break;
      if (r.count !== undefined && n >= r.count) break;
      n++; // COUNT counts instances before EXDATE removal (RFC 5545 §3.8.5.3)
      if (inst >= hi) break;
      if (inst + spanMs + DAY < lo) continue; // cheap skip of the distant past
      if (allDay ? exDates.has(dateKey(v.wall)) : exInstants.has(inst)) continue;
      if (skip?.has(inst)) continue;
      emit(c, true);
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || Number(b.allDay) - Number(a.allDay));
}
