/**
 * Translate raw macOS failures into one spoken sentence + the exact setting
 * to change.
 *
 * Every TCC permission (Screen Recording, Automation, Accessibility) is
 * granted to the process that *runs the command* — here, the terminal
 * running `next dev` (Terminal, iTerm, VS Code, Warp…), never the browser
 * showing NEXUS. That's the single most confusing thing about the bridge, so
 * every permission fix says it explicitly.
 */

export interface Translated {
  message: string;
  fix: string;
}

/** Best guess at the app that owns the dev server, for fix text. */
export function terminalName(env: NodeJS.ProcessEnv = process.env): string {
  const t = env.TERM_PROGRAM ?? "";
  if (t === "iTerm.app") return "iTerm";
  if (t === "Apple_Terminal") return "Terminal";
  if (t === "vscode") return env.CURSOR_TRACE_ID ? "Cursor" : "Visual Studio Code";
  if (t === "WarpTerminal") return "Warp";
  if (t === "ghostty") return "Ghostty";
  if (t === "WezTerm") return "WezTerm";
  return "your terminal app (Terminal, iTerm, VS Code — whichever runs `next dev`)";
}

const notBrowser = (term: string) =>
  `The permission belongs to ${term}, the app running the dev server — not your browser.`;

/** `target` is the app being scripted, when known (for Automation fixes). */
export function translate(err: unknown, target?: string): Translated {
  const e = err as { message?: string; stderr?: string; code?: string | number; killed?: boolean; signal?: string } | null;
  const text = `${e?.message ?? String(err)}\n${e?.stderr ?? ""}`;
  const term = terminalName();
  const app = target ?? "the app";

  if (/could not create image from display|screen ?capture|screen recording/i.test(text)) {
    return {
      message: "macOS blocked the screenshot because Screen Recording isn't allowed.",
      fix: `System Settings → Privacy & Security → Screen Recording → enable ${term}, then quit and reopen it and restart the dev server. ${notBrowser(term)}`,
    };
  }
  if (/-1743|not authori[sz]ed to send apple events/i.test(text)) {
    return {
      message: `macOS didn't let NEXUS control ${app}.`,
      fix: `System Settings → Privacy & Security → Automation → under ${term}, allow ${app}. ${notBrowser(term)} If it isn't listed, run the command again and click OK on the prompt.`,
    };
  }
  if (/-1719|-25211|assistive access|accessibility/i.test(text)) {
    return {
      message: "macOS needs Accessibility access for that.",
      fix: `System Settings → Privacy & Security → Accessibility → enable ${term}, then restart it. ${notBrowser(term)}`,
    };
  }
  if (/-600\b|application isn.?t running/i.test(text)) {
    return {
      message: `${target ?? "That app"} isn't running.`,
      fix: `Open ${target ?? "the app"} first, then try again.`,
    };
  }
  if (/-1728|can.?t get/i.test(text)) {
    return {
      message: `${target ?? "The app"} didn't have what I asked for.`,
      fix: `Make sure ${target ?? "the app"} has a window or item open, then try again.`,
    };
  }
  if (e?.code === "ETIMEDOUT" || e?.killed || e?.signal === "SIGTERM" || /timed out/i.test(text)) {
    return {
      message: `${target ?? "macOS"} took too long to answer.`,
      fix: "A permission prompt may be waiting behind another window — check for one, answer it, and try again.",
    };
  }
  if (e?.code === "ENOENT" || /ENOENT|no such file/i.test(text)) {
    return {
      message: "A macOS tool the bridge needs isn't on this Mac.",
      fix: "The bridge needs macOS 13 or newer with its built-in command-line tools (osascript, screencapture, open).",
    };
  }
  return {
    message: "macOS refused that request.",
    fix: firstLine(text) || "Check the dev server log for details.",
  };
}

const firstLine = (s: string) => s.split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 240) ?? "";
