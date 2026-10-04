/**
 * Hand-written implementation of every bridge verb.
 *
 * Importing this module has no side effects (nothing is spawned or scanned
 * at import time), so tests can import IMPL on Linux.
 *
 * Every AppleScript below is a string literal. User values arrive through
 * argv only — see exec.ts for why that matters.
 */
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BRIDGE_VERBS, type BridgeArgs, type BridgeResult, type BridgeVerb, type MediaAction } from "../verbs";
import { resolveApp } from "./apps";
import { openUrl } from "./browser";
import { translate } from "./errors";
import { BIN, osascript, run } from "./exec";

type Impl<V extends BridgeVerb> = (args: BridgeArgs[V]) => Promise<BridgeResult>;

const fail = (err: unknown, target?: string): BridgeResult => {
  const t = translate(err, target);
  return { ok: false, message: t.message, fix: t.fix };
};

const noApp = (spoken: string): BridgeResult => ({
  ok: false,
  message: `There's no application called “${spoken.slice(0, 60)}” on this Mac.`,
  fix: "Check the name in Finder → Applications, or press ⌘K to search what's installed.",
});

// ---- media -----------------------------------------------------------------

/** Player names come from this whitelist only — never from the request. */
const PLAYERS = ["Spotify", "Music"] as const;
type Player = (typeof PLAYERS)[number];

const WHICH_PLAYER = `on run argv
  if application "Spotify" is running then return "Spotify"
  return "Music"
end run`;

const MEDIA_VERB: Record<MediaAction, string> = {
  play: "play",
  pause: "pause",
  toggle: "playpause",
  next: "next track",
  previous: "previous track",
};

/** Fixed table of literal scripts: player × action. */
const MEDIA_SCRIPTS = Object.fromEntries(
  PLAYERS.map((p) => [
    p,
    Object.fromEntries(
      (Object.keys(MEDIA_VERB) as MediaAction[]).map((a) => [a, `on run argv\n  tell application "${p}" to ${MEDIA_VERB[a]}\nend run`]),
    ),
  ]),
) as Record<Player, Record<MediaAction, string>>;

const MEDIA_SAID: Record<MediaAction, string> = {
  play: "Playing",
  pause: "Paused",
  toggle: "Toggled playback",
  next: "Skipped to the next track",
  previous: "Back to the previous track",
};

// ---- volume ----------------------------------------------------------------

const GET_VOLUME = `on run argv
  set s to get volume settings
  return ((output volume of s) as text) & "," & ((output muted of s) as text)
end run`;

const SET_VOLUME = `on run argv
  set args to rest of argv
  set volume output volume ((item 1 of args) as integer)
  set volume output muted ((item 2 of args) is "true")
end run`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ---- misc scripts ----------------------------------------------------------

const HIDE_OTHERS = `on run argv
  tell application "System Events"
    set visible of every process whose visible is true and frontmost is false to false
  end tell
end run`;

const QUIT_APP = `on run argv
  set args to rest of argv
  set appName to item 1 of args
  if application appName is not running then return "not-running"
  tell application appName to quit
  return "ok"
end run`;

/** ⌃⌘Q — the system "Lock Screen" shortcut. Needs Accessibility for the terminal. */
const LOCK_KEYSTROKE = `on run argv
  tell application "System Events" to keystroke "q" using {control down, command down}
end run`;

const MAKE_NOTE = `on run argv
  set args to rest of argv
  tell application "Notes"
    try
      make new note with properties {name:item 1 of args, body:item 2 of args}
    on error
      make new note at folder 1 of default account with properties {name:item 1 of args, body:item 2 of args}
    end try
  end tell
end run`;

const MAKE_REMINDER = `on run argv
  set args to rest of argv
  set t to item 1 of args
  tell application "Reminders"
    if (count of args) is 1 then
      make new reminder with properties {name:t}
    else
      set d to current date
      set day of d to 1
      set year of d to (item 2 of args) as integer
      set month of d to (item 3 of args) as integer
      set day of d to (item 4 of args) as integer
      set time of d to (item 5 of args) as integer
      make new reminder with properties {name:t, due date:d}
    end if
  end tell
end run`;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const exists = (p: string) => access(p).then(() => true, () => false);

/** Screenshots above this size are returned by path only. */
const MAX_INLINE_PNG = 1_500_000;

// ---- the table -------------------------------------------------------------

/**
 * One implementation per verb. The mapped type makes a missing (or extra)
 * verb a COMPILE error: add a verb to BRIDGE_VERBS in ../verbs.ts and this
 * object stops type-checking until it has a hand-written implementation.
 */
export const IMPL: { [V in BridgeVerb]: Impl<V> } = {
  async launch({ app }) {
    const hit = await resolveApp(app);
    if (!hit) return noApp(app);
    try {
      await run(BIN.open, ["-a", hit.path]);
      return { ok: true, message: `Opening ${hit.name}.`, data: hit };
    } catch (err) {
      return fail(err, hit.name);
    }
  },

  async "open-url"({ url, display }) {
    return openUrl(url, display);
  },

  async media({ action }) {
    let player: Player = "Music";
    try {
      const which = await osascript(WHICH_PLAYER);
      player = which === "Spotify" ? "Spotify" : "Music";
      await osascript(MEDIA_SCRIPTS[player][action]);
      return { ok: true, message: `${MEDIA_SAID[action]} in ${player}.`, data: { player } };
    } catch (err) {
      return fail(err, player);
    }
  },

  async volume({ level, delta, mute }) {
    try {
      const [volRaw, mutedRaw] = (await osascript(GET_VOLUME)).split(",");
      const current = Number(volRaw) || 0;
      let next = current;
      if (typeof level === "number") next = level;
      else if (typeof delta === "number") next = current + delta;
      next = Math.round(clamp(next, 0, 100));
      const muted = typeof mute === "boolean" ? mute : (level !== undefined || delta !== undefined) ? false : mutedRaw === "true";
      await osascript(SET_VOLUME, [String(next), String(muted)]);
      return { ok: true, message: muted ? "Muted." : `Volume ${next}%.`, data: { level: next, muted } };
    } catch (err) {
      return fail(err);
    }
  },

  async screenshot() {
    const dir = await mkdtemp(path.join(os.tmpdir(), "nexus-shot-"));
    const file = path.join(dir, `screenshot-${Date.now()}.png`);
    try {
      await run(BIN.screencapture, ["-x", "-t", "png", file]);
      const size = (await stat(file).catch(() => null))?.size ?? 0;
      if (!size) throw new Error("could not create image from display");
      // A small preview for the UI; the full-resolution file stays on disk.
      const preview = path.join(dir, "preview.png");
      let previewFile = file;
      try {
        await run(BIN.sips, ["-Z", "1280", file, "--out", preview]);
        previewFile = preview;
      } catch { /* sips unavailable → try the original */ }
      const buf = await readFile(previewFile);
      const base64 = buf.length <= MAX_INLINE_PNG ? buf.toString("base64") : undefined;
      if (previewFile !== file) await rm(preview, { force: true });
      return { ok: true, message: "Screenshot taken.", data: { path: file, mime: "image/png", base64 } };
    } catch (err) {
      await rm(dir, { recursive: true, force: true });
      return fail(err);
    }
  },

  async "clipboard-read"() {
    try {
      const { stdout } = await run(BIN.pbpaste, []);
      if (!stdout) return { ok: true, message: "Your clipboard is empty.", data: { text: "" } };
      const preview = stdout.length > 140 ? `${stdout.slice(0, 140)}…` : stdout;
      return { ok: true, message: `Your clipboard says: ${preview}`, data: { text: stdout } };
    } catch (err) {
      return fail(err);
    }
  },

  async "clipboard-write"({ text }) {
    try {
      await run(BIN.pbcopy, [], { input: text });
      return { ok: true, message: "Copied to your clipboard." };
    } catch (err) {
      return fail(err);
    }
  },

  async "hide-others"() {
    try {
      await osascript(HIDE_OTHERS);
      return { ok: true, message: "Hid everything else." };
    } catch (err) {
      return fail(err, "System Events");
    }
  },

  async quit({ app }) {
    const hit = await resolveApp(app);
    if (!hit) return noApp(app);
    try {
      // Graceful quit only: the app gets to ask about unsaved work. Never kill.
      const r = await osascript(QUIT_APP, [hit.name]);
      if (r === "not-running") return { ok: true, message: `${hit.name} isn't running.` };
      return { ok: true, message: `Asked ${hit.name} to quit.` };
    } catch (err) {
      return fail(err, hit.name);
    }
  },

  /**
   * Lock: the old CGSession -suspend binary (no permissions needed) where it
   * still exists (≤ Catalina); otherwise the system ⌃⌘Q shortcut through
   * System Events, which needs Accessibility. `pmset displaysleepnow` is NOT
   * used here: it only locks if "require password immediately" is set.
   */
  async lock() {
    try {
      if (await exists(BIN.cgsession)) await run(BIN.cgsession, ["-suspend"]);
      else await osascript(LOCK_KEYSTROKE);
      return { ok: true, message: "Locked." };
    } catch (err) {
      return fail(err, "System Events");
    }
  },

  async "sleep-display"() {
    try {
      await run(BIN.pmset, ["displaysleepnow"]);
      return { ok: true, message: "Display sleeping." };
    } catch (err) {
      return fail(err);
    }
  },

  async dnd({ on }) {
    const name = on ? "Turn On Do Not Disturb" : "Turn Off Do Not Disturb";
    try {
      await run(BIN.shortcuts, ["run", name]);
      return { ok: true, message: on ? "Do Not Disturb is on." : "Do Not Disturb is off." };
    } catch (err) {
      const text = String((err as Error)?.message ?? err);
      if (/couldn.?t find|not found|no shortcut/i.test(text)) {
        return {
          ok: false,
          message: `I need a shortcut called “${name}”.`,
          fix: "Open Shortcuts → New Shortcut → add “Set Focus” → Do Not Disturb → Turn On, and name it “Turn On Do Not Disturb”. Make a second one with Turn Off named “Turn Off Do Not Disturb”. macOS has no other supported way to toggle Focus.",
        };
      }
      return fail(err, "Shortcuts");
    }
  },

  async note({ title, body }) {
    try {
      const html = `<h1>${escapeHtml(title)}</h1><div>${escapeHtml(body).replace(/\n/g, "<br>")}</div>`;
      await osascript(MAKE_NOTE, [title, html]);
      return { ok: true, message: `Saved a note called “${title}”.` };
    } catch (err) {
      return fail(err, "Notes");
    }
  },

  async reminder({ title, due }) {
    const argv = [title];
    let when = "";
    if (due !== undefined) {
      const d = new Date(due);
      if (!Number.isFinite(d.getTime())) {
        return { ok: false, message: "I couldn't understand that due date.", fix: "Use a time like “tomorrow at 9am”." };
      }
      // Local wall-clock parts as integers — never a date string for AppleScript to parse.
      argv.push(
        String(d.getFullYear()),
        String(d.getMonth() + 1),
        String(d.getDate()),
        String(d.getHours() * 3600 + d.getMinutes() * 60),
      );
      when = ` for ${d.toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })}`;
    }
    try {
      await osascript(MAKE_REMINDER, argv);
      return { ok: true, message: `I'll remind you to ${title}${when}.` };
    } catch (err) {
      return fail(err, "Reminders");
    }
  },
};

/** Run a verb; never throws. */
export async function runVerb<V extends BridgeVerb>(verb: V, args: BridgeArgs[V]): Promise<BridgeResult> {
  try {
    return await (IMPL[verb] as Impl<V>)(args);
  } catch (err) {
    return fail(err);
  }
}

/** Runtime mirror of the compile-time check (used by tests). */
export const IMPLEMENTED_VERBS = Object.keys(IMPL) as BridgeVerb[];
export const allVerbsImplemented = () =>
  BRIDGE_VERBS.length === IMPLEMENTED_VERBS.length && BRIDGE_VERBS.every((v) => v in IMPL);
