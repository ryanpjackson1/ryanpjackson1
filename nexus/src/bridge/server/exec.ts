/**
 * The ONLY module in NEXUS that spawns processes.
 *
 * Rules, enforced by tests/bridge.test.ts (static scan of src/bridge/server):
 *   - Processes are started with `execFile` / `spawn` and an explicit argv
 *     array. No shell is ever involved: no shell-string variant of
 *     child_process, no shell option. With no shell there is nothing that
 *     interprets `;`, `&&`, `$( )`, backticks, globs or quotes — a user
 *     string can only ever be ONE argv element of a binary we chose.
 *   - Binaries are referenced by absolute path from a fixed table.
 *
 * AppleScript / JXA get the same treatment one level up (see `osascript`).
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/** Absolute paths to every binary the bridge may run. Nothing else is runnable. */
export const BIN = {
  osascript: "/usr/bin/osascript",
  open: "/usr/bin/open",
  screencapture: "/usr/sbin/screencapture",
  sips: "/usr/bin/sips",
  pbcopy: "/usr/bin/pbcopy",
  pbpaste: "/usr/bin/pbpaste",
  pmset: "/usr/bin/pmset",
  shortcuts: "/usr/bin/shortcuts",
  defaults: "/usr/bin/defaults",
  cgsession: "/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession",
} as const;

export type Bin = (typeof BIN)[keyof typeof BIN];

export interface RunOptions {
  /** ms; default 8000. */
  timeout?: number;
  /** Written to the child's stdin, then stdin is closed. */
  input?: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

export const DEFAULT_TIMEOUT_MS = 8000;
const MAX_BUFFER = 16 * 1024 * 1024;

/**
 * Run `file` with `args` — no shell. Rejects with an Error whose message
 * includes stderr, so errors.ts can translate it.
 */
export async function run(file: Bin, args: readonly string[], opts: RunOptions = {}): Promise<RunResult> {
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS;
  if (opts.input !== undefined) return runWithInput(file, args, opts.input, timeout);
  try {
    const { stdout, stderr } = await execFileP(file, [...args], {
      timeout,
      maxBuffer: MAX_BUFFER,
      encoding: "utf8",
      windowsHide: true,
    });
    return { stdout, stderr };
  } catch (err) {
    throw annotate(err);
  }
}

/** `spawn` (still no shell) so we can feed stdin, e.g. pbcopy. */
function runWithInput(file: string, args: readonly string[], input: string, timeout: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, [...args], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill("SIGTERM");
      reject(Object.assign(new Error(`${file} timed out after ${timeout}ms`), { code: "ETIMEDOUT", killed: true }));
    }, timeout);
    child.stdout.setEncoding("utf8").on("data", (d: string) => { if (stdout.length < MAX_BUFFER) stdout += d; });
    child.stderr.setEncoding("utf8").on("data", (d: string) => { if (stderr.length < MAX_BUFFER) stderr += d; });
    child.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(annotate(err));
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(`${file} exited ${code}: ${stderr.trim()}`), { code, stderr }));
    });
    child.stdin.on("error", () => { /* surfaced via close/error */ });
    child.stdin.end(input, "utf8");
  });
}

function annotate(err: unknown): Error {
  if (err instanceof Error) {
    const e = err as Error & { stderr?: string };
    if (e.stderr && !e.message.includes(e.stderr.trim())) e.message = `${e.message}\n${e.stderr.trim()}`;
    return e;
  }
  return new Error(String(err));
}

/**
 * Constant first positional argument handed to every script.
 *
 * osascript parses its options with getopt, which keeps treating arguments
 * as options until it meets a non-option. Without this sentinel, a user value
 * like "-e" placed first would be read as ANOTHER `-e <statement>` — i.e.
 * script injection through argv. A fixed non-dash first argument ends option
 * parsing for certain, so every user value after it is positional data.
 * Scripts therefore read `rest of argv` (AppleScript) / `argv.slice(1)` (JXA).
 */
export const ARGV_SENTINEL = "nexus";

/**
 * Run an AppleScript (or JXA) program.
 *
 * WHY THIS KILLS THE INJECTION CLASS: `script` is always a string literal
 * written in our source (or chosen from a fixed table of literals) — no user
 * value is ever concatenated into it. User values travel only as argv and are
 * read inside the script as `item n of args` / `args[n]`, which are *data*:
 * AppleScript never compiles them. So `Safari"; do shell script "rm -rf ~"`
 * stays a weird string, not a second statement. Combined with execFile (no
 * shell), there is no layer left that would parse it as code.
 */
export function osascript(
  script: string,
  argv: readonly string[] = [],
  opts: RunOptions & { lang?: "AppleScript" | "JavaScript" } = {},
): Promise<string> {
  const lang = opts.lang ?? "AppleScript";
  return run(BIN.osascript, ["-l", lang, "-e", script, ARGV_SENTINEL, ...argv], opts).then((r) => r.stdout.trim());
}

/** JXA convenience: `function run(argv) { const args = argv.slice(1); … }`. */
export const jxa = (script: string, argv: readonly string[] = [], opts: RunOptions = {}) =>
  osascript(script, argv, { ...opts, lang: "JavaScript" });
