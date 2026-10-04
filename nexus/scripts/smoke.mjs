// End-to-end smoke test. Builds nothing — run `npm run build` first.
// Starts `next start` itself and drives a real browser:
//   Windows: uses the installed Microsoft Edge (no download needed)
//   elsewhere: Chrome, or set NEXUS_BROWSER to a Chromium executable path
// Usage: npm run smoke
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const PORT = Number(process.env.SMOKE_PORT ?? 3210);
const BASE = `http://localhost:${PORT}`;
const SHOTS = "smoke-shots";
mkdirSync(SHOTS, { recursive: true });

const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const stopServer = () => {
  if (server.exitCode !== null) return;
  // On Windows kill the whole process tree; elsewhere SIGTERM is enough.
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else { try { server.kill(); } catch { /* already gone */ } }
};
process.on("exit", stopServer);

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not start:\n${serverLog}`);
}

function launchOptions() {
  const args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  if (process.env.NEXUS_BROWSER) return { executablePath: process.env.NEXUS_BROWSER, args };
  if (process.platform === "win32") return { channel: "msedge", args };
  return { channel: "chrome", args };
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

await waitForServer();
const browser = await chromium.launch(launchOptions());
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  const last = () => page.locator("text=Last command").locator("..").innerText();
  // A LOCKED scene renders identical frames once its springs settle — wait for that
  // before pointing at a card, exactly as a person waits for the ring to stop.
  const waitForStill = async () => {
    const clip = { x: 300, y: 150, width: 840, height: 500 };
    let prev = await page.screenshot({ clip });
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(250);
      const cur = await page.screenshot({ clip });
      if (cur.equals(prev)) return true;
      prev = cur;
    }
    return false;
  };

  // ── 3D mode ─────────────────────────────────────────────────────────
  await page.goto(BASE);
  await page.waitForSelector("canvas", { timeout: 30000 });
  await page.waitForTimeout(2500);
  check("WebGL renderer starts", (await page.locator("header").innerText()).includes("WebGL"));
  await page.screenshot({ path: join(SHOTS, "1-ring.png") });

  // stillness: two captures of the room 2 s apart are identical while LOCKED
  const clip = { x: 300, y: 150, width: 840, height: 500 };
  const a = await page.screenshot({ clip });
  await page.waitForTimeout(2000);
  const b = await page.screenshot({ clip });
  check("LOCKED by default: the room is pixel-identical over 2 s", a.equals(b));

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  check("ArrowRight dispatches ring/rotate", (await last()).includes("Keyboard · ring/rotate"));

  await page.keyboard.press("Control+k");
  check("Ctrl+K opens the launcher", await page.getByRole("dialog", { name: "Module launcher" }).isVisible());
  await page.keyboard.type("wea");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const panel = page.getByRole("dialog", { name: "Weather" });
  check("Launcher search opens the Weather panel", await panel.isVisible());
  check("Panel is labelled as demo data", (await panel.innerText()).includes("Demo data"));
  await page.screenshot({ path: join(SHOTS, "2-panel.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("Escape closes the panel", (await page.getByRole("dialog").count()) === 0);

  // mouse: click the card in front opens it; dragging a card holds it, release returns it
  await waitForStill();
  await page.mouse.click(720, 470);
  await page.waitForTimeout(600);
  check("Clicking the front card opens its panel", (await page.getByRole("dialog").count()) === 1);
  await page.keyboard.press("Escape");
  await page.mouse.move(720, 120); // park the pointer on empty space
  await waitForStill();
  const restClip = { x: 300, y: 150, width: 840, height: 500 };
  const beforeGrab = await page.screenshot({ clip: restClip });
  await page.mouse.move(720, 470);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.mouse.move(820, 420, { steps: 8 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, "3-card-held.png") });
  await page.mouse.up();
  await page.waitForTimeout(300);
  check("Dragging a card then releasing dispatches card/release", (await last()).includes("card/release"));
  check("Releasing does not open the panel", (await page.getByRole("dialog").count()) === 0);
  await page.mouse.move(720, 120);
  const settled = await waitForStill();
  const afterRelease = await page.screenshot({ clip: restClip });
  check("Released card springs back exactly to its orbit slot", settled && afterRelease.equals(beforeGrab));

  await page.keyboard.press("l");
  await page.waitForTimeout(200);
  check("L switches to DRIFT", await page.getByRole("button", { name: /DRIFT/ }).isVisible());
  await page.keyboard.press("l");

  // camera: this test browser has no camera, so the failure must be explained
  await page.getByRole("button", { name: "Enable camera" }).click();
  await page.waitForTimeout(2500);
  const status = await page.locator("#tracking-title").locator("..").locator("..").innerText();
  check("Camera failure is reported clearly", /No camera found|Permission denied|Camera busy|Not supported/.test(status), status.split("\n").slice(1, 3).join(" / "));
  await page.screenshot({ path: join(SHOTS, "4-camera-error.png") });

  // ── 2D fallback ─────────────────────────────────────────────────────
  await page.goto(`${BASE}/?renderer=2d`);
  await page.waitForTimeout(1500);
  check("2D fallback renders without a canvas", (await page.locator("canvas").count()) === 0 && (await page.locator("header").innerText()).includes("2D fallback"));
  await page.locator("main").getByRole("button", { name: /Stocks/ }).click();
  await page.waitForTimeout(1200);
  check("2D fallback opens panels", await page.getByRole("dialog", { name: "Stocks" }).isVisible());
  const opacity = await page.getByRole("dialog", { name: "Stocks" }).evaluate((el) => Number(getComputedStyle(el).opacity));
  check("Panel settles fully opaque (readable)", opacity === 1, `opacity ${opacity}`);
  await page.screenshot({ path: join(SHOTS, "5-fallback-panel.png") });

  // ── OS reduced-motion preference ────────────────────────────────────
  const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  rm.on("pageerror", (e) => errors.push(String(e)));
  await rm.goto(`${BASE}/?renderer=2d`);
  await rm.waitForTimeout(1000);
  const rmBox = rm.getByRole("checkbox", { name: "Reduce motion" });
  check("OS reduced-motion setting is honoured", (await rmBox.isChecked()) && (await rm.getByRole("button", { name: /LOCKED/ }).isDisabled()));
  await rm.close();

  check("No uncaught page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} finally {
  await browser.close();
  stopServer();
}
const ok = results.every(Boolean);
console.log(ok ? `\nAll ${results.length} smoke checks passed. Screenshots in ${SHOTS}/` : "\nSmoke test FAILED");
process.exit(ok ? 0 : 1);
