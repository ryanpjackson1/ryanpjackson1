"use client";
import type { ReactNode } from "react";
import { accentCss } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import { useNexus } from "@/stores/nexus";
import type { SystemDetail } from "../types";
import { fmtBytes } from "../format";
import { Bars, HAIRLINE, PanelFrame, Ring, Section } from "./kit";

const pct = (f: number) => `${Math.round(f * 100)}`;

function Row({ k, v, warn }: { k: string; v: ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-1.5 text-[13px] last:border-0" style={{ borderColor: HAIRLINE }}>
      <span className="label">{k}</span>
      <span className="tnum min-w-0 truncate text-right" style={{ color: warn ? "var(--color-warn)" : undefined }} title={typeof v === "string" ? v : undefined}>{v}</span>
    </div>
  );
}

function uptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

export default function SystemPanel({ payload }: { payload: ModulePayload }) {
  const d = payload.detail as SystemDetail | undefined;
  return <PanelFrame payload={payload}>{d && <SystemBody d={d} />}</PanelFrame>;
}

function SystemBody({ d }: { d: SystemDetail }) {
  // FPS and GPU are read live from the store — they change faster than the poll.
  const fps = useNexus((s) => s.fps);
  const gpu = useNexus((s) => s.gpu);
  const c = d.client;
  const accent = accentCss("system");
  const batt = c?.battery;
  const lowBatt = !!batt && batt.level < 0.15 && !batt.charging;

  return (
    <div className="nx-scroll max-h-[68vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Ring label="CPU" value={d.cpu.usage} center={`${pct(d.cpu.usage)}%`} sub={`${d.host.cores} cores`} color={accent} warn={d.cpu.usage > 0.9} />
        <Ring label="Memory" value={d.memory.usage} center={`${pct(d.memory.usage)}%`} sub={`${fmtBytes(d.memory.used)} / ${fmtBytes(d.memory.total)}`} color={accent} warn={d.memory.usage > 0.92} delay={0.05} />
        {d.storage ? (
          <Ring label="Storage" value={d.storage.usage} center={`${pct(d.storage.usage)}%`} sub={`${fmtBytes(d.storage.free)} free`} color={accent} warn={d.storage.usage > 0.95} delay={0.1} />
        ) : (
          <Ring label="Storage" value={0} center="—" sub="unavailable" color={accent} />
        )}
        {batt ? (
          <Ring label="Battery" value={batt.level} center={`${pct(batt.level)}%`} sub={batt.charging ? "charging" : "on battery"} color={accent} warn={lowBatt} delay={0.15} />
        ) : (
          <Ring label="Battery" value={0} center="—" sub="not reported" color={accent} />
        )}
      </div>

      <Section title="Per-core load" right={`load ${d.cpu.load.map((l) => l.toFixed(2)).join(" · ")}`}>
        <Bars id="system" values={d.cpu.perCore.map((x) => x * 100)} max={100} height={56} />
      </Section>

      <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        <Section title="Render">
          <Row k="GPU" v={gpu && gpu !== "—" ? gpu : "not reported yet"} />
          <Row k="FPS" v={Math.round(fps)} warn={fps < 30} />
          <Row k="JS heap" v={c?.heap ? `${fmtBytes(c.heap.used)} / ${fmtBytes(c.heap.limit)}` : "not exposed by this browser"} />
        </Section>
        <Section title="Network">
          <Row k="Type" v={c?.connection?.effectiveType?.toUpperCase() ?? "not exposed"} />
          <Row k="Downlink" v={c?.connection?.downlink !== undefined ? `${c.connection.downlink} Mb/s` : "—"} />
          <Row k="RTT" v={c?.connection?.rtt !== undefined ? `${c.connection.rtt} ms` : "—"} />
          <Row k="Interfaces" v={`${d.network.interfaces} up · ${d.network.addresses} addr`} />
        </Section>
      </div>

      <Section title="Host">
        <Row k="Machine" v={d.host.hostname} />
        <Row k="CPU" v={d.host.cpuModel} />
        <Row k="OS" v={`${d.host.platform} ${d.host.release} · ${d.host.arch}`} />
        <Row k="Uptime" v={uptime(d.host.uptimeSec)} />
        <Row k="Runtime" v={`Node ${d.host.node}`} />
      </Section>
    </div>
  );
}
