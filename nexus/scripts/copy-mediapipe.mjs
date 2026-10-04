// Copies the MediaPipe WASM runtime into public/ so it is served from our
// own origin and always matches the installed JS version. Pure Node — works
// the same in PowerShell, cmd, bash and zsh.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const src = join("node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join("public", "mediapipe");
if (existsSync(src)) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[nexus] MediaPipe WASM copied to ${dest}`);
} else {
  console.warn("[nexus] MediaPipe not installed yet; skipping WASM copy.");
}
