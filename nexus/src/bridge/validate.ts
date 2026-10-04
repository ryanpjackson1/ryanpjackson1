/**
 * Strict per-verb argument validation for POST /api/bridge.
 * Pure (no Node imports). Unknown keys and wrong types are rejected, so the
 * implementation table only ever sees the exact shape declared in verbs.ts.
 */
import { BRIDGE_VERBS, isBridgeVerb, type BridgeArgs, type BridgeVerb, type MediaAction } from "./verbs";

type Field =
  | { type: "string"; min?: number; max: number; optional?: boolean }
  | { type: "number"; min: number; max: number; optional?: boolean }
  | { type: "boolean"; optional?: boolean }
  | { type: "enum"; values: readonly string[]; optional?: boolean };

type Schema = Record<string, Field>;

const MEDIA_ACTIONS: readonly MediaAction[] = ["play", "pause", "toggle", "next", "previous"];

const NONE: Schema = {};

export const SCHEMAS: { [V in BridgeVerb]: Schema } = {
  launch: { app: { type: "string", min: 1, max: 80 } },
  "open-url": { url: { type: "string", min: 1, max: 4096 }, display: { type: "string", max: 60, optional: true } },
  media: { action: { type: "enum", values: MEDIA_ACTIONS } },
  volume: {
    level: { type: "number", min: 0, max: 100, optional: true },
    delta: { type: "number", min: -100, max: 100, optional: true },
    mute: { type: "boolean", optional: true },
  },
  screenshot: NONE,
  "clipboard-read": NONE,
  "clipboard-write": { text: { type: "string", max: 100_000 } },
  "hide-others": NONE,
  quit: { app: { type: "string", min: 1, max: 80 } },
  lock: NONE,
  "sleep-display": NONE,
  dnd: { on: { type: "boolean" } },
  note: { title: { type: "string", min: 1, max: 200 }, body: { type: "string", max: 20_000 } },
  reminder: { title: { type: "string", min: 1, max: 200 }, due: { type: "string", max: 64, optional: true } },
};

export type Validated =
  | { ok: true; verb: BridgeVerb; args: BridgeArgs[BridgeVerb] }
  | { ok: false; error: string };

function checkField(key: string, f: Field, v: unknown): string | null {
  if (v === undefined) return f.optional ? null : `"${key}" is required`;
  switch (f.type) {
    case "string":
      if (typeof v !== "string") return `"${key}" must be a string`;
      if (v.length < (f.min ?? 0) || v.length > f.max) return `"${key}" must be ${f.min ?? 0}–${f.max} characters`;
      if (v.includes("\0")) return `"${key}" contains a NUL byte`;
      return null;
    case "number":
      if (typeof v !== "number" || !Number.isFinite(v)) return `"${key}" must be a finite number`;
      if (v < f.min || v > f.max) return `"${key}" must be between ${f.min} and ${f.max}`;
      return null;
    case "boolean":
      return typeof v === "boolean" ? null : `"${key}" must be true or false`;
    case "enum":
      return typeof v === "string" && f.values.includes(v) ? null : `"${key}" must be one of ${f.values.join(", ")}`;
  }
}

export function validateRequest(body: unknown): Validated {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Body must be a JSON object" };
  const { verb, args, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length) return { ok: false, error: `Unknown field(s): ${Object.keys(rest).join(", ")}` };
  if (!isBridgeVerb(verb)) return { ok: false, error: `Unknown verb. Expected one of: ${BRIDGE_VERBS.join(", ")}` };
  const a = args === undefined ? {} : args;
  if (!a || typeof a !== "object" || Array.isArray(a)) return { ok: false, error: '"args" must be an object' };
  const schema = SCHEMAS[verb];
  const extra = Object.keys(a).filter((k) => !(k in schema));
  if (extra.length) return { ok: false, error: `Unknown argument(s) for ${verb}: ${extra.join(", ")}` };
  for (const [key, field] of Object.entries(schema)) {
    const err = checkField(key, field, (a as Record<string, unknown>)[key]);
    if (err) return { ok: false, error: err };
  }
  if (verb === "volume") {
    const v = a as BridgeArgs["volume"];
    if (v.level === undefined && v.delta === undefined && v.mute === undefined) {
      return { ok: false, error: "volume needs level, delta or mute" };
    }
  }
  return { ok: true, verb, args: a as BridgeArgs[BridgeVerb] };
}
