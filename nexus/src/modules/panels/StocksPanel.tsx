"use client";
import { motion } from "framer-motion";
import { accentCss } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import { fmSpring } from "@/core/motion";
import type { StocksDetail, StockQuote } from "../types";
import { fmtMoney, fmtNum, fmtPct, localDate } from "../format";
import { deltaColor, Donut, Empty, HBar, LineChart, MetricGrid, PanelFrame, Section, seriesColor, STAGGER } from "./kit";

const shortDate = (k: string) => localDate(k).toLocaleDateString([], { day: "numeric", month: "short" });

export default function StocksPanel({ payload }: { payload: ModulePayload }) {
  const d = payload.detail as StocksDetail | undefined;
  return (
    <PanelFrame payload={payload}>
      {d && (d.mode === "ticker" && d.ticker ? <Ticker q={d.ticker} payload={payload} /> : <Portfolio d={d} payload={payload} />)}
    </PanelFrame>
  );
}

function Ticker({ q, payload }: { q: StockQuote; payload: ModulePayload }) {
  const values = [...q.closes.slice(0, -1).map((c) => c.close), q.price];
  return (
    <div>
      <MetricGrid metrics={payload.metrics} />
      <Section title={`${q.symbol} · 1 month`} right={q.exchange}>
        <LineChart
          id="stocks"
          values={values}
          color={deltaColor(q.monthChangePct)}
          labels={q.closes.length ? [shortDate(q.closes[0].date), "now"] : undefined}
        />
      </Section>
    </div>
  );
}

function Portfolio({ d, payload }: { d: StocksDetail; payload: ModulePayload }) {
  const cur = d.currency;
  const segs = d.holdings.map((h, i) => ({ label: h.symbol, value: h.value, color: seriesColor("stocks", i, d.holdings.length) }));
  return (
    <div className="nx-scroll max-h-[68vh] overflow-y-auto pr-1">
      <MetricGrid metrics={payload.metrics} />

      <Section title="Portfolio value · 1 month" right={fmtPct(((d.valueSeries.at(-1)?.value ?? 0) / (d.valueSeries[0]?.value || 1) - 1) * 100)}>
        <LineChart
          id="stocks"
          values={d.valueSeries.map((p) => p.value)}
          labels={d.valueSeries.length ? [shortDate(d.valueSeries[0].date), "now"] : undefined}
        />
      </Section>

      <Section title="Holdings" right={`${d.holdings.length} positions`}>
        <div className="overflow-x-auto">
          <table className="tnum w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="label text-left">
                <th className="pb-2 font-normal">Symbol</th>
                <th className="pb-2 text-right font-normal">Price</th>
                <th className="pb-2 text-right font-normal">Day</th>
                <th className="pb-2 text-right font-normal">Value</th>
                <th className="pb-2 text-right font-normal">P/L</th>
                <th className="w-[120px] pb-2 pl-4 font-normal">Alloc</th>
              </tr>
            </thead>
            <tbody>
              {d.holdings.map((h, i) => (
                <motion.tr
                  key={h.symbol}
                  className="border-t"
                  style={{ borderColor: "rgba(143,184,255,0.08)" }}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...fmSpring("reporting"), delay: i * STAGGER }}
                >
                  <td className="py-2 pr-2">
                    <div className="font-mono text-ink">{h.symbol}</div>
                    <div className="max-w-[160px] truncate text-[11px] text-dim">{h.name} · {fmtNum(h.shares, h.shares % 1 ? 2 : 0)} sh</div>
                  </td>
                  <td className="py-2 text-right">{fmtMoney(h.price, h.currency)}</td>
                  <td className="py-2 text-right font-mono" style={{ color: deltaColor(h.dayChangePct) }}>{fmtPct(h.dayChangePct)}</td>
                  <td className="py-2 text-right">{fmtMoney(h.value, h.currency)}</td>
                  <td className="py-2 text-right" style={{ color: deltaColor(h.pl) }}>
                    <div>{h.pl >= 0 ? "+" : "−"}{fmtMoney(Math.abs(h.pl), h.currency)}</div>
                    <div className="text-[11px]">{fmtPct(h.plPct, 1)}</div>
                  </td>
                  <td className="py-2 pl-4">
                    <div className="mb-1 text-[11px] text-dim">{(h.allocation * 100).toFixed(1)}%</div>
                    <HBar value={h.allocation} color={segs[i].color} delay={i * STAGGER} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.failed.length > 0 && (
          <p className="mt-3 text-[12px]" style={{ color: "var(--color-warn)" }}>
            Not priced: {d.failed.map((f) => `${f.symbol} (${f.error})`).join("; ")}
          </p>
        )}
      </Section>

      <Section title="Allocation · sector exposure">
        <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[auto_1fr]">
          <div className="flex items-center gap-5">
            <Donut
              segments={segs}
              center={
                <>
                  <span className="label">Total</span>
                  <span className="tnum text-base">{fmtMoney(d.totalValue, cur, true)}</span>
                </>
              }
            />
            <ul className="space-y-1.5 text-[12px]">
              {segs.map((s, i) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  <span className="font-mono">{s.label}</span>
                  <span className="tnum text-dim">{(d.holdings[i].allocation * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3">
            {d.sectors.length ? (
              d.sectors.map((s, i) => (
                <div key={s.sector}>
                  <div className="mb-1 flex justify-between text-[12px]">
                    <span>{s.sector}</span>
                    <span className="tnum text-dim">{(s.weight * 100).toFixed(1)}% · {fmtMoney(s.value, cur, true)}</span>
                  </div>
                  <HBar value={s.weight} color={accentCss("stocks", 0.85)} delay={i * STAGGER} height={6} />
                </div>
              ))
            ) : (
              <Empty>No sector data.</Empty>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
