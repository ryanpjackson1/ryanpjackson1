/**
 * Stocks — live portfolio from Yahoo Finance's public chart API (no key).
 *
 * Portfolio comes from NEXUS_PORTFOLIO, a JSON array:
 *   [{"symbol":"NVDA","shares":10,"cost":420.5}, …]   (cost = per-share basis)
 * `?symbol=NVDA` answers single-ticker questions instead ("How is Nvidia today?").
 */
import { emptyPayload, type ModulePayload, type Metric } from "@/core/payload";
import type { Holding, StockQuote, StocksDetail } from "@/modules/types";
import { BROWSER_UA, errorMessage, getJSON } from "./http";

const SOURCE = "Yahoo Finance · chart v8";
const HEADERS = { "user-agent": BROWSER_UA };
/** Portfolio day drop that raises the card's warning state. */
const WARN_DAY_PCT = -3;

export interface PortfolioEntry { symbol: string; shares: number; cost: number }

/** Parse NEXUS_PORTFOLIO. Throws a message that says exactly what is wrong. */
export function parsePortfolio(raw: string): PortfolioEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("NEXUS_PORTFOLIO is not valid JSON");
  }
  if (!Array.isArray(data)) throw new Error("NEXUS_PORTFOLIO must be a JSON array");
  return data.map((row, i) => {
    const r = row as Record<string, unknown>;
    const symbol = typeof r.symbol === "string" ? r.symbol.trim().toUpperCase() : "";
    const shares = Number(r.shares);
    const cost = Number(r.cost ?? 0);
    if (!symbol || !/^[A-Z0-9.\-^=]{1,15}$/.test(symbol)) throw new Error(`NEXUS_PORTFOLIO[${i}] has no valid "symbol"`);
    if (!Number.isFinite(shares) || shares <= 0) throw new Error(`NEXUS_PORTFOLIO[${i}] (${symbol}) needs a positive "shares"`);
    if (!Number.isFinite(cost) || cost < 0) throw new Error(`NEXUS_PORTFOLIO[${i}] (${symbol}) has an invalid "cost"`);
    return { symbol, shares, cost };
  });
}

/* ─────────────────────────── Yahoo shapes ─────────────────────────── */

interface ChartResponse {
  chart: {
    result: {
      meta: {
        symbol: string;
        currency?: string;
        exchangeName?: string;
        fullExchangeName?: string;
        shortName?: string;
        longName?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        regularMarketTime?: number;
        gmtoffset?: number;
      };
      timestamp?: number[];
      indicators: { quote: { close: (number | null)[] }[] };
    }[] | null;
    error: { description?: string } | null;
  };
}

interface SearchResponse {
  quotes?: { symbol: string; sector?: string; sectorDisp?: string; quoteType?: string; typeDisp?: string }[];
}

const sectorCache = new Map<string, { sector: string; at: number }>();

/** Sector via Yahoo search; tolerant — "Unclassified" when unknown. Cached 24h in-process. */
async function sectorOf(symbol: string): Promise<string> {
  const hit = sectorCache.get(symbol);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.sector;
  let sector = "Unclassified";
  try {
    const res = await getJSON<SearchResponse>(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=5&newsCount=0`,
      { headers: HEADERS, timeoutMs: 5000, revalidate: 86_400 },
    );
    const q = res.quotes?.find((x) => x.symbol?.toUpperCase() === symbol) ?? res.quotes?.[0];
    if (q?.sector || q?.sectorDisp) sector = (q.sectorDisp ?? q.sector)!;
    else if (q?.quoteType === "ETF") sector = "ETF";
    else if (q?.quoteType === "CRYPTOCURRENCY") sector = "Crypto";
    else if (q?.quoteType === "INDEX") sector = "Index";
  } catch {
    /* tolerated */
  }
  sectorCache.set(symbol, { sector, at: Date.now() });
  return sector;
}

/** Fetch one symbol's month of daily closes and derive live price + day change. */
export async function fetchQuote(symbol: string): Promise<StockQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
  const [res, sector] = await Promise.all([
    getJSON<ChartResponse>(url, { headers: HEADERS, timeoutMs: 7000, revalidate: 20 }),
    sectorOf(symbol),
  ]);
  const r = res.chart.result?.[0];
  if (!r) throw new Error(res.chart.error?.description ?? `No data for ${symbol}`);
  const m = r.meta;
  const ts = r.timestamp ?? [];
  const rawCloses = r.indicators.quote?.[0]?.close ?? [];
  const offset = m.gmtoffset ?? 0;
  const closes = ts
    .map((t, i) => ({ t, close: rawCloses[i] }))
    .filter((p): p is { t: number; close: number } => typeof p.close === "number" && Number.isFinite(p.close))
    .map((p) => ({ date: new Date((p.t + offset) * 1000).toISOString().slice(0, 10), close: p.close }));

  const price = m.regularMarketPrice ?? closes[closes.length - 1]?.close;
  if (typeof price !== "number") throw new Error(`No price for ${symbol}`);

  // The last daily bar is the current session when it falls on the same
  // exchange-local day as regularMarketTime; yesterday's close is then the one before it.
  const marketDay = m.regularMarketTime ? new Date((m.regularMarketTime + offset) * 1000).toISOString().slice(0, 10) : undefined;
  const last = closes[closes.length - 1];
  let prevClose: number | undefined;
  if (last && marketDay && last.date === marketDay) prevClose = closes[closes.length - 2]?.close;
  else prevClose = last?.close;
  prevClose ??= m.previousClose ?? m.chartPreviousClose ?? price;

  const first = closes[0]?.close ?? m.chartPreviousClose ?? price;
  return {
    symbol: m.symbol?.toUpperCase() ?? symbol,
    name: m.longName ?? m.shortName ?? symbol,
    currency: m.currency ?? "USD",
    exchange: m.fullExchangeName ?? m.exchangeName,
    price,
    prevClose,
    dayChange: price - prevClose,
    dayChangePct: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
    closes,
    monthChangePct: first ? ((price - first) / first) * 100 : 0,
    marketTime: (m.regularMarketTime ?? Date.now() / 1000) * 1000,
    sector,
  };
}

/* ─────────────────────────── formatting ─────────────────────────── */

export function money(n: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: Math.abs(n) >= 10_000 ? 0 : 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

/* ─────────────────────────── fetchers ─────────────────────────── */

async function fetchTickerPayload(symbol: string): Promise<ModulePayload<StocksDetail>> {
  const q = await fetchQuote(symbol);
  const detail: StocksDetail = {
    mode: "ticker",
    currency: q.currency,
    holdings: [],
    totalValue: 0,
    totalCost: 0,
    totalPl: 0,
    totalPlPct: 0,
    dayChange: q.dayChange,
    dayChangePct: q.dayChangePct,
    sectors: [],
    valueSeries: q.closes.map((c) => ({ date: c.date, value: c.close })),
    ticker: q,
    failed: [],
  };
  const closes = q.closes.map((c) => c.close);
  return {
    id: "stocks",
    status: "live",
    fetchedAt: Date.now(),
    source: SOURCE,
    headline: { label: `${q.symbol} · ${q.name}`, value: money(q.price, q.currency), delta: q.dayChangePct },
    metrics: [
      { label: "Day", value: `${q.dayChange >= 0 ? "+" : ""}${q.dayChange.toFixed(2)} (${pct(q.dayChangePct)})`, delta: q.dayChangePct },
      { label: "1 month", value: pct(q.monthChangePct), delta: q.monthChangePct },
      { label: "Month high", value: money(Math.max(...closes, q.price), q.currency) },
      { label: "Month low", value: money(Math.min(...closes, q.price), q.currency) },
      { label: "Sector", value: q.sector },
    ],
    series: [...closes.slice(0, -1), q.price],
    summary: `${q.name} (${q.symbol}) is at ${money(q.price, q.currency)}, ${q.dayChangePct >= 0 ? "up" : "down"} ${Math.abs(q.dayChangePct).toFixed(2)}% today and ${pct(q.monthChangePct)} over the month.`,
    detail,
  };
}

export async function fetchStocks(req: Request): Promise<ModulePayload<StocksDetail>> {
  const symbolParam = new URL(req.url).searchParams.get("symbol")?.trim().toUpperCase();
  if (symbolParam) {
    if (!/^[A-Z0-9.\-^=]{1,15}$/.test(symbolParam)) {
      return emptyPayload("stocks", "error", SOURCE, `"${symbolParam}" is not a ticker symbol. Ask with a symbol like NVDA, AAPL or BTC-USD.`) as ModulePayload<StocksDetail>;
    }
    try {
      return await fetchTickerPayload(symbolParam);
    } catch (e) {
      return emptyPayload("stocks", "error", SOURCE, `Couldn't price ${symbolParam}: ${errorMessage(e)}. Check the symbol exists on finance.yahoo.com.`) as ModulePayload<StocksDetail>;
    }
  }

  const raw = process.env.NEXUS_PORTFOLIO?.trim();
  if (!raw) {
    return emptyPayload(
      "stocks",
      "unconfigured",
      SOURCE,
      'Set NEXUS_PORTFOLIO in .env.local to a JSON array of holdings, e.g. [{"symbol":"NVDA","shares":10,"cost":420}] (cost = your per-share cost basis).',
    ) as ModulePayload<StocksDetail>;
  }

  let entries: PortfolioEntry[];
  try {
    entries = parsePortfolio(raw);
  } catch (e) {
    return emptyPayload(
      "stocks",
      "error",
      SOURCE,
      `${errorMessage(e)}. Expected NEXUS_PORTFOLIO=[{"symbol":"NVDA","shares":10,"cost":420}] on one line in .env.local.`,
    ) as ModulePayload<StocksDetail>;
  }
  if (entries.length === 0) {
    return emptyPayload("stocks", "unconfigured", SOURCE, 'NEXUS_PORTFOLIO is an empty array — add holdings like {"symbol":"NVDA","shares":10,"cost":420}.') as ModulePayload<StocksDetail>;
  }

  // Merge duplicate symbols (weighted cost).
  const merged = new Map<string, PortfolioEntry>();
  for (const e of entries) {
    const prev = merged.get(e.symbol);
    if (!prev) merged.set(e.symbol, { ...e });
    else {
      const shares = prev.shares + e.shares;
      merged.set(e.symbol, { symbol: e.symbol, shares, cost: (prev.cost * prev.shares + e.cost * e.shares) / shares });
    }
  }
  const book = [...merged.values()];

  const settled = await Promise.allSettled(book.map((e) => fetchQuote(e.symbol)));
  const failed: StocksDetail["failed"] = [];
  const priced: { entry: PortfolioEntry; quote: StockQuote }[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") priced.push({ entry: book[i], quote: s.value });
    else failed.push({ symbol: book[i].symbol, error: errorMessage(s.reason) });
  });

  if (priced.length === 0) {
    return emptyPayload(
      "stocks",
      "error",
      SOURCE,
      `Yahoo Finance returned no prices (${failed[0]?.error ?? "unknown error"}). Check the symbols in NEXUS_PORTFOLIO and that query1.finance.yahoo.com is reachable.`,
    ) as ModulePayload<StocksDetail>;
  }

  const currency = priced[0].quote.currency;
  const totalValue = priced.reduce((s, p) => s + p.quote.price * p.entry.shares, 0);
  const holdings: Holding[] = priced.map(({ entry, quote }) => {
    const value = quote.price * entry.shares;
    const basis = entry.cost * entry.shares;
    return {
      ...quote,
      shares: entry.shares,
      cost: entry.cost,
      value,
      dayValueChange: quote.dayChange * entry.shares,
      pl: value - basis,
      plPct: basis ? ((value - basis) / basis) * 100 : 0,
      allocation: totalValue ? value / totalValue : 0,
    };
  }).sort((a, b) => b.value - a.value);

  const totalCost = holdings.reduce((s, h) => s + h.cost * h.shares, 0);
  const dayChange = holdings.reduce((s, h) => s + h.dayValueChange, 0);
  const prevValue = totalValue - dayChange;
  const dayChangePct = prevValue ? (dayChange / prevValue) * 100 : 0;
  const totalPl = totalValue - totalCost;
  const totalPlPct = totalCost ? (totalPl / totalCost) * 100 : 0;

  const sectorMap = new Map<string, number>();
  for (const h of holdings) sectorMap.set(h.sector, (sectorMap.get(h.sector) ?? 0) + h.value);
  const sectors = [...sectorMap.entries()]
    .map(([sector, value]) => ({ sector, value, weight: totalValue ? value / totalValue : 0 }))
    .sort((a, b) => b.value - a.value);

  // Portfolio value per trading day: union of dates, forward-filling each
  // symbol's close; only dates where every holding has a price.
  const dates = [...new Set(holdings.flatMap((h) => h.closes.map((c) => c.date)))].sort();
  const lookups = holdings.map((h) => new Map(h.closes.map((c) => [c.date, c.close])));
  const lastSeen: (number | undefined)[] = holdings.map(() => undefined);
  const valueSeries: StocksDetail["valueSeries"] = [];
  for (const date of dates) {
    let sum = 0;
    let complete = true;
    holdings.forEach((h, i) => {
      const c = lookups[i].get(date);
      if (c !== undefined) lastSeen[i] = c;
      if (lastSeen[i] === undefined) complete = false;
      else sum += lastSeen[i]! * h.shares;
    });
    if (complete) valueSeries.push({ date, value: sum });
  }
  // The latest point reflects the live price, not the (possibly stale) bar.
  if (valueSeries.length) valueSeries[valueSeries.length - 1] = { date: valueSeries[valueSeries.length - 1].date, value: totalValue };

  const best = [...holdings].sort((a, b) => b.dayChangePct - a.dayChangePct)[0];
  const worst = [...holdings].sort((a, b) => a.dayChangePct - b.dayChangePct)[0];
  const warning = dayChangePct <= WARN_DAY_PCT;
  const mixed = new Set(holdings.map((h) => h.currency)).size > 1;

  const metrics: Metric[] = [
    { label: "Day", value: `${dayChange >= 0 ? "+" : "−"}${money(Math.abs(dayChange), currency)} (${pct(dayChangePct)})`, delta: dayChangePct, warn: warning },
    { label: "Total P/L", value: `${totalPl >= 0 ? "+" : "−"}${money(Math.abs(totalPl), currency)} (${pct(totalPlPct)})`, delta: totalPl },
    { label: "Best today", value: `${best.symbol} ${pct(best.dayChangePct)}`, delta: best.dayChangePct },
    { label: "Worst today", value: `${worst.symbol} ${pct(worst.dayChangePct)}`, delta: worst.dayChangePct },
    { label: "Top sector", value: `${sectors[0].sector} ${(sectors[0].weight * 100).toFixed(0)}%` },
    { label: "Holdings", value: `${holdings.length}${failed.length ? ` (${failed.length} unpriced)` : ""}`, warn: failed.length > 0 },
  ];

  let summary = `Portfolio is worth ${money(totalValue, currency)}, ${dayChange >= 0 ? "up" : "down"} ${Math.abs(dayChangePct).toFixed(2)}% today; ${best.symbol} leads at ${pct(best.dayChangePct)} and ${worst.symbol} lags at ${pct(worst.dayChangePct)}.`;
  if (mixed) summary += " Holdings span several currencies and are summed without conversion.";
  if (failed.length) summary += ` Could not price ${failed.map((f) => f.symbol).join(", ")}.`;

  return {
    id: "stocks",
    status: "live",
    fetchedAt: Date.now(),
    source: SOURCE,
    headline: { label: "Portfolio", value: money(totalValue, currency), delta: dayChangePct },
    metrics,
    series: valueSeries.map((p) => p.value),
    summary,
    warning,
    detail: {
      mode: "portfolio",
      currency,
      holdings,
      totalValue,
      totalCost,
      totalPl,
      totalPlPct,
      dayChange,
      dayChangePct,
      sectors,
      valueSeries,
      failed,
    },
  };
}
