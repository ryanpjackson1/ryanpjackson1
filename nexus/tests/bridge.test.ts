import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Never let a test spawn anything, even by accident.
vi.mock("node:child_process", () => ({
  execFile: vi.fn(() => { throw new Error("spawn attempted in test"); }),
  spawn: vi.fn(() => { throw new Error("spawn attempted in test"); }),
}));

import { BRIDGE_VERBS, type InstalledApp } from "@/bridge/verbs";
import { resolveAgainst } from "@/bridge/server/apps";
import { IMPL, allVerbsImplemented } from "@/bridge/server/verbs";
import { cocoaToCarbon, pickTarget, toDisplays } from "@/bridge/server/displays";
import { guard, guardOrigin, bridgeStatus } from "@/bridge/server/security";
import { translate } from "@/bridge/server/errors";
import { parseHttpsHandler, validateUrl } from "@/bridge/server/browser";
import { validateRequest } from "@/bridge/validate";

const APPS: InstalledApp[] = [
  "Safari", "Calculator", "Terminal", "Visual Studio Code", "Spotify", "Slack", "Figma", "Google Chrome",
  "System Settings", "Notes", "Reminders", "Music", "Adobe Photoshop 2025", "FaceTime", "Activity Monitor",
].map((name) => ({ name, path: `/Applications/${name}.app` }));

describe("app resolution / injection", () => {
  it.each([
    'Safari"; rm -rf ~; echo "',
    "$(reboot)",
    "Calculator && open -a Terminal",
    "`whoami`",
    "Safari; open -a Terminal",
    "Terminal | sh",
    "Calculator\nTerminal",
    "reboot",
    "rm -rf ~",
  ])("refuses %j", (spoken) => {
    expect(resolveAgainst(spoken, APPS)).toBeNull();
  });

  it("resolves real names", () => {
    expect(resolveAgainst("safari", APPS)?.name).toBe("Safari");
    expect(resolveAgainst("Safari.app", APPS)?.name).toBe("Safari");
    expect(resolveAgainst("  SPOTIFY! ", APPS)?.name).toBe("Spotify");
    expect(resolveAgainst("vs code", APPS)?.name).toBe("Visual Studio Code");
    expect(resolveAgainst("vsc", APPS)?.name).toBe("Visual Studio Code");
    expect(resolveAgainst("photoshop", APPS)?.name).toBe("Adobe Photoshop 2025");
    expect(resolveAgainst("chrome", APPS)?.name).toBe("Google Chrome");
    expect(resolveAgainst("calc", APPS)?.name).toBe("Calculator");
  });

  it("rejects weak matches", () => {
    expect(resolveAgainst("s", APPS)).toBeNull();
    expect(resolveAgainst("ari", APPS)).toBeNull(); // substring only
    expect(resolveAgainst("", APPS)).toBeNull();
  });

  it("launch with an injected name answers 'no such application' and spawns nothing", async () => {
    // On Linux the live scan finds no /Applications; on a Mac it finds real
    // apps. Either way the injected string must not resolve.
    const spoken = 'Safari"; rm -rf ~; echo "';
    const r = await IMPL.launch({ app: spoken });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/^There's no application called “.*” on this Mac\.$/);
    const r2 = await IMPL.quit({ app: "$(reboot)" });
    expect(r2.ok).toBe(false);
    expect(r2.message).toContain("no application called");
  });
});

describe("verb table exhaustiveness", () => {
  it("implements exactly BRIDGE_VERBS", () => {
    expect(Object.keys(IMPL).sort()).toEqual([...BRIDGE_VERBS].sort());
    expect(allVerbsImplemented()).toBe(true);
  });

  it("is a type error to omit a verb", () => {
    // Compile-time: the mapped type demands every verb.
    // @ts-expect-error — "reminder" is missing
    const partial: typeof IMPL = { ...IMPL } as Omit<typeof IMPL, "reminder">;
    expect(partial).toBeDefined();
  });
});

describe("coordinates", () => {
  const LAPTOP = { x: 0, y: 0, w: 1512, h: 982 };

  it("primary maps to itself", () => {
    expect(cocoaToCarbon(LAPTOP, 982)).toEqual({ left: 0, top: 0, right: 1512, bottom: 982 });
  });

  it("ultrawide above-left (positive Cocoa y) has negative Carbon top", () => {
    expect(cocoaToCarbon({ x: -964, y: 982, w: 3440, h: 1440 }, 982)).toEqual({ left: -964, top: -1440, right: 2476, bottom: 0 });
  });

  it("ultrawide to the right, bottom-aligned lower (negative Cocoa y)", () => {
    // Cocoa y = -200: its bottom edge sits 200pt below the laptop's bottom.
    expect(cocoaToCarbon({ x: 1512, y: -200, w: 3440, h: 1440 }, 982)).toEqual({ left: 1512, top: -258, right: 4952, bottom: 1182 });
  });

  it("toDisplays + pickTarget default to the external display", () => {
    const ds = toDisplays([
      { name: "Built-in Retina Display", ...LAPTOP, builtin: true },
      { name: "LG ULTRAWIDE", x: -964, y: 982, w: 3440, h: 1440, builtin: false },
    ]);
    expect(ds[0]).toMatchObject({ primary: true, spoken: "on your laptop" });
    expect(ds[1]).toMatchObject({ primary: false, spoken: "on your LG ULTRAWIDE", bounds: { top: -1440, bottom: 0 } });
    expect(pickTarget(ds)?.name).toBe("LG ULTRAWIDE");
    expect(pickTarget(ds, "laptop")?.builtin).toBe(true);
    expect(pickTarget(ds, "the LG")?.name).toBe("LG ULTRAWIDE");
    expect(pickTarget(ds, "1")?.index).toBe(0);
    expect(pickTarget(ds.slice(0, 1))?.primary).toBe(true);
  });
});

describe("security guard", () => {
  const req = (headers: Record<string, string>, method = "POST") =>
    new Request("http://localhost:3000/api/bridge", { method, headers: { "content-type": "application/json", ...headers } });
  const MAC = { platform: "darwin", flag: "1" };
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.NEXUS_BRIDGE; });
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXUS_BRIDGE;
    else process.env.NEXUS_BRIDGE = saved;
  });

  it("is off (404) without NEXUS_BRIDGE=1", async () => {
    delete process.env.NEXUS_BRIDGE;
    const r = guard(req({ host: "localhost:3000" }), { platform: "darwin" });
    expect(r?.status).toBe(404);
    expect(await r?.json()).toMatchObject({ ok: false, message: "Desktop bridge is off", fix: expect.stringContaining("NEXUS_BRIDGE=1") });
  });

  it("reads the env flag", () => {
    process.env.NEXUS_BRIDGE = "1";
    expect(guard(req({ host: "localhost:3000" }), { platform: "darwin" })).toBeNull();
  });

  it("is 501 off macOS", () => {
    expect(guard(req({ host: "localhost:3000" }), { platform: "linux", flag: "1" })?.status).toBe(501);
  });

  it.each(["evil.com", "localhost.evil.com", "192.168.1.10:3000", "0.0.0.0:3000", "nexus.local"])("non-loopback Host %s → 403", (host) => {
    expect(guard(req({ host }), MAC)?.status).toBe(403);
  });

  it.each(["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "localhost"])("loopback Host %s passes", (host) => {
    expect(guard(req({ host, origin: `http://${host}`, "sec-fetch-site": "same-origin" }), MAC)).toBeNull();
  });

  it("cross-origin Origin → 403", () => {
    expect(guard(req({ host: "localhost:3000", origin: "https://evil.com" }), MAC)?.status).toBe(403);
    expect(guard(req({ host: "localhost:3000", origin: "http://localhost:4000" }), MAC)?.status).toBe(403);
    expect(guard(req({ host: "localhost:3000", origin: "null" }), MAC)?.status).toBe(403);
  });

  it("cross-site Sec-Fetch-Site → 403", () => {
    expect(guard(req({ host: "localhost:3000", "sec-fetch-site": "cross-site" }), MAC)?.status).toBe(403);
    expect(guard(req({ host: "localhost:3000", "sec-fetch-site": "same-site" }), MAC)?.status).toBe(403);
  });

  it("POST must be JSON (blocks simple-request CSRF)", () => {
    expect(guard(req({ host: "localhost:3000", "content-type": "text/plain" }), MAC)?.status).toBe(415);
  });

  it("status endpoint guard still applies loopback/origin checks but reports why it's off", () => {
    expect(guardOrigin(req({ host: "evil.com" }, "GET"))?.status).toBe(403);
    expect(bridgeStatus({ platform: "darwin", flag: undefined })).toMatchObject({ enabled: false, reason: "Desktop bridge is off" });
    expect(bridgeStatus({ platform: "linux", flag: "1" })).toMatchObject({ enabled: false, platform: "linux" });
    expect(bridgeStatus({ platform: "darwin", flag: "1" })).toMatchObject({ enabled: true, reason: null });
  });
});

describe("request validation", () => {
  it("accepts well-formed requests", () => {
    expect(validateRequest({ verb: "launch", args: { app: "Spotify" } }).ok).toBe(true);
    expect(validateRequest({ verb: "lock" }).ok).toBe(true);
    expect(validateRequest({ verb: "volume", args: { delta: -10 } }).ok).toBe(true);
  });
  it.each([
    [{ verb: "shutdown", args: {} }],
    [{ verb: "launch", args: { app: 3 } }],
    [{ verb: "launch", args: { app: "Safari", path: "/bin/sh" } }],
    [{ verb: "media", args: { action: "explode" } }],
    [{ verb: "volume", args: {} }],
    [{ verb: "volume", args: { level: 400 } }],
    [{ verb: "dnd", args: { on: "yes" } }],
    [{ verb: "lock", args: {}, extra: 1 }],
    [[]],
  ])("rejects %j", (body) => {
    expect(validateRequest(body).ok).toBe(false);
  });
});

describe("urls, browsers, errors", () => {
  it("only http(s) URLs pass", () => {
    expect(validateUrl("github.com")?.href).toBe("https://github.com/");
    expect(validateUrl("javascript:alert(1)")).toBeNull();
    expect(validateUrl("file:///etc/passwd")).toBeNull();
    expect(validateUrl("https://user:pw@evil.com")).toBeNull();
  });

  it("reads the https handler from LSHandlers", () => {
    const plist = `(
    {
        LSHandlerPreferredVersions = { LSHandlerRoleAll = "-"; };
        LSHandlerRoleAll = "com.google.chrome";
        LSHandlerURLScheme = https;
    },
    {
        LSHandlerRoleAll = "com.apple.mail";
        LSHandlerURLScheme = mailto;
    }
)`;
    expect(parseHttpsHandler(plist)).toBe("com.google.chrome");
  });

  it("translates macOS permission failures to the exact setting", () => {
    expect(translate(new Error("could not create image from display")).fix).toMatch(/Privacy & Security → Screen Recording/);
    expect(translate(new Error("could not create image from display")).fix).toMatch(/not your browser/);
    expect(translate(new Error("execution error: Not authorized to send Apple events to Notes. (-1743)"), "Notes").fix).toMatch(/Automation.*allow Notes/);
    expect(translate(new Error("System Events got an error: osascript is not allowed assistive access. (-1719)")).fix).toMatch(/Accessibility/);
    expect(translate(Object.assign(new Error("spawn /usr/bin/x ENOENT"), { code: "ENOENT" })).message).toMatch(/isn't on this Mac/);
    expect(translate(Object.assign(new Error("timeout"), { killed: true })).message).toMatch(/too long/);
  });
});

describe("static safety of src/bridge/server", () => {
  const dir = path.resolve(__dirname, "../src/bridge/server");
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));

  it("has files to scan", () => expect(files.length).toBeGreaterThan(5));

  it.each(files)("%s never uses the shell-string exec or a shell option", (f) => {
    const src = readFileSync(path.join(dir, f), "utf8");
    expect(src).not.toMatch(/\bexec\(/);
    expect(src).not.toMatch(/\bexecSync\b/);
    expect(src).not.toMatch(/\{\s*exec\s*[,}]/);
    expect(src).not.toMatch(/[,{]\s*exec\s*[,}]/);
    expect(src).not.toMatch(/shell\s*:\s*true/);
  });

  it("only exec.ts imports child_process", () => {
    for (const f of files) {
      const src = readFileSync(path.join(dir, f), "utf8");
      if (f !== "exec.ts") expect(src, f).not.toMatch(/child_process/);
    }
  });

  it("no shutdown/restart/kill/delete capability", () => {
    for (const f of files) {
      const src = readFileSync(path.join(dir, f), "utf8");
      expect(src, f).not.toMatch(/to (?:shut down|restart)\b|\bkillall\b|\bpkill\b|\/sbin\/(?:shutdown|reboot)|"(?:-9|SIGKILL)"|delete (?:every|note|reminder)/i);
    }
  });
});
