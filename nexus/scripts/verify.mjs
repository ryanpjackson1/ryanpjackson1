// Phase verification in headless Chromium (SwiftShader WebGL).
//   node scripts/verify.mjs [url]
// Screenshots: boot → ring → presentation → each human-form phase → hand
// presenting → return. Asserts: zero drift with zero input, mouth closed in
// silence and moving with the local voice, hand-presented panel holds still.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const URL = process.argv[2] ?? "http://localhost:3100/";
const OUT = "shots";
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
// resource failures (blocked fonts / offline feeds in CI) are not page errors
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log(`shot  ${OUT}/${n}.png`); };
const wait = (ms) => page.waitForTimeout(ms);
const N = (expr, arg) => page.evaluate(expr, arg);

await page.goto(URL, { waitUntil: "networkidle" });
await wait(1500);
await shot("01-boot");
await wait(3000);
// enter without sensors (no camera/mic in CI)
await page.getByText("enter with mouse + keyboard only").click();
await wait(2500);
await shot("02-ring");

// ── zero drift: carousel angle + camera pose identical over several seconds
await page.mouse.move(720, 450);
await wait(1500);
const a = await N(() => window.__nexus.sample());
await wait(4000);
const b = await N(() => window.__nexus.sample());
check("zero drift: carousel angle", a.ring === b.ring && b.ringV === 0, `${a.ring} → ${b.ring}`);
check("zero drift: camera position+rotation", JSON.stringify(a.cam) === JSON.stringify(b.cam), JSON.stringify(b.cam?.map((x) => +x.toFixed(6))));
check("motion multiplier exactly 0 when LOCKED", b.motion === 0, String(b.motion));

// ── presentation sequence
await N(() => window.__nexus.dispatch({ kind: "open-module", id: "system" }, "keyboard"));
await wait(250); await shot("03-present-targeting");
await wait(500); await shot("04-present-approach");
await wait(1700); await shot("05-present-open");
await N(() => window.__nexus.dispatch({ kind: "close" }, "keyboard"));
await wait(1800);

// ── world change mid-cut
await N(() => window.__nexus.dispatch({ kind: "world", id: "industrial" }, "keyboard"));
await wait(800); await shot("06-world-crossover");
await wait(1500); await shot("07-world-industrial");
await N(() => window.__nexus.dispatch({ kind: "world", id: "studio" }, "keyboard"));
await wait(2000);

// ── human form: wait for the bake, then run the clock and capture each phase
await page.waitForFunction(() => window.__nexus.formController.ready, null, { timeout: 30000 });
await N(() => window.__nexus.say("Nexus, transform into a human shape"));
const phases = [[0.5, "08-command-detected"], [1.6, "09-collapsing"], [3.6, "10-particle-core"], [4.9, "11-skeleton"], [6.6, "12-humanoid-forming"], [9.6, "13-humanoid-active"]];
for (const [t, name] of phases) {
  // wait on the clock itself so slow software rendering can't skew phases
  await page.waitForFunction((tt) => window.__nexus.formClock.T >= tt, t, { timeout: 120000 }).catch(() => {});
  await N((tt) => window.__nexus.formClock.scrub(tt), t);
  await wait(400);
  await shot(name);
  const ph = await N(() => window.__nexus.formClock.phase);
  console.log(`      T=${t} phase=${ph}`);
  await N(() => { const fc = window.__nexus.formClock; fc.toHuman(); });
}
await N(() => window.__nexus.formClock.scrub(9.6));
await wait(800);

// figure holds still with zero input
await page.mouse.move(720, 450);
await wait(1500);
const f1 = await N(() => ({ s: window.__nexus.sample() }));
await wait(3000);
const f2 = await N(() => ({ s: window.__nexus.sample() }));
check("figure still: camera unchanged", JSON.stringify(f1.s.cam) === JSON.stringify(f2.s.cam));
check("figure: mouth closed in silence", f2.s.speech === 0 && f2.s.mouth === 0);
check("figure holds still: form clock settled", f1.s.T === f2.s.T && f2.s.phase === "HUMANOID_ACTIVE");

// mouth moves with the local voice (inferred level from word boundaries)
const mouthTrace = await N(async () => {
  const n = window.__nexus;
  const out = [];
  const run = n.simulateLocalSpeech("Understood. Here is your system status for this afternoon.");
  const t0 = performance.now();
  while (performance.now() - t0 < 2200) {
    out.push(n.rt.mouth);
    await new Promise((r) => requestAnimationFrame(r));
  }
  await run;
  // let the envelope release over real frames (software GL runs at a few fps)
  for (let i = 0; i < 40 && n.rt.mouth !== 0; i++) await new Promise((r) => requestAnimationFrame(r));
  out.push(n.rt.mouth);
  return out;
});
const opened = mouthTrace.filter((m) => m > 0).length;
const steps = new Set(mouthTrace.map((m) => m.toFixed(2)));
check("mouth moves with the local voice", opened > 2, `${opened}/${mouthTrace.length} frames open · steps ${[...steps].join(",")}`);
check("mouth openness held to ≤5 discrete steps", steps.size <= 5);
check("mouth closes in silence after speech", mouthTrace[mouthTrace.length - 1] === 0);

// hand presents a panel; panel must hold still once settled
await N(() => window.__nexus.dispatch({ kind: "open-module", id: "system" }, "voice"));
await wait(600); await shot("14-hand-rising");
await wait(900); await shot("15-hand-presenting");
// wait on the rig itself: the hand has let go and lowered away
await page.waitForFunction(() => window.__nexus.presenter?.stage === "idle" && window.__nexus.presenter?.released, null, { timeout: 180000 });
await wait(2500); await shot("16-panel-settled");
const r1 = await page.locator("section[aria-label='System panel']").boundingBox();
await wait(2000);
const r2 = await page.locator("section[aria-label='System panel']").boundingBox();
check("presented panel holds still once settled", r1 && r2 && r1.x === r2.x && r1.y === r2.y, JSON.stringify(r2));

// return journey (clock backward at 1.7×)
await N(() => window.__nexus.say("return to spatial mode"));
await wait(2500); await shot("17-returning");
await page.waitForFunction(() => window.__nexus.formClock.phase === "NORMAL", null, { timeout: 120000 }).catch(() => {});
await wait(800); await shot("18-ring-again");
check("returned to NORMAL", (await N(() => window.__nexus.formClock.phase)) === "NORMAL");

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
