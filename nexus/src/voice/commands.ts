import { MODULES, MODULE_IDS, type ModuleId } from "@/core/modules";
import { WORLDS, WORLD_IDS, type WorldId } from "@/render/scene/worlds";
import type { Intent } from "@/core/intents";

/**
 * Local command matcher. Runs BEFORE any network: the transformation
 * phrasings especially must act within a breath, not a round-trip.
 * Returns null when the utterance should go to the model.
 */
export const norm = (s: string) =>
  s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9.' ]+/g, " ").replace(/\s+/g, " ").trim();

const HUMAN = [
  /\b(transform|turn|change|morph|shift)\b.*\b(into|to)\b.*\b(human|person|humanoid|body|figure)\b/,
  /\bbecome (a )?(human|humanoid|person)\b/,
  /\bhuman (shape|form|mode)\b/,
  /\btake (a )?(human|physical) (shape|form)\b/,
];
const SPATIAL = [
  /\breturn to (the )?(spatial|ring|cards?)( mode)?\b/,
  /\b(back|go back) to (the )?(spatial|ring|cards?)( mode)?\b/,
  /\bspatial (mode|form)\b/,
  /\b(transform|turn|change) back\b/,
];

export function matchTransform(text: string): "human" | "spatial" | null {
  const t = norm(text);
  if (SPATIAL.some((r) => r.test(t))) return "spatial";
  if (HUMAN.some((r) => r.test(t))) return "human";
  return null;
}

function findModule(t: string): ModuleId | null {
  // longest alias first so "instagram" beats "ig" etc.
  const pairs = MODULE_IDS.flatMap((id) => MODULES[id].aliases.map((a) => [a, id] as const)).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, id] of pairs) if (new RegExp(`\\b${alias}\\b`).test(t)) return id;
  return null;
}

function findWorld(t: string): WorldId | null {
  for (const id of WORLD_IDS) {
    const name = WORLDS[id].name.toLowerCase();
    if (t.includes(name) || t.includes(id)) return id;
  }
  if (/\bobservatory\b/.test(t)) return "observatory";
  if (/\b(industrial|command center|deck)\b/.test(t)) return "industrial";
  if (/\b(ocean|water|sea)\b/.test(t)) return "ocean";
  if (/\bfog\b/.test(t)) return "fog";
  if (/\blab\b/.test(t)) return "lab";
  if (/\bstudio\b/.test(t)) return "studio";
  return null;
}

export function matchCommand(text: string): Intent | null {
  const t = norm(text).replace(/^(hey |ok |okay )?nexus[, ]*/, "").replace(/\bplease\b/g, "").trim();
  if (!t) return null;
  const tf = matchTransform(t);
  if (tf) return { kind: "transform", to: tf };

  if (/^(rotate|turn|spin|go|move)( the (ring|carousel|cards))? left\b|^(previous|back)( card)?$/.test(t)) return { kind: "rotate", dir: -1 };
  if (/^(rotate|turn|spin|go|move)( the (ring|carousel|cards))? right\b|^next( card)?$/.test(t)) return { kind: "rotate", dir: 1 };
  if (/^(close|collapse|dismiss|minimi[sz]e|go back|back|hide (it|this|that))( (it|this|that|the (panel|module|card)))?$/.test(t)) return { kind: "close" };
  if (/\b(hold still|stay still|lock (the )?(scene|room|view)|stop (drifting|moving)|freeze (the )?(scene|room))\b/.test(t)) return { kind: "drift", on: false };
  if (/\b(start drifting|let it (drift|float)|drift mode|float(ing)? mode|unlock (the )?(scene|room|view))\b/.test(t)) return { kind: "drift", on: true };
  if (/\b(hide|turn off) (the )?hud\b/.test(t)) return { kind: "hud", on: false };
  if (/\b(show|turn on) (the )?hud\b/.test(t)) return { kind: "hud", on: true };

  if (/\b(switch|change|go|take me|move)\b.*\b(world|environment|room|scene|to)\b/.test(t) || /^(environment|world) /.test(t)) {
    const w = findWorld(t);
    if (w) return { kind: "world", id: w };
  }

  // "what's my schedule" → calendar; "show projects" → projects …
  if (/\b(what'?s|what is) (on )?my (schedule|agenda|calendar|day)\b/.test(t)) return { kind: "open-module", id: "calendar" };
  const open = /^(open|show( me)?|bring up|pull up|go to|launch|display|let'?s see|view)\b/.test(t);
  if (open) {
    // "open stocks" is a module; "open spotify" is an app — bridge phrases decide those.
    const rest = t.replace(/^(open|show( me)?|bring up|pull up|go to|launch|display|let'?s see|view)( (the|my))?\s*/, "");
    const id = findModule(rest);
    const words = rest.split(" ").filter(Boolean);
    if (id && words.length <= 3 && !/\.\w{2,}$/.test(rest) && !/^(my )?(reels?|profile|posts?|latest post)$/.test(rest)) return { kind: "open-module", id };
  }
  return null;
}
