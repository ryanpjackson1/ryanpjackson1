// Optional: downloads the hand-landmark model (~7.8 MB) into public/models
// so webcam tracking works without reaching Google's CDN at runtime.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const dest = join("public", "models", "hand_landmarker.task");
mkdirSync(join("public", "models"), { recursive: true });
console.log(`[nexus] downloading ${URL}`);
const res = await fetch(URL);
if (!res.ok) {
  console.error(`[nexus] download failed: HTTP ${res.status}`);
  process.exit(1);
}
writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
console.log(`[nexus] saved ${dest}`);
