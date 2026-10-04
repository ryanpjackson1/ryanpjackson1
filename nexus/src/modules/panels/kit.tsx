"use client";
/**
 * Building blocks for the expanded module panels: frame (header, hint,
 * provenance footer), figures, and hand-built SVG charts that animate in with
 * named springs. No chart libraries.
 *
 * Colour rules: positive = ok/holo, negative = muted violet-red, orange ONLY
 * when something is a warning (`metric.warn` / `payload.warning`).
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { accentCss, MODULES, type ModuleId } from "@/core/modules";
import type { Metric, ModulePayload } from "@/core/payload";
import { fmSpring } from "@/core/motion";
import { fmtAgo } from "../format";

/* ─────────────────────────── tokens ─────────────────────────── */

export const POS = "var(--color-ok)";
/** Muted violet-red for losses — deliberately far from warning orange. */
export const NEG = "hsl(336, 46%, 68%)";
export const WARN = "var(--color-warn)";
export const DIM = "var(--color-dim)";
export const FAINT = "var(--color-faint)";
export const HAIRLINE = "rgba(143, 184, 255, 0.14)";
/** Per-item delay when a list of bars/rows reports in. */
export const STAGGER = 0.025;
/** Slow breathing pulse for "live" indicators. */
export const PULSE = { duration: 1.6, repeat: Infinity, ease: "easeInOut" as const };

export const deltaColor = (d: number | undefined, warn?: boolean) =>
  warn ? WARN : d === undefined || d === 0 ? DIM : d > 0 ? POS : NEG;

/* ─────────────────────────── hooks ─────────────────────────── */

/** Re-render every `ms` so relative times stay honest. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/* ─────────────────────────── frame ─────────────────────────── */

const STATUS_COLOR: Record<ModulePayload["status"], string> = {
  live: POS,
  stale: DIM,
  unconfigured: DIM,
  error: WARN,
};

export function StatusPill({ status }: { status: ModulePayload["status"] }) {
  const c = STATUS_COLOR[status];
  return (
    <span className="label inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5" style={{ borderColor: HAIRLINE, color: c }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: status === "live" ? `0 0 8px ${c}` : undefined }} />
      {status}
    </span>
  );
}

/** Prominent fix-it block for unconfigured/error payloads. */
export function HintBlock({ payload }: { payload: ModulePayload }) {
  if (!payload.hint) return null;
  const isError = payload.status === "error";
  return (
    <div
      className="rounded-md border px-4 py-3"
      style={{ borderColor: isError ? "rgba(255,138,61,0.35)" : HAIRLINE, background: isError ? "rgba(255,138,61,0.06)" : "rgba(143,184,255,0.05)" }}
      role={isError ? "alert" : "note"}
    >
      <div className="label mb-1.5" style={{ color: isError ? WARN : "var(--color-holo)" }}>
        {payload.status === "unconfigured" ? "Setup needed" : payload.status === "error" ? "Unavailable — how to fix" : "Note"}
      </div>
      <p className="text-[13px] leading-relaxed text-ink select-text">{payload.hint}</p>
    </div>
  );
}

export function Footer({ payload }: { payload: ModulePayload }) {
  const now = useNow();
  return (
    <div className="label mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: HAIRLINE, color: FAINT }}>
      <span className="normal-case tracking-normal" style={{ letterSpacing: "0.04em" }}>
        SRC · {payload.source}
      </span>
      <span className="tnum">updated {fmtAgo(payload.fetchedAt, now)}{payload.status === "stale" ? " · stale" : ""}</span>
    </div>
  );
}

/**
 * Standard panel layout. Renders the header (code, label, status, headline),
 * the hint when relevant, `children` only when there is detail to show, and
 * the provenance footer. Caller supplies the outer glass container.
 */
export function PanelFrame({ payload, children, aside }: { payload: ModulePayload; children?: ReactNode; aside?: ReactNode }) {
  const meta = MODULES[payload.id];
  const accent = accentCss(payload.id);
  const hasDetail = payload.detail !== undefined && (payload.status === "live" || payload.status === "stale");
  const h = payload.headline;
  return (
    <div className="w-full max-w-[760px] text-ink">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="label flex items-center gap-2">
            <span style={{ color: accent }}>{meta.code}</span>
            <span>{meta.label}</span>
          </div>
          <div className="label mt-3 truncate normal-case tracking-[0.08em]">{h.label}</div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="tnum text-[40px] font-light leading-none tracking-tight" style={{ color: payload.warning ? WARN : "var(--color-holo-hi)" }}>
              {h.value}
            </span>
            {h.delta !== undefined && <Delta value={h.delta} suffix={payload.id === "stocks" ? "%" : ""} className="text-base" />}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusPill status={payload.status} />
          {aside}
        </div>
      </header>

      {(payload.status === "unconfigured" || payload.status === "error" || payload.hint) && (
        <div className="mb-5">
          <HintBlock payload={payload} />
        </div>
      )}

      {hasDetail && children}
      {!hasDetail && payload.status !== "unconfigured" && payload.status !== "error" && (
        <p className="text-sm text-dim">{payload.summary}</p>
      )}

      <Footer payload={payload} />
    </div>
  );
}

/* ─────────────────────────── figures ─────────────────────────── */

export function Delta({ value, suffix = "", digits = 2, className = "", warn }: { value: number; suffix?: string; digits?: number; className?: string; warn?: boolean }) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const text = suffix === "%" ? abs.toFixed(digits) : abs.toLocaleString("en-US", { maximumFractionDigits: digits });
  return (
    <span className={`tnum font-mono ${className}`} style={{ color: deltaColor(value, warn) }}>
      {value > 0 ? "▲" : value < 0 ? "▼" : "•"} {sign}{text}{suffix}
    </span>
  );
}

export function Stat({ label, value, delta, warn, sub, big }: { label: string; value: ReactNode; delta?: number; warn?: boolean; sub?: ReactNode; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="label truncate">{label}</div>
      <div
        className={`tnum mt-1 truncate ${big ? "text-2xl font-light" : "text-[17px]"}`}
        style={{ color: warn ? WARN : delta !== undefined ? deltaColor(delta) : "var(--color-ink)" }}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-dim">{sub}</div>}
    </div>
  );
}

/** Grid of payload metrics (warn → orange; delta → green / violet-red). */
export function MetricGrid({ metrics, cols = 3 }: { metrics: Metric[]; cols?: 2 | 3 | 4 }) {
  if (!metrics.length) return null;
  const grid = cols === 4 ? "sm:grid-cols-4" : cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";
  return (
    <div className={`grid grid-cols-2 gap-x-6 gap-y-4 ${grid}`}>
      {metrics.map((m, i) => (
        <motion.div key={m.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...fmSpring("reporting"), delay: i * STAGGER }}>
          <Stat label={m.label} value={m.value} delta={m.delta} warn={m.warn} />
        </motion.div>
      ))}
    </div>
  );
}

export function Section({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mt-6 border-t pt-4 ${className}`} style={{ borderColor: HAIRLINE }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="label">{title}</h3>
        {right && <div className="label normal-case tracking-[0.06em]">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-[13px] text-dim">{children}</p>;
}

/* ─────────────────────────── charts ─────────────────────────── */

function extent(values: number[], pad = 0.06): [number, number] {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) { lo -= 1; hi += 1; }
  const p = (hi - lo) * pad;
  return [lo - p, hi + p];
}

/**
 * Line (+ optional area) chart drawn with a pathLength reveal.
 * Uses a fixed viewBox scaled uniformly to the container width.
 */
export function LineChart({
  values,
  id,
  height = 140,
  width = 760,
  color,
  area = true,
  domain,
  labels,
  marker = true,
}: {
  values: number[];
  id: ModuleId;
  height?: number;
  width?: number;
  color?: string;
  area?: boolean;
  domain?: [number, number];
  /** Optional [first, last] axis labels. */
  labels?: [string, string];
  marker?: boolean;
}) {
  const gid = useId().replace(/:/g, "");
  if (values.length < 2) return <Empty>Not enough history to draw a chart yet.</Empty>;
  const stroke = color ?? accentCss(id);
  const [lo, hi] = domain ?? extent(values);
  const padY = 8;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => padY + (1 - (v - lo) / (hi - lo)) * (height - padY * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const fill = `${d} L${width},${height} L0,${height} Z`;
  const last = values[values.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full overflow-visible" role="img" aria-label="trend chart">
        <defs>
          <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={width} y1={height * f} y2={height * f} stroke={HAIRLINE} strokeDasharray="2 6" />
        ))}
        {area && (
          <motion.path d={fill} fill={`url(#g${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...fmSpring("arriving"), delay: 0.2 }} />
        )}
        <motion.path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={fmSpring("reporting")}
        />
        {marker && (
          <motion.circle
            cx={x(values.length - 1)}
            cy={y(last)}
            r={4}
            fill={stroke}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ ...fmSpring("acknowledging"), delay: 0.35 }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        )}
      </svg>
      {labels && (
        <div className="label mt-1 flex justify-between normal-case tracking-[0.06em]" style={{ color: FAINT }}>
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

/** Vertical bars growing from the baseline with the reporting spring. */
export function Bars({
  values,
  id,
  height = 80,
  width = 760,
  max,
  color,
  colors,
  gap = 0.28,
}: {
  values: number[];
  id: ModuleId;
  height?: number;
  width?: number;
  max?: number;
  color?: string;
  colors?: string[];
  gap?: number;
}) {
  if (!values.length) return null;
  const top = max ?? Math.max(1, ...values);
  const slot = width / values.length;
  const bw = slot * (1 - gap);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label="bar chart">
      {values.map((v, i) => {
        const h = Math.max(v > 0 ? 1.5 : 0, (v / top) * height);
        return (
          <motion.rect
            key={i}
            x={i * slot + (slot - bw) / 2}
            y={height - h}
            width={bw}
            height={h}
            rx={Math.min(2, bw / 2)}
            fill={colors?.[i] ?? color ?? accentCss(id, 0.75)}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ ...fmSpring("reporting"), delay: i * STAGGER }}
            style={{ transformBox: "fill-box", transformOrigin: "bottom" }}
          />
        );
      })}
    </svg>
  );
}

/** Horizontal bar (0..1) that grows in. */
export function HBar({ value, color, delay = 0, height = 4 }: { value: number; color: string; delay?: number; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height, background: "rgba(143,184,255,0.08)" }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color, originX: 0 }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: Math.max(0, Math.min(1, value)) }}
        transition={{ ...fmSpring("reporting"), delay }}
      />
    </div>
  );
}

/** Progress ring 0..1 with a centred figure. */
export function Ring({
  value,
  label,
  center,
  sub,
  color,
  warn,
  size = 132,
  delay = 0,
}: {
  value: number;
  label: string;
  center: ReactNode;
  sub?: ReactNode;
  color: string;
  warn?: boolean;
  size?: number;
  delay?: number;
}) {
  const r = 52;
  const stroke = warn ? WARN : color;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx={60} cy={60} r={r} fill="none" stroke="rgba(143,184,255,0.1)" strokeWidth={6} />
          <motion.circle
            cx={60}
            cy={60}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={6}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: Math.max(0.001, Math.min(1, value)) }}
            transition={{ ...fmSpring("reporting"), delay }}
            style={{ filter: `drop-shadow(0 0 6px ${stroke})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum text-2xl font-light" style={{ color: warn ? WARN : "var(--color-ink)" }}>{center}</span>
          {sub && <span className="tnum mt-0.5 text-[10px] text-dim">{sub}</span>}
        </div>
      </div>
      <div className="label mt-2">{label}</div>
    </div>
  );
}

/** Donut of segments; each arc draws in after the previous. */
export function Donut({ segments, size = 168, center }: { segments: { label: string; value: number; color: string }[]; size?: number; center?: ReactNode }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 50;
  const gapFrac = segments.length > 1 ? 0.006 : 0;
  let acc = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="h-full w-full">
        <circle cx={60} cy={60} r={r} fill="none" stroke="rgba(143,184,255,0.08)" strokeWidth={12} />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const start = acc;
          acc += frac;
          return (
            <motion.circle
              key={s.label}
              cx={60}
              cy={60}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={12}
              transform={`rotate(${start * 360 - 90} 60 60)`}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: Math.max(0.001, frac - gapFrac) }}
              transition={{ ...fmSpring("reporting"), delay: i * STAGGER * 3 }}
            />
          );
        })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
}

/** Accent ramp for categorical series within one module's hue family. */
export function seriesColor(id: ModuleId, i: number, n: number): string {
  const base = MODULES[id].hue;
  // Spread ±50° around the module hue, staying in the violet→cyan band (never near orange).
  const spread = n > 1 ? -50 + (100 * i) / (n - 1) : 0;
  const hue = Math.max(180, Math.min(290, base + spread));
  return `hsla(${hue}, 78%, ${68 - (i % 2) * 10}%, 0.95)`;
}

/** External link that always opens in a new tab safely. */
export function Ext({ href, children, className = "", title }: { href: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`hover:text-holo-hi focus-visible:text-holo-hi ${className}`} title={title}>
      {children}
    </a>
  );
}
