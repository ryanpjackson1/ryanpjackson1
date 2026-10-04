import { isModuleId } from "@/modules/registry";
import type { Command } from "@/commands/types";
import { AI_COMMAND_ALLOWLIST, type AICommandType } from "./types";

/**
 * The safety boundary for model output. Anything a provider returns is
 * untrusted JSON; only well-formed, allow-listed commands survive. Callers
 * then dispatch the result with source "ai".
 */
export function validateAICommand(raw: unknown): Command | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = o.type;
  if (typeof type !== "string" || !(AI_COMMAND_ALLOWLIST as readonly string[]).includes(type)) return null;
  const allowedKeys: Record<AICommandType, string[]> = {
    "ring/rotate": ["type", "steps"],
    "ring/focus": ["type", "id"],
    "module/open": ["type", "id"],
    "module/open-front": ["type"],
    "panel/close": ["type"],
    "motion/drift": ["type", "on"],
  };
  const keys = Object.keys(o);
  if (keys.some((k) => !allowedKeys[type as AICommandType].includes(k))) return null;
  switch (type as AICommandType) {
    case "ring/rotate": {
      const steps = o.steps;
      if (typeof steps !== "number" || !Number.isInteger(steps) || steps === 0 || Math.abs(steps) > 9) return null;
      return { type: "ring/rotate", steps };
    }
    case "ring/focus":
    case "module/open":
      return isModuleId(o.id) ? { type: type as "ring/focus" | "module/open", id: o.id } : null;
    case "module/open-front":
      return { type: "module/open-front" };
    case "panel/close":
      return { type: "panel/close" };
    case "motion/drift":
      if (o.on !== undefined && typeof o.on !== "boolean") return null;
      return o.on === undefined ? { type: "motion/drift" } : { type: "motion/drift", on: o.on };
  }
}
