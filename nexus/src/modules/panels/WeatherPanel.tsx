"use client";
import { motion } from "framer-motion";
import { accentCss } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import { fmSpring } from "@/core/motion";
import type { WeatherCondition, WeatherDetail } from "../types";
import { localDate } from "../format";
import { Bars, HAIRLINE, LineChart, MetricGrid, PanelFrame, Section, STAGGER } from "./kit";

/** Minimal line glyphs per condition (24×24, stroke = currentColor). */
function Glyph({ c, size = 22 }: { c: WeatherCondition; size?: number }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const cloud = <path {...p} d="M7 17h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 17z" />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {c === "sun" && (
        <>
          <circle {...p} cx={12} cy={12} r={4} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} {...p} x1={12} y1={3} x2={12} y2={5} transform={`rotate(${a} 12 12)`} />
          ))}
        </>
      )}
      {c === "clouds" && cloud}
      {c === "rain" && (<>{cloud}<path {...p} d="M9 20l-1 2M13 20l-1 2M17 20l-1 2" /></>)}
      {c === "snow" && (<>{cloud}<path {...p} d="M9 21h.01M13 21h.01M17 21h.01" strokeWidth={2.5} /></>)}
      {c === "fog" && <path {...p} d="M4 9h16M6 13h12M4 17h16" />}
      {c === "storm" && (<>{cloud}<path {...p} d="M13 17l-2 3h3l-2 3" /></>)}
    </svg>
  );
}

export default function WeatherPanel({ payload }: { payload: ModulePayload }) {
  const d = payload.detail as WeatherDetail | undefined;
  return (
    <PanelFrame
      payload={payload}
      aside={
        d && (
          <span className="flex items-center gap-2 text-holo">
            <Glyph c={d.condition} />
            <span className="label">{d.condition} · {Math.round(d.intensity * 100)}%</span>
          </span>
        )
      }
    >
      {d && <WeatherBody d={d} payload={payload} />}
    </PanelFrame>
  );
}

function WeatherBody({ d, payload }: { d: WeatherDetail; payload: ModulePayload }) {
  const hourLabel = (iso: string) => iso.slice(11, 13);
  const lo = Math.min(...d.daily.map((x) => x.min));
  const hi = Math.max(...d.daily.map((x) => x.max));
  const span = hi - lo || 1;
  const t = (n: number) => `${Math.round(n)}°`;

  return (
    <div className="nx-scroll max-h-[68vh] overflow-y-auto pr-1">
      <p className="mb-4 text-[13px] text-dim">
        {d.current.description} · {d.isDay ? "day" : "night"}
        {d.location.approximate && " · location estimated from your IP — allow browser location for precision"}
      </p>
      <MetricGrid metrics={payload.metrics} />

      <Section title="Next 24 hours" right={`${t(Math.min(...d.hourly.map((h) => h.temperature)))} – ${t(Math.max(...d.hourly.map((h) => h.temperature)))}`}>
        <LineChart id="weather" values={d.hourly.map((h) => h.temperature)} height={120} />
        <div className="mt-2">
          <div className="label mb-1 normal-case tracking-[0.06em]">Precipitation probability</div>
          <Bars id="weather" values={d.hourly.map((h) => h.precipProbability)} max={100} height={44} color="hsla(200, 85%, 66%, 0.7)" />
        </div>
        <div className="tnum mt-1 flex justify-between font-mono text-[10px] text-faint">
          {d.hourly.filter((_, i) => i % 3 === 0).map((h) => <span key={h.time}>{hourLabel(h.time)}</span>)}
        </div>
      </Section>

      <Section title="7 days" right={d.timezone}>
        <ul className="space-y-2">
          {d.daily.map((day, i) => {
            const date = localDate(day.date);
            return (
              <motion.li
                key={day.date}
                className="grid grid-cols-[56px_28px_1fr_40px_1fr_40px] items-center gap-2 border-b pb-2 text-[13px] last:border-0"
                style={{ borderColor: HAIRLINE }}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...fmSpring("reporting"), delay: i * STAGGER }}
              >
                <span className="label">{i === 0 ? "Today" : date.toLocaleDateString([], { weekday: "short" })}</span>
                <span className="text-holo"><Glyph c={day.condition} size={18} /></span>
                <span className="truncate text-[12px] text-dim">{day.description}</span>
                <span className="tnum text-right text-dim">{t(day.min)}</span>
                <div className="relative h-1 rounded-full" style={{ background: "rgba(143,184,255,0.08)" }}>
                  <motion.div
                    className="absolute inset-y-0 rounded-full"
                    style={{ left: `${((day.min - lo) / span) * 100}%`, width: `${((day.max - day.min) / span) * 100}%`, background: accentCss("weather"), originX: 0 }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ ...fmSpring("reporting"), delay: i * STAGGER }}
                  />
                </div>
                <span className="tnum text-ink">{t(day.max)}</span>
              </motion.li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
