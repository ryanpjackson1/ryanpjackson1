# NEXUS

A spatial operating system for the browser. A ring of holographic glass cards floats in a fogged, film-graded room; you turn it with your hands, talk to it, let it drive your Mac, and ask it to take a human shape.

```bash
cp .env.example .env.local   # add GEMINI_API_KEY etc. — everything is optional
npm install                  # also copies the MediaPipe WASM into public/
npm run dev                  # http://localhost:3000
```

Press **Enter NEXUS** (camera + microphone), or *enter with mouse + keyboard only*.

| Input | Does |
|---|---|
| Swipe ← / → | rotate the ring |
| Pinch a card / release | grab it (it lags the hand on a spring) / it returns to its slot on the orbit spring |
| Pull toward camera / push away | open / close |
| Palm held still | freeze |
| Closed hand | close the open module |
| Circle with a fingertip | wake the AI |
| Two hands pinching | zoom · second-hand pinch multi-selects · palms together/apart group/split · fast release flings the ring |
| “Nexus, …” | wake phrase, then any command or question; speak over it to interrupt |
| ⌘K / Ctrl-K | launcher: apps, websites, modules, worlds, system verbs in one ranked list |
| Mouse / keys | drag, click, wheel · ← → Enter Esc · Space wakes · **L** LOCKED/DRIFT · **H** HUD |

## Architecture

```
src/
  core/        contracts + the master clocks
    modules.ts     registry (accent hues violet → blue → cyan)
    payload.ts     ModulePayload — the one shape every data route returns
    intents.ts     Intent — everything NEXUS can be asked to do
    dispatch.ts    the orchestrator: voice, gestures, ⌘K and model tool calls all land here
    motion.ts      motion vocabulary: springs + curves named by INTENT, BOOT beat
    runtime.ts     per-frame mutable state (never triggers a React render)
    clocks/presentation.ts   Phase 6 module-open sequence (TARGETING → APPROACH → SETTLE)
    clocks/form.ts           Phase 7 human-form clock (NORMAL … HUMANOID_ACTIVE, RETURNING = same clock backward ×1.7)
  render/
    scene/     Scene, Atmosphere (backdrop, dust, shafts, floor/market grid), worlds + live blending, weather, camera rig, perf monitor
    cards/     HoloCard (glass shader, gold/warning isolation, ripple, scan line, erosion), face canvas, FUI bracket
    fx/        PostFX (bloom → DOF → film grade), GradeEffect, holographic particle text
    form/      SDFs (bust + data-authored hand), GPU bake, Poisson selection, bead shader, journey buffer, HumanForm, HandRig, controller
  gesture/     MediaPipe tracker → pure features → pure time-series classifier → intents
  voice/       recognition (wake, barge-in), speech (studio TTS or local + inferred level), command matcher
  ai/          streaming client, context, memory, tool declarations
  audio/       synthesised pad, UI sounds, spatial voice bus
  bridge/      Phase 5 desktop bridge (server/ = the only process spawner), phrases, ranking, client
  modules/     10 live data modules: server fetchers, client polling, detail panels
  hud/         HUD corners, ⌘K launcher, expanded + embodied panels, boot, gesture trails, 2D fallback
  app/         Next.js app + API routes (ai/chat, ai/tts, bridge/*, modules/[id])
```

**One clock per choreography.** Nothing animates itself. Layers read envelopes from `presentation` or `formClock` and write nothing back, so there is nothing to desynchronise. The return from human form is the same clock run backward.

**Stillness.** Ambient motion is off by default. It's gated by `rt.motion`, a 0..1 multiplier that settles over about a second and then snaps exactly to its target. Springs at rest stay at rest bit-for-bit. `scripts/verify.mjs` checks that ring angle and camera pose are *identical* across seconds of zero input.

**No physics engine.** Released cards go back to their orbit slot on the orbit spring. Phase 6 removed Rapier, along with throwing, rigid bodies and the collision floor. A two-hand "throw" now adds momentum to the orbit.

## Phase 7: the human form

“Nexus, transform into a human shape” is matched locally, with no network round-trip. NEXUS says *“Understood. Give me a moment.”* and records both sides in the model's history. The model also has a `transform_form` tool for phrasings the matcher misses.

1. **Dissolve.** Every card face is a canvas that the card's shader samples, and that same canvas is rasterised at the instant of the command. Type becomes hot fragments, charts become accent streams, and the pane becomes dim glass. Particles ride each card's world matrix, which is published every frame. A card face erodes edge-first using `nxLeave()`, which is the same GLSL its particles use to time their departure. Cards behind the user go first. Dust, light shafts and the floor follow.
2. **One buffer.** Each particle carries three keyframes (card → core → figure), and one float (clock T) moves it through them. The order is crown first, chest last, bursting out to a shell before landing.
3. **Baked figure.** The bust is a signed-distance field with broad, blended forms and nothing that sticks out. It is baked once on the GPU: hashed seeds, 28 Newton steps in a fragment shader, then 16-bit packed RGBA8 readback in three passes. Next, a chunked Poisson-disk pass picks an *exact* count with blue-noise spacing. Beads are opaque sphere impostors with curved `gl_FragDepth` and no rim term. The bead radius follows the spacing, so lower tiers get fewer, larger beads instead of gaps.
4. **Alive, not animated.** It breathes, and its head turns rigidly toward the cursor, hand or newest panel. The jaw hinges about the ear line and steps through five discrete openings driven by the speech level. Only the seam between the lips lights. The local synthesiser's level is *inferred* from word-boundary events, one pulse per syllable, with a generic cadence when a voice reports no boundaries.
5. **The hand.** It is authored as data (`HAND_DATA`), and both its SDF and its vertex-shader pose code are emitted from that data, so every knuckle is a hinge and one `curl` uniform cups or opens the hand. It is rigged from screen-space targets and materialises stochastically. It publishes a screen anchor that the DOM panel follows through motion values, and when the hand lets go the panel springs to its slot and stays there.
6. **Protections.** The tier is frozen and the perf monitor is suspended during the sequence; tier changes are applied when the ring returns. DOF and most of the vignette are released while embodied. Ring gestures are ignored. The voice moves to the face in direction only, with distance capped. Every `pow` is clamped, and the grade has a NaN guard.

## Desktop bridge (Phase 5, macOS)

The bridge is off unless `NEXUS_BRIDGE=1`, and other platforms get a clean 501. It is an RCE surface, so it's built like one:

- It uses `execFile` only, so no shell is ever spawned.
- Verbs are a closed enum with hand-written implementations. The implementation table is typed `{ [V in BridgeVerb]: … }`, so adding a verb without implementing it is a type error.
- Apps resolve against a live scan of installed apps. `Safari"; rm -rf ~` resolves to *"There's no application called … on this Mac."* (see `tests/bridge.test.ts`).
- AppleScript text is constant; user values travel only in argv.
- Requests must come over loopback, from the same origin, with a JSON body.
- There is no shutdown, restart or delete. Apps are asked to quit, never killed.

Permission errors are translated into the exact System Settings path. The grant belongs to the **terminal running `next dev`**, not to the browser.

## Configuration

Everything works with no keys at all. Modules without credentials show `unconfigured` along with the exact fix. See `.env.example` for Gemini (chat + studio voice), Instagram (`IGAA…` → graph.instagram.com, `EAA…` → graph.facebook.com + business id; the follower curve is rebuilt from daily deltas), portfolio, iCal URL, GitHub user, sports leagues and the bridge flag.

## Verify

```bash
npm test                         # unit tests (classifier, matcher, mouth, level, poisson, bridge security, ics, …)
npm run build && npm start -- -p 3100 &
node scripts/verify.mjs          # headless screenshots of every phase + stillness / mouth / panel assertions → shots/
```
