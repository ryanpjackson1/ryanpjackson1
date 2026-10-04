# NEXUS — milestone 1

A spatial computing web app. Ten glass cards sit in a circular orbit in a dark room. You drive them with the mouse, the keyboard, a Ctrl+K launcher, and optionally your webcam's hand tracking.

> **Every module shows demo data.** The values are labelled samples. No account, API or live feed is connected, and no AI or voice exists yet.

## Run it on Windows (PowerShell)

Requirements: **Node.js 20.9+ (20 LTS or 22 LTS)**, Git, and a current **Edge or Chrome**.

```powershell
# 1. Install Node.js LTS once (skip if `node --version` already prints v20.9+ or v22.x).
winget install OpenJS.NodeJS.LTS
#    Close and reopen PowerShell afterwards so `node` and `npm` are on PATH.

# 2. Get the code (use a normal folder, not a OneDrive-synced one).
cd $HOME\source
git clone https://github.com/ryanpjackson1/ryanpjackson1.git
cd ryanpjackson1
git checkout claude/nexus-windows
cd nexus

# 3. Install the exact pinned dependency tree.
npm ci

# 4. Start the dev server, bound to this machine only (avoids a firewall prompt).
npm run dev -- -H localhost
```

Open **http://localhost:3000**. Stop the server with `Ctrl+C`.

**Production build:**

```powershell
npm run build
npm start -- -H localhost
```

**Common Windows issues**

| Symptom | Fix |
|---|---|
| `npm.ps1 cannot be loaded because running scripts is disabled` | Run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, or use `npm.cmd` instead of `npm` (for example `npm.cmd ci`). |
| `&&` is rejected | Windows PowerShell 5.1 has no `&&`. Run the commands on separate lines as shown, or use PowerShell 7. |
| Port 3000 already in use | `npm run dev -- -H localhost -p 3001` |
| `EPERM` / `EBUSY` errors on `.next` | The folder is being synced (OneDrive) or scanned. Move the project out of OneDrive, or stop the server, delete `.next`, and retry. |
| Camera status shows **Camera busy** | Close Teams, Zoom, OBS, the Camera app, or another browser tab using the webcam. |
| Camera status shows **Permission denied** | Allow the camera via the address-bar camera icon. Also check *Settings → Privacy & security → Camera* (“Camera access” and “Let desktop apps access your camera”). |

## Using it

| Input | Action |
|---|---|
| **← / →** | Rotate the ring |
| **Enter** or **click a card** | Open its panel |
| **1 … 9, 0** | Open module 1–10 |
| **Ctrl+K** | Searchable launcher for modules and actions (↑ ↓ Enter, Esc) |
| **Esc** | Close the innermost layer (launcher, then panel, then held card, then selection) |
| **Drag a card** | Hold it; on release it springs back to its orbit slot (no throwing) |
| **Drag empty space** | Turn the ring; it snaps to the nearest slot |
| **L** or the **LOCKED / DRIFT** pill | Ambient drift. It is **off by default** |
| **Reduce motion** checkbox | Removes spring overshoot and all drift. It follows the Windows / OS setting automatically |
| **Enable camera** (or Ctrl+K → “webcam”) | Optional MediaPipe hand tracking: **swipe** left/right rotates, **pinch** opens the card under your fingertip (or the front card) |

The camera is never started automatically. Video frames are processed locally in the browser. The first time you enable tracking, the hand model (~7.8 MB) is downloaded from Google's model CDN. To store it locally instead, run `npm run fetch-model` once.

Add `?renderer=2d` to the URL to see the 2D fallback. The app switches to it by itself when WebGL is unavailable or the GPU context is lost.

## Checks

```powershell
npm run check      # typecheck + unit tests + production build
npm run smoke      # end-to-end in a real browser (uses Microsoft Edge on Windows). Run `npm run build` first.
```

- **Unit tests (`tests/`)** cover:
  - command/state behaviour: ring maths and wrap-around, shortest-path focus, modals blocking rotation, the Escape priority chain, grab/release, drift defaulting to off, reduced motion overriding drift, the camera only starting from a person's action, and every source going through one dispatcher with a pure reducer
  - launcher ranking
  - the gesture classifier (swipe, pinch hysteresis)
  - camera-error explanations
  - spring rest-exactness and return-to-slot
  - pixel-ratio caps
  - the AI command validator
  - demo-data labelling
- **Smoke test (`scripts/smoke.mjs`)** starts the production server and drives a browser through:
  - Ctrl+K search, opening and closing panels, clicking cards
  - dragging a card and confirming it returns *pixel-exactly* to its slot
  - the room staying pixel-identical while LOCKED
  - the DRIFT toggle, camera-failure messaging, and the 2D fallback
  - panel readability and the OS reduced-motion setting

## Architecture

```
src/
  commands/   ONE typed command layer
    types.ts      Command union: every possible intent
    reducer.ts    pure (state, command, source) → patch, fully unit-tested
    dispatch.ts   dispatch(command, source): reducer → store → effects
    launcher.ts   Ctrl+K entries (each carries the Command it runs) + ranking
  state/      Zustand store (no actions; it is changed only through dispatch) + state types
  modules/    the ten-module registry + clearly labelled demo data
  render/     React Three Fiber scene: ring, glass card shader, atmosphere, camera, quality
  input/      keyboard → commands; gestures/ webcam tracker, pure classifier, error mapping
  motion/     springs named by intent; reduced-motion variants
  ui/         HUD, launcher, module panel, dock, tracking status, 2D fallback
  ai/         provider-neutral boundary, types and validator only (see below)
```

Mouse, keyboard, launcher, gestures and HUD buttons all call `dispatch(command, source)`. The HUD's **Last command** readout shows which source produced the latest command.

**Adaptive quality.** There are three tiers. The starting tier comes from device hints, and drei's `PerformanceMonitor` steps it up or down at runtime. The pixel ratio is always capped (1, 1.25 or 1.5), and the dust particle count follows the tier.

**AI boundary (not implemented).** `src/ai/types.ts` defines an `AIProvider` interface that OpenAI and Anthropic adapters will implement on the server, so keys never reach the browser. Both stream the same `AIEvent`s. Model output becomes app behaviour only via `validateAICommand()`, an allow-list that excludes the camera, and then `dispatch(cmd, "ai")`. The provider registry is empty, and there are no network calls and no voice.

## Pinned versions

Next.js 15.5.27 · React 19.2.8 · Three.js 0.186.1 · @react-three/fiber 9.8.1 · @react-three/drei 10.7.9 · Zustand 5.0.15 · Tailwind CSS 4.3.3 · TypeScript 5.9.3 · @mediapipe/tasks-vision 1.0.1. Dev only: Vitest 5.0.3 and playwright-core 1.63.0 (drives the system Edge/Chrome; no browser download). `postcss` is overridden to 8.5.28 so the copy bundled inside Next picks up current security fixes. `npm audit` reports 0 vulnerabilities.

## Limitations (milestone 1)

- **All module data is demo data.** Nothing connects to Instagram, markets, calendars, weather, news, music or system telemetry yet.
- **No AI and no voice.** Only the typed boundary and its validator exist.
- **No desktop control.** No OS scripting of any kind.
- **Gestures are minimal:** swipe left/right and pinch-to-open with a single hand. No grab-and-move by hand, no two-hand gestures, and no per-user calibration. Recognition depends on lighting and camera quality, and the thresholds are tuned against synthetic data, not a user study.
- **First camera use needs internet** to fetch the hand model, unless you ran `npm run fetch-model`. The MediaPipe WASM runtime is served locally.
- **Not yet run on a Windows machine.** Development and verification ran on Linux with a software-rendered Chromium (about 15 fps, lowest quality tier). The scripts avoid shell-specific syntax, and the smoke test selects Edge on Windows, but 60 fps, GPU behaviour and the webcam path have not been exercised on real Windows hardware.
- **Webcam tracking was only tested to the point of failing gracefully** (no camera available). A real tracking session has not been run.
- **Screen readers:** panels and the launcher are proper dialogs with focus management, and the dock gives keyboard access to every module. The 3D scene itself is decorative (`aria-hidden`), and no formal accessibility audit has been done.
- **Fonts** are system fonts (Segoe UI / Cascadia Mono on Windows) to avoid network font loading, so the look varies slightly across operating systems.
