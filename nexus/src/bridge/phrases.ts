/**
 * Voice phrase → BridgeIntent. Pure and deterministic (pass `now` to pin
 * time-relative phrases in tests).
 *
 * Ownership rules:
 *   - Module words ("open instagram", "show stocks", "open music") belong to
 *     the module system → null here. Exception: names in APP_OVER_MODULE that
 *     are first and foremost real Mac apps ("open spotify").
 *   - A clear website ("open instagram.com") is always ours.
 *   - Personal destinations ("open my reels") come only from the LIVE
 *     InstagramDetail; nothing personal is ever hard-coded.
 */
import type { InstagramDetail } from "@/core/details";
import { MODULES } from "@/core/modules";
import type { BridgeIntent } from "@/core/intents";
import type { BridgeArgs, BridgeVerb, MediaAction } from "./verbs";
import { SEARCH, findSite, latestPost, latestReel, toUrl } from "./sites";

export interface PhraseContext {
  instagram?: InstagramDetail | null;
  /** Clock for "tomorrow at 9" etc. Defaults to new Date(). */
  now?: Date;
}

const intent = <V extends BridgeVerb>(verb: V, args: BridgeArgs[V]) => ({ kind: "bridge", verb, args }) as BridgeIntent;

/** Module aliases that are, above all, Mac apps — "open spotify" launches Spotify. */
const APP_OVER_MODULE = new Set(["spotify"]);

const MODULE_WORDS: ReadonlySet<string> = new Set(
  Object.values(MODULES)
    .flatMap((m) => [m.id, m.label.toLowerCase(), ...m.aliases])
    .filter((w) => !APP_OVER_MODULE.has(w)),
);

const isModuleWord = (s: string) => {
  const w = s.toLowerCase().replace(/^(?:the|my)\s+/, "").replace(/\s+(?:module|card|panel)$/, "").trim();
  return MODULE_WORDS.has(w);
};

/** Sites with a common native Mac app: "open figma" means the app. */
const SITE_HAS_APP = new Set(["figma", "notion", "chatgpt", "claude", "spotify web"]);

/** Strip wake words, politeness and trailing punctuation; keep case. */
export function cleanPhrase(text: string): string {
  return text
    .trim()
    .replace(/[.!?]+$/, "")
    .replace(/^(?:(?:hey|ok|okay)\s+)?nexus[,:]?\s+/i, "")
    .replace(/^(?:(?:please|can you|could you|would you|will you)\s+)+/i, "")
    .replace(/,?\s+(?:please|for me|thanks|thank you)$/i, "")
    .trim();
}

const DISPLAY_SUFFIX =
  /\s+on\s+(?:my\s+|the\s+|your\s+)?(laptop|macbook|built[- ]in(?:\s+(?:display|screen))?|lg|dell|samsung|asus|benq|acer|ultrawide|studio display|(?:[\w-]+\s+){0,2}(?:display|monitor|screen))$/i;

/** "open github.com on my laptop" → { rest: "open github.com", display: "laptop" }. */
export function splitDisplay(text: string): { rest: string; display?: string } {
  const m = text.match(DISPLAY_SUFFIX);
  if (!m) return { rest: text };
  return { rest: text.slice(0, m.index).trim(), display: m[1].toLowerCase() };
}

// ---- personal destinations -------------------------------------------------

const PERSONAL =
  /^(?:(?:open|show(?:\s+me)?|go\s+to|pull\s+up|bring\s+up|take\s+me\s+to|play|watch)\s+)?my\s+(?:(?:latest|last|newest|most\s+recent|recent)\s+)?(?:instagram\s+|insta\s+|ig\s+)?(reels?|posts?|profile|instagram|insta|ig|page|account|grid)$/i;

export type PersonalResult = { url: string; label: string } | { error: string };

/**
 * Resolve "open my reels" / "show my profile" / "my last post" from the live
 * feed. null = not a personal phrase; { error } = it is one, but we can't
 * resolve it (feed not connected, no reels yet) — say the error aloud.
 */
export function resolvePersonalDestination(text: string, ctx: PhraseContext): PersonalResult | null {
  const { rest } = splitDisplay(cleanPhrase(text));
  const m = rest.match(PERSONAL);
  if (!m) return null;
  const what = m[1].toLowerCase();
  const ig = ctx.instagram;
  if (!ig) return { error: "I need your Instagram feed connected first." };

  if (what === "reel" || what === "reels") {
    const reel = latestReel(ig);
    return reel?.permalink ? { url: reel.permalink, label: "your latest reel" } : { error: "I can't see any reels in your feed yet." };
  }
  if (what === "post") {
    const post = latestPost(ig);
    return post?.permalink ? { url: post.permalink, label: "your latest post" } : { error: "I can't see any posts in your feed yet." };
  }
  return ig.profileUrl ? { url: ig.profileUrl, label: "your profile" } : { error: "Your Instagram feed didn't include a profile link." };
}

// ---- reminders: due-date parsing -------------------------------------------

const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, "forty five": 45,
};

const DAY_WORD = /\s+(today|tomorrow|tonight|this evening|this morning)$/i;
const AT_TIME = /\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i;
const IN_REL = /\s+in\s+(\d{1,3}|an?|one|two|three|four|five|ten|fifteen|twenty|thirty|forty five)\s+(minutes?|mins?|hours?|hrs?)$/i;

/** "call mum tomorrow at 5pm" → { title: "call mum", due: ISO }. */
export function parseReminder(task: string, now: Date): { title: string; due?: string } {
  let t = ` ${task.trim()}`;
  // "tomorrow at 9 to call mum" → "call mum tomorrow at 9"
  const lead = t.match(/^\s+((?:in\s+\S+\s+\S+)|(?:(?:today|tomorrow|tonight)(?:\s+at\s+[\d:]+\s*(?:[ap]\.?m\.?)?)?)|(?:at\s+[\d:]+\s*(?:[ap]\.?m\.?)?))\s+to\s+(.+)$/i);
  if (lead) t = ` ${lead[2]} ${lead[1]}`;

  let day: string | undefined;
  let hour: number | undefined;
  let minute = 0;
  let meridiem: string | undefined;
  let relMs: number | undefined;
  for (let i = 0; i < 3; i++) {
    let m: RegExpMatchArray | null;
    if (!day && (m = t.match(DAY_WORD))) { day = m[1].toLowerCase(); t = t.slice(0, m.index); continue; }
    if (hour === undefined && (m = t.match(AT_TIME))) {
      hour = Number(m[1]); minute = m[2] ? Number(m[2]) : 0; meridiem = m[3]?.toLowerCase().replace(/\./g, "");
      t = t.slice(0, m.index); continue;
    }
    if (relMs === undefined && (m = t.match(IN_REL))) {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1].toLowerCase()] ?? 1;
      relMs = n * (/^h/i.test(m[2]) ? 3_600_000 : 60_000);
      t = t.slice(0, m.index); continue;
    }
    break;
  }
  const title = t.trim();
  if (relMs !== undefined) return { title, due: new Date(now.getTime() + relMs).toISOString() };
  if (!day && hour === undefined) return { title };

  const d = new Date(now.getTime());
  if (day === "tomorrow") d.setDate(d.getDate() + 1);
  if (hour === undefined) {
    hour = day === "tonight" || day === "this evening" ? 20 : day === "this morning" ? 9 : day === "tomorrow" ? 9 : 17;
  } else if (meridiem === "pm" && hour < 12) hour += 12;
  else if (meridiem === "am" && hour === 12) hour = 0;
  else if (!meridiem && hour < 7) hour += 12; // "at 5" almost always means 5pm
  if ((day === "tonight" || day === "this evening") && hour < 12) hour += 12;
  d.setHours(hour, minute, 0, 0);
  if (!day && d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1); // "at 9" already passed → tomorrow
  return { title, due: d.toISOString() };
}

// ---- notes -----------------------------------------------------------------

function noteFrom(raw: string): { title: string; body: string } {
  const called = raw.match(/^(?:called|titled|named)\s+(.+?)(?:\s*[:,]\s*|\s+(?:saying|that says|with)\s+)(.+)$/i);
  if (called) return { title: cap(called[1].trim()), body: called[2].trim() };
  const body = raw.trim();
  const first = body.split(/[.:\n]/)[0].trim().split(/\s+/).slice(0, 6).join(" ");
  return { title: cap(first || "Note"), body };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- the parser ------------------------------------------------------------

const MEDIA: [RegExp, MediaAction][] = [
  [/^(?:play\s*pause|toggle\s+(?:playback|the\s+music))$/i, "toggle"],
  // Bare "stop" is left alone — it usually means "stop talking".
  [/^pause(?:\s+(?:the\s+)?(?:music|song|track|playback|spotify|audio))?$|^stop\s+(?:the\s+)?(?:music|song|track|playback|audio)$/i, "pause"],
  [/^(?:play|resume|unpause)(?:\s+(?:the\s+)?(?:music|song|playback|spotify))?$/i, "play"],
  [/^(?:(?:next|skip)(?:\s+(?:this|the))?\s+(?:track|song)|skip(?:\s+(?:it|this))?)$/i, "next"],
  [/^(?:(?:previous|prev|last)\s+(?:track|song)|go\s+back\s+(?:a|one)\s+(?:track|song))$/i, "previous"],
];

/**
 * Parse one utterance. Returns null when the phrase isn't a desktop action
 * (or belongs to the module system), and for personal destinations that
 * can't be resolved — call resolvePersonalDestination for the reason.
 */
export function parseBridgePhrase(text: string, ctx: PhraseContext = {}): BridgeIntent | null {
  const full = cleanPhrase(text);
  if (!full) return null;
  const { rest, display } = splitDisplay(full);
  const withDisplay = (url: string) => intent("open-url", display ? { url, display } : { url });

  // 1. Personal destinations — before module words ("my reels" ≠ module "reels").
  const personal = resolvePersonalDestination(full, ctx);
  if (personal) return "url" in personal ? withDisplay(personal.url) : null;

  // 2. Search.
  let m = rest.match(/^search\s+(youtube|google)\s+for\s+(.+)$/i) ?? rest.match(/^(youtube|google)\s+(?!\.)(.+)$/i);
  if (m) return withDisplay(SEARCH[m[1].toLowerCase() as keyof typeof SEARCH](m[2].trim()));
  m = rest.match(/^search\s+(?:for\s+)?(.+?)\s+on\s+(youtube|google)$/i);
  if (m) return withDisplay(SEARCH[m[2].toLowerCase() as keyof typeof SEARCH](m[1].trim()));
  m = rest.match(/^(?:search|look\s+up)\s+(?:the\s+web\s+)?(?:for\s+)?(.+)$/i);
  if (m) return withDisplay(SEARCH.google(m[1].trim()));

  // 3. Websites: explicit domains always; known site names via "go to", or
  //    via "open" when the site has no native app and isn't a module word.
  m = rest.match(/^(?:open|go\s+to|visit|browse\s+to|navigate\s+to|pull\s+up|load|bring\s+up)\s+(.+)$/i);
  if (m) {
    const target = m[1].trim();
    const url = toUrl(target);
    if (url) return withDisplay(url);
    const site = findSite(target.replace(/^the\s+/i, "").replace(/\s+(?:website|site|dot com)$/i, ""));
    const explicitWeb = /^(?:go\s+to|visit|browse\s+to|navigate\s+to)\b/i.test(rest) || /\s+(?:website|site|dot com)$/i.test(target);
    if (site && (explicitWeb || (!isModuleWord(target) && !SITE_HAS_APP.has(site.name.toLowerCase())))) {
      return withDisplay(site.url);
    }
  }

  // 4. Media.
  for (const [re, action] of MEDIA) if (re.test(full)) return intent("media", { action });

  // 5. Volume.
  if ((m = full.match(/^(?:turn\s+(?:the\s+)?)?volume\s+(up|down)$|^turn\s+(?:it|the\s+(?:volume|sound|music))\s+(up|down)$/i))) {
    return intent("volume", { delta: (m[1] ?? m[2]).toLowerCase() === "up" ? 10 : -10 });
  }
  if (/^(?:louder|volume\s+louder)$/i.test(full)) return intent("volume", { delta: 10 });
  if (/^(?:quieter|softer)$/i.test(full)) return intent("volume", { delta: -10 });
  if ((m = full.match(/^(?:set\s+)?(?:the\s+)?volume\s+(?:to\s+|at\s+)?(\d{1,3})(?:\s*%|\s+percent)?$/i))) {
    return intent("volume", { level: Math.min(100, Number(m[1])) });
  }
  if (/^mute(?:\s+(?:the\s+)?(?:sound|audio|volume|mac|computer))?$/i.test(full)) return intent("volume", { mute: true });
  if (/^unmute(?:\s+(?:the\s+)?(?:sound|audio|volume|mac|computer))?$/i.test(full)) return intent("volume", { mute: false });

  // 6. Screenshot.
  if (/^(?:(?:take|grab|capture|make)\s+(?:a\s+|the\s+)?(?:screenshot|screen\s*shot|screen\s+capture)|screenshot|capture\s+(?:the|my)\s+screen)$/i.test(full)) {
    return intent("screenshot", {});
  }

  // 7. Clipboard.
  if ((m = full.match(/^copy\s+(.+?)\s+(?:to|into|onto)\s+(?:the\s+|my\s+)?clipboard$/i))) {
    return intent("clipboard-write", { text: m[1].replace(/^["“']|["”']$/g, "") });
  }
  if (/^(?:what'?s|what\s+is)\s+(?:on|in)\s+(?:the\s+|my\s+)?clipboard$|^(?:read|show)\s+(?:me\s+)?(?:the\s+|my\s+)?clipboard$/i.test(full)) {
    return intent("clipboard-read", {});
  }

  // 8. Hide others.
  if (/^hide\s+(?:everything|all|every\s*thing)(?:\s+else)?$|^hide\s+(?:the\s+)?others$|^hide\s+(?:all\s+)?other\s+(?:apps|windows|applications)$/i.test(full)) {
    return intent("hide-others", {});
  }

  // 9. Lock / sleep display.
  if (/^lock(?:\s+(?:the\s+|my\s+)?(?:screen|mac|computer|laptop))?$/i.test(full)) return intent("lock", {});
  if (/^(?:sleep|turn\s+off|switch\s+off)\s+(?:the\s+|my\s+)?(?:display|displays|screen|screens|monitor|monitors)$|^(?:put\s+)?(?:the\s+|my\s+)?(?:display|screen|monitor)s?\s+to\s+sleep$/i.test(full)) {
    return intent("sleep-display", {});
  }

  // 10. Do Not Disturb.
  m = full.match(/^(?:(?:turn|switch)\s+)?(on|off|enable|disable)\s+(?:do\s+not\s+disturb|dnd|focus(?:\s+mode)?)$/i)
    ?? full.match(/^(?:(?:turn|switch)\s+)?(?:do\s+not\s+disturb|dnd|focus\s+mode)\s+(on|off)$/i);
  if (m) return intent("dnd", { on: /^(?:on|enable)$/i.test(m[1]) });

  // 11. Notes.
  m = full.match(/^(?:make|take|create|add|write|jot\s+down)\s+(?:a\s+)?(?:new\s+|quick\s+)?note(?:\s+(?:that\s+says|saying|that|about|to\s+self)|\s*[:,])?\s+(.+)$/i)
    ?? full.match(/^note\s+(?:to\s+self\s*:?\s*|that\s+)?(.+)$/i);
  if (m) return intent("note", noteFrom(m[1]));

  // 12. Reminders.
  if ((m = full.match(/^remind\s+me\s+(?:to\s+|that\s+|about\s+)?(.+)$/i))) {
    const r = parseReminder(m[1], ctx.now ?? new Date());
    if (!r.title) return null;
    return intent("reminder", r.due ? { title: r.title, due: r.due } : { title: r.title });
  }

  // 13. Quit (graceful; resolved against installed apps server-side).
  if ((m = full.match(/^(?:quit|exit)\s+(?:the\s+)?(.+?)(?:\s+app)?$/i))) {
    const app = m[1].trim();
    if (/^(?:nexus|this|it|everything|all(?:\s+apps)?)$/i.test(app)) return null;
    return intent("quit", { app });
  }

  // 14. Launch — last, it's the broadest. Module words are not ours.
  if ((m = full.match(/^(?:open|launch|start|run|fire\s+up|boot\s+up)\s+(?:the\s+|my\s+)?(.+?)(?:\s+app)?$/i))) {
    const app = m[1].trim();
    if (isModuleWord(app)) return null;
    if (app.split(/\s+/).length > 4 || app.length > 40) return null;
    return intent("launch", { app });
  }

  return null;
}
