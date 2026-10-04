/**
 * Open a URL in a DEDICATED window on a chosen display.
 *
 * Browser names are only ever taken from the fixed `BROWSERS` table below,
 * so the per-browser AppleScript built from it is still a compile-time
 * constant; the URL and window bounds travel as argv.
 */
import { access } from "node:fs/promises";
import type { BridgeResult, DisplayInfo } from "../verbs";
import { BIN, osascript, run } from "./exec";
import { inset, listDisplays, pickTarget } from "./displays";
import { translate } from "./errors";

type Family = "chromium" | "safari";

interface Browser {
  app: string;             // AppleScript / `open -a` name — from this table only
  bundleId: string;
  path: string;
  family: Family;
}

const BROWSERS: readonly Browser[] = [
  { app: "Google Chrome", bundleId: "com.google.chrome", path: "/Applications/Google Chrome.app", family: "chromium" },
  { app: "Brave Browser", bundleId: "com.brave.browser", path: "/Applications/Brave Browser.app", family: "chromium" },
  { app: "Microsoft Edge", bundleId: "com.microsoft.edgemac", path: "/Applications/Microsoft Edge.app", family: "chromium" },
  { app: "Arc", bundleId: "company.thebrowser.browser", path: "/Applications/Arc.app", family: "chromium" },
  { app: "Safari", bundleId: "com.apple.safari", path: "/Applications/Safari.app", family: "safari" },
];

/** Parse `defaults read … LSHandlers` (old-style plist) for the https handler. */
export function parseHttpsHandler(plist: string): string | null {
  for (const block of plist.split("}")) {
    if (!/LSHandlerURLScheme\s*=\s*"?https"?\s*;/.test(block)) continue;
    const m = block.match(/LSHandlerRoleAll\s*=\s*"?([\w.-]+)"?\s*;/);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

const exists = (p: string) => access(p).then(() => true, () => false);

async function defaultBrowser(): Promise<Browser> {
  try {
    const { stdout } = await run(BIN.defaults, ["read", "com.apple.LaunchServices/com.apple.launchservices.secure", "LSHandlers"]);
    const id = parseHttpsHandler(stdout);
    const hit = BROWSERS.find((b) => b.bundleId === id);
    if (hit && (await exists(hit.path))) return hit;
  } catch {
    // No LaunchServices override recorded → Safari is the system default,
    // but fall through to "whatever is installed" to be safe.
  }
  for (const b of BROWSERS) if (await exists(b.path)) return b;
  return BROWSERS[BROWSERS.length - 1];
}

/** Only http(s), parsed by the WHATWG URL parser. Returns the normalised href. */
export function validateUrl(raw: string): URL | null {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  let s = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || u.username || u.password) return null;
    return u;
  } catch {
    return null;
  }
}

// ---- Chromium family -------------------------------------------------------

const chromiumScripts = (app: string) => ({
  // Window ids, or "" when the browser isn't running (don't launch it here).
  ids: `on run argv
  if application "${app}" is not running then return ""
  tell application "${app}" to return id of every window
end run`,
  bounds: `on run argv
  set args to rest of argv
  set wid to (item 1 of args) as integer
  set b to {(item 2 of args) as integer, (item 3 of args) as integer, (item 4 of args) as integer, (item 5 of args) as integer}
  tell application "${app}"
    set w to (first window whose id is wid)
    set bounds of w to b
    set index of w to 1
    activate
  end tell
end run`,
});

/** Built once from the fixed table — never from input. */
const CHROMIUM_SCRIPTS: Record<string, ReturnType<typeof chromiumScripts>> = Object.fromEntries(
  BROWSERS.filter((b) => b.family === "chromium").map((b) => [b.app, chromiumScripts(b.app)]),
);

const parseIds = (s: string) => s.split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function openChromium(b: Browser, url: string, target: DisplayInfo | null): Promise<boolean> {
  const scripts = CHROMIUM_SCRIPTS[b.app];
  const before = new Set(parseIds(await osascript(scripts.ids).catch(() => "")));
  // AppleScript `make new window` + `set URL` is ignored by Chrome on a new
  // window, so use the CLI: -n asks LaunchServices for a fresh launch, which
  // Chrome hands to the running instance as "open a new window with this URL".
  await run(BIN.open, ["-na", b.app, "--args", "--new-window", url]);
  if (!target) return true;
  // Poll for a window id we haven't seen. Don't trust `front window`: another
  // window (or app) can steal frontmost between the launch and our query.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await wait(150);
    const now = parseIds(await osascript(scripts.ids).catch(() => ""));
    const fresh = now.find((id) => !before.has(id));
    if (fresh !== undefined) {
      const r = inset(target.bounds);
      await osascript(scripts.bounds, [String(fresh), String(r.left), String(r.top), String(r.right), String(r.bottom)]);
      return true;
    }
  }
  return false; // opened, but couldn't identify the window to place it
}

// ---- Safari ----------------------------------------------------------------

const SAFARI_OPEN = `on run argv
  set args to rest of argv
  set b to {(item 2 of args) as integer, (item 3 of args) as integer, (item 4 of args) as integer, (item 5 of args) as integer}
  tell application "Safari"
    activate
    set d to make new document with properties {URL:item 1 of args}
    set placed to false
    try
      set w to (first window whose document is d)
      set bounds of w to b
      set placed to true
    end try
    if not placed then set bounds of front window to b
  end tell
end run`;

async function openSafari(url: string, target: DisplayInfo | null): Promise<boolean> {
  const r = target ? inset(target.bounds) : { left: 80, top: 80, right: 1280, bottom: 860 };
  await osascript(SAFARI_OPEN, [url, String(r.left), String(r.top), String(r.right), String(r.bottom)]);
  return true;
}

// ---- entry -----------------------------------------------------------------

export async function openUrl(rawUrl: string, display?: string): Promise<BridgeResult> {
  const u = validateUrl(rawUrl);
  if (!u) return { ok: false, message: "That doesn't look like a web address I can open.", fix: "Only http:// and https:// links are allowed." };
  const host = u.hostname.replace(/^www\./, "");

  const [browser, displays] = await Promise.all([defaultBrowser(), listDisplays().catch(() => [] as DisplayInfo[])]);
  const target = pickTarget(displays, display);
  const where = target ? ` ${target.spoken}` : "";

  try {
    const placed = browser.family === "safari" ? await openSafari(u.href, target) : await openChromium(browser, u.href, target);
    if (!placed) {
      return { ok: true, message: `Opened ${host} in ${browser.app}, but I couldn't move the window${where}.`, data: { url: u.href, browser: browser.app } };
    }
    return { ok: true, message: `Opened ${host}${where}.`, data: { url: u.href, browser: browser.app, display: target?.name } };
  } catch (err) {
    const t = translate(err, browser.app);
    return { ok: false, message: t.message, fix: t.fix };
  }
}
