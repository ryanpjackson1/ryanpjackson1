import { describe, expect, it } from "vitest";
import { backAccumulate, detectInstagramToken } from "@/modules/server/instagram";
import { expandIcs, parseIcs, unfoldLines, zonedToUtc } from "@/modules/server/ics";
import { classifyCondition, conditionIntensity } from "@/modules/server/weather";
import { parsePortfolio } from "@/modules/server/stocks";
import { parseFeed } from "@/modules/server/news";

describe("backAccumulate", () => {
  it("walks backward from today's total; delta[i] is the change INTO day i", () => {
    const deltas = [
      { date: "2026-10-01", value: 5 },
      { date: "2026-10-02", value: 3 },
      { date: "2026-10-03", value: -2 },
      { date: "2026-10-04", value: 10 },
    ];
    // total[3] = 1000; total[2] = 1000 − 10 = 990; total[1] = 990 − (−2) = 992; total[0] = 992 − 3 = 989.
    // (The day before the window would be 989 − 5 = 984.)
    expect(backAccumulate(1000, deltas)).toEqual([
      { date: "2026-10-01", total: 989 },
      { date: "2026-10-02", total: 992 },
      { date: "2026-10-03", total: 990 },
      { date: "2026-10-04", total: 1000 },
    ]);
  });

  it("forward-applying the deltas reproduces the curve and ends on the current total", () => {
    const deltas = [7, -1, 0, 12, 4].map((value, i) => ({ date: `d${i}`, value }));
    const out = backAccumulate(500, deltas);
    for (let i = 1; i < out.length; i++) expect(out[i].total - out[i - 1].total).toBe(deltas[i].value);
    expect(out[out.length - 1].total).toBe(500);
  });

  it("handles an empty series", () => {
    expect(backAccumulate(42, [])).toEqual([]);
  });
});

describe("detectInstagramToken", () => {
  it("IGAA → Instagram Login on graph.instagram.com addressed as me", () => {
    expect(detectInstagramToken("IGAAabc123")).toEqual({
      path: "instagram-login",
      base: "https://graph.instagram.com/v23.0",
      account: "me",
      needsBusinessId: false,
    });
  });
  it("EAA → Facebook Login on graph.facebook.com, needs a business id", () => {
    expect(detectInstagramToken("EAAGm0PX4ZCpsBA")).toEqual({
      path: "facebook-login",
      base: "https://graph.facebook.com/v23.0",
      account: null,
      needsBusinessId: true,
    });
  });
  it("anything else → null", () => {
    expect(detectInstagramToken("sk-123")).toBeNull();
    expect(detectInstagramToken("")).toBeNull();
    expect(detectInstagramToken(undefined)).toBeNull();
  });
});

describe("ics", () => {
  const cal = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Work\r\n${body}END:VCALENDAR\r\n`;

  it("unfolds continuation lines", () => {
    expect(unfoldLines("SUMMARY:Quarterly plan\r\n ning review\r\n\tpart two\r\nEND:VEVENT")).toEqual([
      "SUMMARY:Quarterly planning reviewpart two",
      "END:VEVENT",
    ]);
  });

  it("parses folded summaries, escapes, UTC times and the calendar name", () => {
    const parsed = parseIcs(
      cal(
        "BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Design review\\, round 2 with the plat\r\n form team\r\nLOCATION:Room 4\; floor 2\r\nDTSTART:20261005T150000Z\r\nDTEND:20261005T160000Z\r\nBEGIN:VALARM\r\nTRIGGER:-PT10M\r\nSUMMARY:alarm text\r\nEND:VALARM\r\nEND:VEVENT\r\n",
      ),
    );
    expect(parsed.name).toBe("Work");
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].summary).toBe("Design review, round 2 with the platform team");
    expect(parsed.events[0].location).toBe("Room 4; floor 2");
    const [o] = expandIcs(parsed.events, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-10T00:00:00Z"));
    expect(o.start.toISOString()).toBe("2026-10-05T15:00:00.000Z");
    expect(o.end.toISOString()).toBe("2026-10-05T16:00:00.000Z");
    expect(o.allDay).toBe(false);
  });

  it("handles all-day events (VALUE=DATE)", () => {
    const parsed = parseIcs(cal("BEGIN:VEVENT\r\nUID:b\r\nSUMMARY:Offsite\r\nDTSTART;VALUE=DATE:20261006\r\nDTEND;VALUE=DATE:20261008\r\nEND:VEVENT\r\n"));
    const [o] = expandIcs(parsed.events, new Date(2026, 9, 1), new Date(2026, 9, 10));
    expect(o.allDay).toBe(true);
    expect(o.date).toBe("2026-10-06");
    expect([o.start.getFullYear(), o.start.getMonth(), o.start.getDate(), o.start.getHours()]).toEqual([2026, 9, 6, 0]);
    expect([o.end.getMonth(), o.end.getDate()]).toEqual([9, 8]);
  });

  it("interprets TZID times as wall time in that zone (incl. DST)", () => {
    expect(new Date(zonedToUtc({ y: 2026, mo: 10, d: 5, h: 9, mi: 0, s: 0 }, "America/New_York")).toISOString()).toBe("2026-10-05T13:00:00.000Z");
    expect(new Date(zonedToUtc({ y: 2026, mo: 12, d: 5, h: 9, mi: 0, s: 0 }, "America/New_York")).toISOString()).toBe("2026-12-05T14:00:00.000Z");
    expect(new Date(zonedToUtc({ y: 2026, mo: 7, d: 1, h: 18, mi: 30, s: 0 }, "Europe/London")).toISOString()).toBe("2026-07-01T17:30:00.000Z");
    const parsed = parseIcs(cal('BEGIN:VEVENT\r\nUID:c\r\nSUMMARY:Call\r\nDTSTART;TZID="Europe/Berlin":20261005T100000\r\nDURATION:PT45M\r\nEND:VEVENT\r\n'));
    const [o] = expandIcs(parsed.events, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-10T00:00:00Z"));
    expect(o.start.toISOString()).toBe("2026-10-05T08:00:00.000Z");
    expect(o.end.toISOString()).toBe("2026-10-05T08:45:00.000Z");
  });

  it("expands a weekly BYDAY rule with COUNT and EXDATE, keeping wall time across DST", () => {
    // Mon/Wed 09:00 New York from Mon 26 Oct 2026; US DST ends Sun 1 Nov 2026.
    // COUNT=6 → 26 Oct, 28 Oct, 2 Nov, 4 Nov, 9 Nov, 11 Nov; EXDATE removes 28 Oct.
    const parsed = parseIcs(
      cal(
        "BEGIN:VEVENT\r\nUID:standup\r\nSUMMARY:Standup\r\nDTSTART;TZID=America/New_York:20261026T090000\r\nDTEND;TZID=America/New_York:20261026T091500\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6\r\nEXDATE;TZID=America/New_York:20261028T090000\r\nEND:VEVENT\r\n",
      ),
    );
    const occ = expandIcs(parsed.events, new Date("2026-10-20T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));
    expect(occ.map((o) => o.start.toISOString())).toEqual([
      "2026-10-26T13:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
      "2026-11-04T14:00:00.000Z",
      "2026-11-09T14:00:00.000Z",
      "2026-11-11T14:00:00.000Z",
    ]);
    expect(occ.every((o) => o.end.getTime() - o.start.getTime() === 15 * 60_000)).toBe(true);
    expect(occ.every((o) => o.recurring)).toBe(true);
  });

  it("respects UNTIL, INTERVAL, the query range and RECURRENCE-ID overrides", () => {
    const parsed = parseIcs(
      cal(
        "BEGIN:VEVENT\r\nUID:d\r\nSUMMARY:Gym\r\nDTSTART:20261001T070000Z\r\nDTEND:20261001T080000Z\r\nRRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261009T070000Z\r\nEND:VEVENT\r\n" +
          "BEGIN:VEVENT\r\nUID:d\r\nRECURRENCE-ID:20261005T070000Z\r\nSUMMARY:Gym (late)\r\nDTSTART:20261005T190000Z\r\nDTEND:20261005T200000Z\r\nEND:VEVENT\r\n",
      ),
    );
    const occ = expandIcs(parsed.events, new Date("2026-10-03T00:00:00Z"), new Date("2026-10-31T00:00:00Z"));
    expect(occ.map((o) => `${o.summary}@${o.start.toISOString().slice(5, 16)}`)).toEqual([
      "Gym@10-03T07:00",
      "Gym (late)@10-05T19:00",
      "Gym@10-07T07:00",
      "Gym@10-09T07:00",
    ]);
  });

  it("expands monthly rules by ordinal weekday", () => {
    const parsed = parseIcs(cal("BEGIN:VEVENT\r\nUID:e\r\nSUMMARY:Board\r\nDTSTART:20260105T170000Z\r\nRRULE:FREQ=MONTHLY;BYDAY=1MO\r\nEND:VEVENT\r\n"));
    const occ = expandIcs(parsed.events, new Date("2026-09-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));
    expect(occ.map((o) => o.start.toISOString().slice(0, 10))).toEqual(["2026-09-07", "2026-10-05", "2026-11-02"]);
  });

  it("skips cancelled events", () => {
    const parsed = parseIcs(cal("BEGIN:VEVENT\r\nUID:f\r\nSUMMARY:Nope\r\nSTATUS:CANCELLED\r\nDTSTART:20261005T150000Z\r\nEND:VEVENT\r\n"));
    expect(expandIcs(parsed.events, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-10T00:00:00Z"))).toEqual([]);
  });
});

describe("classifyCondition", () => {
  it("maps WMO codes to environment states", () => {
    expect(classifyCondition(0, 5, 0)).toBe("sun");
    expect(classifyCondition(3, 100, 0)).toBe("clouds");
    expect(classifyCondition(45, 100, 0)).toBe("fog");
    expect(classifyCondition(61, 90, 0.4)).toBe("rain");
    expect(classifyCondition(95, 100, 3)).toBe("storm");
    expect(classifyCondition(71, 100, 0.2)).toBe("snow");
  });
  it("lets cloud cover and measured precipitation refine ambiguous codes", () => {
    expect(classifyCondition(2, 75, 0)).toBe("clouds");
    expect(classifyCondition(2, 30, 0)).toBe("sun");
    expect(classifyCondition(3, 100, 1.2)).toBe("rain");
  });
  it("produces intensity in 0..1", () => {
    for (const [code, cc, p] of [[0, 0, 0], [65, 100, 20], [95, 100, 0], [45, 100, 0]] as const) {
      const i = conditionIntensity(classifyCondition(code, cc, p), code, cc, p);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThanOrEqual(1);
    }
    expect(conditionIntensity("rain", 65, 100, 20)).toBe(1);
  });
});

describe("parsePortfolio", () => {
  it("parses and normalises holdings", () => {
    expect(parsePortfolio('[{"symbol":"nvda","shares":10,"cost":420}]')).toEqual([{ symbol: "NVDA", shares: 10, cost: 420 }]);
  });
  it("explains what is wrong", () => {
    expect(() => parsePortfolio("{")).toThrow(/not valid JSON/);
    expect(() => parsePortfolio('[{"symbol":"NVDA"}]')).toThrow(/positive "shares"/);
  });
});

describe("parseFeed", () => {
  it("reads RSS items with CDATA and entities", () => {
    const xml = `<rss><channel><title>Example &amp; Co</title><item><title><![CDATA[Hello <b>world</b>]]></title><link>https://example.com/a?x=1&amp;y=2</link><pubDate>Sun, 04 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    const f = parseFeed(xml, "https://example.com/feed");
    expect(f.title).toBe("Example & Co");
    expect(f.articles[0]).toMatchObject({ title: "Hello world", url: "https://example.com/a?x=1&y=2", source: "example.com", time: Date.UTC(2026, 9, 4, 10) });
  });
  it("reads Atom entries", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title><entry><title>Post</title><link rel="alternate" href="https://blog.dev/p"/><published>2026-10-01T00:00:00Z</published></entry></feed>`;
    expect(parseFeed(xml, "https://blog.dev/atom").articles[0]).toMatchObject({ title: "Post", url: "https://blog.dev/p", feedName: "Blog" });
  });
});
