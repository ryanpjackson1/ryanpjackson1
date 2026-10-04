/**
 * Music — what's playing on the Mac (Spotify first, then Apple Music) via
 * AppleScript. Only active on macOS with NEXUS_BRIDGE=1.
 *
 * Security: scripts are compile-time constants passed to `execFile` (never a
 * shell). Each player is only addressed after `application "X" is running`
 * confirms it is open, so polling never launches an app.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { emptyPayload, type ModulePayload } from "@/core/payload";
import type { MusicDetail } from "@/modules/types";
import { errorMessage, getJSON } from "./http";

const run = promisify(execFile);
const SOURCE = "macOS desktop bridge · AppleScript";
const SEP = "\u001f"; // ASCII unit separator, joined in AppleScript via `character id 31`

/** Which players are open — touches no app terminology, so it can't launch anything. */
const SCRIPT_RUNNING = `set s to ""
try
  if application "Spotify" is running then set s to s & "spotify,"
end try
try
  if application "Music" is running then set s to s & "music,"
end try
return s`;

const SCRIPT_SPOTIFY = `if application "Spotify" is running then
  tell application "Spotify"
    set st to player state as string
    if st is "stopped" then return "stopped"
    set t to current track
    set u to character id 31
    return st & u & (name of t) & u & (artist of t) & u & (album of t) & u & (player position as string) & u & ((duration of t) as string) & u & (artwork url of t)
  end tell
end if
return "closed"`;

const SCRIPT_MUSIC = `if application "Music" is running then
  tell application "Music"
    set st to player state as string
    if st is "stopped" then return "stopped"
    set t to current track
    set u to character id 31
    return st & u & (name of t) & u & (artist of t) & u & (album of t) & u & (player position as string) & u & ((duration of t) as string) & u & ""
  end tell
end if
return "closed"`;

async function osa(script: string): Promise<string> {
  const { stdout } = await run("osascript", ["-e", script], { timeout: 2500, maxBuffer: 64 * 1024 });
  return stdout.trim();
}

/** AppleScript prints reals with the locale's decimal separator. */
const num = (s: string | undefined) => {
  const n = parseFloat((s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** Apple Music exposes no artwork URL; look the track up in the iTunes catalogue (cached). */
const artCache = new Map<string, string | null>();
async function itunesArtwork(artist: string, track: string): Promise<string | undefined> {
  const key = `${artist}\u0000${track}`;
  if (artCache.has(key)) return artCache.get(key) ?? undefined;
  try {
    const r = await getJSON<{ results?: { artworkUrl100?: string }[] }>(
      `https://itunes.apple.com/search?entity=song&limit=1&term=${encodeURIComponent(`${artist} ${track}`)}`,
      { timeoutMs: 3000, revalidate: 86_400 },
    );
    const url = r.results?.[0]?.artworkUrl100?.replace(/100x100bb/, "600x600bb") ?? null;
    artCache.set(key, url);
    return url ?? undefined;
  } catch {
    return undefined;
  }
}

function parse(player: "Spotify" | "Music", out: string): MusicDetail | null {
  if (out === "closed") return null;
  if (out === "stopped") return { player, state: "stopped" };
  const [state, track, artist, album, pos, dur, art] = out.split(SEP);
  let duration = num(dur);
  if (player === "Spotify" && duration !== undefined) duration /= 1000; // Spotify reports ms
  return {
    player,
    state: state === "playing" ? "playing" : state === "paused" ? "paused" : "stopped",
    track: track || undefined,
    artist: artist || undefined,
    album: album || undefined,
    position: num(pos),
    duration,
    artwork: art || undefined,
  };
}

const fmt = (s?: number) => (s === undefined ? "—" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

export async function fetchMusic(_req: Request): Promise<ModulePayload<MusicDetail>> {
  if (process.platform !== "darwin" || process.env.NEXUS_BRIDGE !== "1") {
    return emptyPayload(
      "music",
      "unconfigured",
      SOURCE,
      "Now Playing reads Spotify/Music through the desktop bridge — run on macOS with NEXUS_BRIDGE=1.",
    ) as ModulePayload<MusicDetail>;
  }

  let np: MusicDetail = { player: null, state: "stopped" };
  try {
    const running = await osa(SCRIPT_RUNNING);
    const candidates: ["Spotify" | "Music", string][] = [];
    if (running.includes("spotify")) candidates.push(["Spotify", SCRIPT_SPOTIFY]);
    if (running.includes("music")) candidates.push(["Music", SCRIPT_MUSIC]);
    let paused: MusicDetail | null = null;
    for (const [player, script] of candidates) {
      const d = parse(player, await osa(script));
      if (d?.state === "playing") { np = d; paused = null; break; }
      if (d && d.state === "paused" && !paused) paused = d;
      if (d && np.player === null) np = d;
    }
    if (paused && np.state !== "playing") np = paused;
  } catch (e) {
    const msg = errorMessage(e);
    const hint = /not allowed|-1743|authoriz/i.test(msg)
      ? "macOS blocked NEXUS from controlling Spotify/Music. Allow it in System Settings → Privacy & Security → Automation → (your terminal or Node) → enable Spotify and Music, then retry."
      : `AppleScript failed (${msg}). Check that osascript works in the terminal that runs NEXUS.`;
    return emptyPayload("music", "error", SOURCE, hint) as ModulePayload<MusicDetail>;
  }

  if (np.player === "Music" && !np.artwork && np.artist && np.track) np.artwork = await itunesArtwork(np.artist, np.track);

  const playing = np.state === "playing";
  const progress = np.position !== undefined && np.duration ? np.position / np.duration : undefined;
  return {
    id: "music",
    status: "live",
    fetchedAt: Date.now(),
    source: np.player ? `${np.player} · AppleScript` : SOURCE,
    headline: np.track
      ? { label: `${playing ? "Playing" : "Paused"} · ${np.artist ?? np.player}`, value: np.track }
      : { label: "Now playing", value: np.player ? "Stopped" : "Nothing playing" },
    metrics: np.track
      ? [
          { label: "Artist", value: np.artist ?? "—" },
          { label: "Album", value: np.album ?? "—" },
          { label: "Position", value: `${fmt(np.position)} / ${fmt(np.duration)}` },
          { label: "Player", value: np.player ?? "—" },
        ]
      : [{ label: "Player", value: np.player ?? "Spotify/Music closed" }],
    series: progress !== undefined ? [0, progress] : undefined,
    summary: np.track
      ? `${playing ? "Playing" : "Paused"}: "${np.track}" by ${np.artist ?? "unknown artist"}${np.album ? ` from ${np.album}` : ""} in ${np.player}.`
      : np.player
        ? `${np.player} is open but nothing is playing.`
        : "Neither Spotify nor Music is open.",
    detail: np,
  };
}
