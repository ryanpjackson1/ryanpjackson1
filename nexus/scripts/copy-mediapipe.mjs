// Serve the MediaPipe WASM from our own origin so its version always
// matches the installed JS (and works offline once the model is cached).
import { cpSync, existsSync, mkdirSync } from "node:fs";
const src = "node_modules/@mediapipe/tasks-vision/wasm";
if (existsSync(src)) {
  mkdirSync("public/mediapipe", { recursive: true });
  cpSync(src, "public/mediapipe", { recursive: true });
  console.log("mediapipe wasm → public/mediapipe");
}
