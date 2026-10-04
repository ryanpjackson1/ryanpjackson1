import type { ModuleId } from "./modules";

/**
 * The contract every module data route returns (GET /api/modules/<id>).
 * The card face, the embodied panel and the AI context all read this one
 * shape; module-specific richness lives in `detail`.
 */
export type PayloadStatus = "live" | "stale" | "unconfigured" | "error";

export interface Metric {
  label: string;
  value: string;
  /** Signed change used for colouring; never colours orange unless `warn`. */
  delta?: number;
  warn?: boolean;
}

export interface ModulePayload<D = unknown> {
  id: ModuleId;
  status: PayloadStatus;
  /** ms epoch the upstream data was fetched. */
  fetchedAt: number;
  /** Provenance, e.g. "Yahoo Finance · chart v8". */
  source: string;
  /** The one number a person across the room could quote. */
  headline: { label: string; value: string; delta?: number };
  /** Up to ~6 secondary figures. */
  metrics: Metric[];
  /** Normalised-or-raw series for a sparkline (oldest → newest). */
  series?: number[];
  /** One or two plain sentences, also fed to the model as context. */
  summary: string;
  /** When status is unconfigured/error: exactly what to do about it. */
  hint?: string;
  /** Raises the card's warning state (orange). Gates gold off entirely. */
  warning?: boolean;
  detail?: D;
}

export function emptyPayload(id: ModuleId, status: PayloadStatus, source: string, hint: string): ModulePayload {
  return {
    id,
    status,
    fetchedAt: Date.now(),
    source,
    headline: { label: status === "unconfigured" ? "Not configured" : "Unavailable", value: "—" },
    metrics: [],
    summary: hint,
    hint,
  };
}
