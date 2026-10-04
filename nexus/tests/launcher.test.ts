import { describe, expect, it } from "vitest";
import { MatchTier, matchTier, rank } from "@/bridge/rank";
import { parseBridgePhrase, parseReminder, resolvePersonalDestination } from "@/bridge/phrases";
import { buildResults, moduleRows, nexusRows, personalRows, siteRows, sysRows, appRows } from "@/hud/launcher/rows";
import type { InstagramDetail } from "@/core/details";

const names = (q: string, list: string[]) => rank(q, list, (s) => s).map((r) => r.item);

describe("rank", () => {
  it("classifies tiers", () => {
    expect(matchTier("safari", "Safari")).toBe(MatchTier.Exact);
    expect(matchTier("saf", "Safari")).toBe(MatchTier.Prefix);
    expect(matchTier("vsc", "Visual Studio Code")).toBe(MatchTier.Initials);
    expect(matchTier("studio", "Visual Studio Code")).toBe(MatchTier.WordBoundary);
    expect(matchTier("fari", "Safari")).toBe(MatchTier.Substring);
    expect(matchTier("xyz", "Safari")).toBeNull();
  });

  it("orders prefix > initials > word boundary > substring", () => {
    const list = ["Recode", "Visual Studio Code", "Code Runner", "Vscode Helper", "Xcode"];
    // "co": prefix (Code Runner) > word boundary (Visual Studio Code) > substring (Recode, Vscode Helper, Xcode)
    expect(names("co", list)).toEqual(["Code Runner", "Visual Studio Code", "Xcode", "Recode", "Vscode Helper"]);
    // "vsc": prefix (Vscode Helper) > initials (Visual Studio Code)
    expect(names("vsc", list)).toEqual(["Vscode Helper", "Visual Studio Code"]);
  });

  it("breaks ties by shorter name then alphabetically, excludes non-matches", () => {
    expect(names("s", ["Slack", "Safari", "Spotify", "Calendar"])).toEqual(["Slack", "Safari", "Spotify"]);
    expect(names("ma", ["Mail", "Maps", "Calendar"])).toEqual(["Mail", "Maps"]);
  });

  it("matches across title + keywords", () => {
    const r = rank("twitter", [{ t: "X", k: ["twitter"] }], (x) => [x.t, ...x.k]);
    expect(r[0].tier).toBe(MatchTier.Exact);
  });
});

const IG: InstagramDetail = {
  username: "ryan",
  profileUrl: "https://www.instagram.com/ryan_from_feed/",
  apiPath: "instagram-login",
  followers: 1200,
  mediaCount: 4,
  followerHistory: [],
  media: [
    { id: "1", caption: "old reel", mediaType: "VIDEO", productType: "REELS", permalink: "https://www.instagram.com/reel/OLD/", timestamp: "2026-09-01T10:00:00+0000" },
    { id: "2", caption: "new reel", mediaType: "VIDEO", productType: "REELS", permalink: "https://www.instagram.com/reel/NEW/", timestamp: "2026-09-20T10:00:00+0000" },
    { id: "3", caption: "photo", mediaType: "IMAGE", productType: "FEED", permalink: "https://www.instagram.com/p/PHOTO/", timestamp: "2026-09-25T10:00:00+0000" },
    { id: "4", caption: "older", mediaType: "CAROUSEL_ALBUM", productType: "FEED", permalink: "https://www.instagram.com/p/CAR/", timestamp: "2026-08-01T10:00:00+0000" },
  ],
};

describe("parseBridgePhrase", () => {
  const ctx = { instagram: IG, now: new Date(2026, 9, 4, 14, 0, 0) };
  const p = (t: string) => parseBridgePhrase(t, ctx);

  it("personal destinations come from the live feed", () => {
    expect(p("open my reels")).toEqual({ kind: "bridge", verb: "open-url", args: { url: "https://www.instagram.com/reel/NEW/" } });
    expect(p("my last reel")).toMatchObject({ args: { url: "https://www.instagram.com/reel/NEW/" } });
    expect(p("open my latest post")).toMatchObject({ args: { url: "https://www.instagram.com/p/PHOTO/" } });
    expect(p("show my profile")).toMatchObject({ args: { url: "https://www.instagram.com/ryan_from_feed/" } });
    expect(p("open my reels on my laptop")).toMatchObject({ args: { url: "https://www.instagram.com/reel/NEW/", display: "laptop" } });
  });

  it("personal destinations without a feed ask for it", () => {
    expect(parseBridgePhrase("open my reels", {})).toBeNull();
    expect(resolvePersonalDestination("open my reels", {})).toEqual({ error: "I need your Instagram feed connected first." });
    expect(resolvePersonalDestination("open spotify", {})).toBeNull();
  });

  it("leaves module words to the module system", () => {
    expect(p("open instagram")).toBeNull();
    expect(p("open stocks")).toBeNull();
    expect(p("open the calendar")).toBeNull();
    expect(p("open github")).toBeNull();
    expect(p("open music")).toBeNull();
  });

  it("launches apps", () => {
    expect(p("open spotify")).toEqual({ kind: "bridge", verb: "launch", args: { app: "spotify" } });
    expect(p("launch figma")).toEqual({ kind: "bridge", verb: "launch", args: { app: "figma" } });
    expect(p("Hey Nexus, please open Visual Studio Code.")).toMatchObject({ verb: "launch", args: { app: "Visual Studio Code" } });
  });

  it("opens websites and searches", () => {
    expect(p("open instagram.com")).toEqual({ kind: "bridge", verb: "open-url", args: { url: "https://instagram.com/" } });
    expect(p("open github.com")).toMatchObject({ verb: "open-url", args: { url: "https://github.com/" } });
    expect(p("go to youtube")).toMatchObject({ verb: "open-url", args: { url: "https://www.youtube.com" } });
    expect(p("search youtube for lo-fi")).toMatchObject({ args: { url: "https://www.youtube.com/results?search_query=lo-fi" } });
    expect(p("search google for next.js docs")).toMatchObject({ args: { url: "https://www.google.com/search?q=next.js%20docs" } });
    expect(p("open github.com on the LG")).toMatchObject({ args: { url: "https://github.com/", display: "lg" } });
  });

  it("media, volume, system", () => {
    expect(p("pause")).toMatchObject({ verb: "media", args: { action: "pause" } });
    expect(p("play")).toMatchObject({ verb: "media", args: { action: "play" } });
    expect(p("next track")).toMatchObject({ verb: "media", args: { action: "next" } });
    expect(p("previous song")).toMatchObject({ verb: "media", args: { action: "previous" } });
    expect(p("stop")).toBeNull();
    expect(p("volume up")).toMatchObject({ verb: "volume", args: { delta: 10 } });
    expect(p("volume down")).toMatchObject({ verb: "volume", args: { delta: -10 } });
    expect(p("set volume to 30")).toMatchObject({ verb: "volume", args: { level: 30 } });
    expect(p("mute")).toMatchObject({ verb: "volume", args: { mute: true } });
    expect(p("take a screenshot")).toMatchObject({ verb: "screenshot" });
    expect(p("copy Hello World to clipboard")).toMatchObject({ verb: "clipboard-write", args: { text: "Hello World" } });
    expect(p("what's on my clipboard")).toMatchObject({ verb: "clipboard-read" });
    expect(p("hide everything else")).toMatchObject({ verb: "hide-others" });
    expect(p("hide others")).toMatchObject({ verb: "hide-others" });
    expect(p("quit slack")).toMatchObject({ verb: "quit", args: { app: "slack" } });
    expect(p("lock the screen")).toMatchObject({ verb: "lock" });
    expect(p("sleep display")).toMatchObject({ verb: "sleep-display" });
    expect(p("do not disturb on")).toMatchObject({ verb: "dnd", args: { on: true } });
    expect(p("turn off do not disturb")).toMatchObject({ verb: "dnd", args: { on: false } });
  });

  it("notes and reminders", () => {
    expect(p("make a note buy oat milk and coffee")).toMatchObject({ verb: "note", args: { title: "Buy oat milk and coffee", body: "buy oat milk and coffee" } });
    expect(p("make a note called Ideas: ring should glow")).toMatchObject({ verb: "note", args: { title: "Ideas", body: "ring should glow" } });
    const r = p("remind me to call mum tomorrow at 5pm");
    expect(r).toMatchObject({ verb: "reminder", args: { title: "call mum" } });
    const due = new Date((r as { args: { due: string } }).args.due);
    expect([due.getDate(), due.getHours(), due.getMinutes()]).toEqual([5, 17, 0]);
    expect(p("remind me to stretch")).toEqual({ kind: "bridge", verb: "reminder", args: { title: "stretch" } });
  });

  it("parses relative and leading reminder times", () => {
    const now = new Date(2026, 9, 4, 14, 0, 0);
    expect(new Date(parseReminder("take the bins out in 10 minutes", now).due!).getTime() - now.getTime()).toBe(600_000);
    const lead = parseReminder("tomorrow at 9am to send invoices", now);
    expect(lead.title).toBe("send invoices");
    expect(new Date(lead.due!).getHours()).toBe(9);
    // "at 9" (am implied ≥ 7) already passed today → tomorrow
    expect(new Date(parseReminder("water plants at 9", now).due!).getDate()).toBe(5);
  });

  it("ignores unrelated speech", () => {
    expect(p("what's the weather like")).toBeNull();
    expect(p("rotate left")).toBeNull();
  });
});

describe("launcher rows", () => {
  const all = [
    ...personalRows(IG), ...moduleRows(), ...nexusRows(), ...sysRows(),
    ...appRows([{ name: "Visual Studio Code", path: "/Applications/Visual Studio Code.app" }, { name: "Spotify", path: "/Applications/Spotify.app" }]),
    ...siteRows(),
  ];

  it("puts an Open <domain> row first for URL-ish queries", () => {
    const r = buildResults("github.com", all);
    expect(r[0]).toMatchObject({ tag: "WEB", title: "Open github.com" });
  });

  it("ranks across sources and tags each row", () => {
    const r = buildResults("vsc", all);
    expect(r[0]).toMatchObject({ tag: "APP", title: "Visual Studio Code" });
    expect(buildResults("stocks", all)[0]).toMatchObject({ tag: "MODULE", intent: { kind: "open-module", id: "stocks" } });
    expect(buildResults("lock", all)[0]).toMatchObject({ tag: "SYS" });
    expect(buildResults("ocean", all)[0]).toMatchObject({ tag: "NEXUS", intent: { kind: "world", id: "ocean" } });
    expect(buildResults("latest reel", all)[0]).toMatchObject({ tag: "MY", intent: { args: { url: "https://www.instagram.com/reel/NEW/" } } });
  });

  it("derives personal rows only from the feed", () => {
    expect(personalRows(undefined)).toEqual([]);
    expect(personalRows(IG).map((r) => r.id)).toEqual(["my:profile", "my:reel", "my:post"]);
  });
});
