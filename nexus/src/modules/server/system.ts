/**
 * System — host diagnostics from node:os and fs.statfs. The browser half
 * (battery, network, GPU, heap, FPS) is merged in by useModuleFeeds.
 */
import os from "node:os";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ModulePayload } from "@/core/payload";
import type { SystemDetail } from "@/modules/types";

const run = promisify(execFile);
const SAMPLE_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** CPU busy fraction per core between two os.cpus() snapshots. */
export function cpuUsage(a: os.CpuInfo[], b: os.CpuInfo[]): number[] {
  return b.map((cpu, i) => {
    const p = a[i]?.times;
    if (!p) return 0;
    const t = cpu.times;
    const idle = t.idle - p.idle;
    const total = t.user - p.user + (t.nice - p.nice) + (t.sys - p.sys) + (t.irq - p.irq) + idle;
    return total > 0 ? Math.max(0, Math.min(1, 1 - idle / total)) : 0;
  });
}

/**
 * macOS: os.freemem() counts only truly free pages, so memory looks ~95% used
 * all the time. Read vm_stat and count inactive/speculative/purgeable pages
 * as available, like Activity Monitor does.
 */
async function darwinAvailable(): Promise<number | undefined> {
  try {
    const { stdout } = await run("vm_stat", [], { timeout: 1500 });
    const pageSize = Number(/page size of (\d+) bytes/.exec(stdout)?.[1] ?? 4096);
    const pages = (label: string) => Number(new RegExp(`${label}:\\s+(\\d+)`).exec(stdout)?.[1] ?? 0);
    const avail = pages("Pages free") + pages("Pages inactive") + pages("Pages speculative") + pages("Pages purgeable");
    return avail > 0 ? avail * pageSize : undefined;
  } catch {
    return undefined;
  }
}

const gb = (n: number) => `${(n / 1024 ** 3).toFixed(n >= 100 * 1024 ** 3 ? 0 : 1)} GB`;
const pct = (f: number) => `${Math.round(f * 100)}%`;

export async function fetchSystem(_req: Request): Promise<ModulePayload<SystemDetail>> {
  const a = os.cpus();
  const [, stat, darwinAvail] = await Promise.all([
    sleep(SAMPLE_MS),
    fs.statfs("/").catch(() => undefined),
    process.platform === "darwin" ? darwinAvailable() : Promise.resolve(undefined),
  ]);
  const b = os.cpus();
  const perCore = cpuUsage(a, b);
  const usage = perCore.length ? perCore.reduce((s, x) => s + x, 0) / perCore.length : 0;

  const total = os.totalmem();
  const available = Math.min(total, darwinAvail ?? os.freemem());
  const used = total - available;
  const memUsage = total ? used / total : 0;

  let storage: SystemDetail["storage"];
  if (stat) {
    const sTotal = stat.blocks * stat.bsize;
    const sFree = stat.bavail * stat.bsize;
    storage = { mount: "/", total: sTotal, free: sFree, used: sTotal - sFree, usage: sTotal ? (sTotal - sFree) / sTotal : 0 };
  }

  const ifaces = os.networkInterfaces();
  const external = Object.values(ifaces).flatMap((l) => l ?? []).filter((i) => !i.internal);
  const network = {
    interfaces: Object.entries(ifaces).filter(([, l]) => (l ?? []).some((i) => !i.internal)).length,
    addresses: external.length,
  };

  const load = os.loadavg() as [number, number, number];
  const cores = b.length;
  const warning = memUsage > 0.92 || usage > 0.9;
  const uptime = os.uptime();
  const upText = uptime >= 86400 ? `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h` : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  return {
    id: "system",
    status: "live",
    fetchedAt: Date.now(),
    source: `node:os · ${os.hostname()}`,
    headline: { label: "CPU", value: pct(usage) },
    metrics: [
      { label: "Memory", value: `${pct(memUsage)} of ${gb(total)}`, warn: memUsage > 0.92 },
      { label: "Storage", value: storage ? `${gb(storage.free)} free` : "n/a", warn: !!storage && storage.usage > 0.95 },
      { label: "Load 1m", value: load[0].toFixed(2), warn: load[0] > cores * 1.5 },
      { label: "Cores", value: String(cores) },
      { label: "Uptime", value: upText },
    ],
    series: perCore.map((x) => Math.round(x * 100)),
    summary: `CPU at ${pct(usage)} across ${cores} cores, memory ${pct(memUsage)} used of ${gb(total)}${storage ? `, ${gb(storage.free)} free on disk` : ""}; up ${upText}.`,
    warning,
    detail: {
      host: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpuModel: b[0]?.model.trim() ?? "unknown",
        cores,
        uptimeSec: uptime,
        node: process.version,
      },
      cpu: { usage, perCore, load },
      memory: { total, available, used, usage: memUsage },
      storage,
      network,
    },
  };
}
