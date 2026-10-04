/**
 * Display formatting shared by the panels. Pure, client-safe.
 * All times render in the viewer's local zone.
 */

export function fmtNum(n: number | undefined, digits = 0): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtCompact(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function fmtMoney(n: number | undefined, currency = "USD", compact = false): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : Math.abs(n) >= 10_000 ? 0 : 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Signed percentage: +1.23% / −0.40% (true minus sign). */
export function fmtPct(n: number | undefined, digits = 2): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  const s = Math.abs(n).toFixed(digits);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${s}%`;
}

export function fmtSigned(n: number, digits = 0): string {
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${s}`;
}

export function fmtBytes(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** "12s ago", "4m ago", "3h ago", "2d ago". */
export function fmtAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** "in 25m", "in 2h 05m", "now", "3h ago". */
export function fmtUntil(ms: number, now = Date.now()): string {
  const d = ms - now;
  if (Math.abs(d) < 60_000) return "now";
  if (d < 0) return fmtAgo(ms, now);
  const mins = Math.round(d / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `in ${h}h ${String(mins % 60).padStart(2, "0")}m`;
  return `in ${Math.floor(h / 24)}d ${h % 24}h`;
}

export const fmtTime = (d: Date | string | number) =>
  new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const fmtDay = (d: Date | string | number) =>
  new Date(d).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

export function fmtDuration(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec)) return "—:—";
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Local YYYY-MM-DD key for a Date. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Parse YYYY-MM-DD as a local date (not UTC). */
export function localDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
