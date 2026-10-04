/**
 * Display enumeration via JXA + the Objective-C bridge (NSScreen), and the
 * coordinate conversion AppleScript window bounds need.
 */
import type { DisplayInfo } from "../verbs";
import { normalize } from "../rank";
import { jxa } from "./exec";

export interface CocoaFrame { x: number; y: number; w: number; h: number }
export interface CarbonBounds { left: number; top: number; right: number; bottom: number }

/**
 * NSScreen frames are Cocoa coordinates: origin at the BOTTOM-left of the
 * primary display, Y grows UP. AppleScript `bounds` are Carbon/Quartz global
 * coordinates: origin at the TOP-left of the primary display, Y grows DOWN.
 * Flip about the primary's height.
 */
export function cocoaToCarbon(frame: CocoaFrame, primaryHeight: number): CarbonBounds {
  const top = primaryHeight - (frame.y + frame.h);
  return { left: frame.x, top, right: frame.x + frame.w, bottom: top + frame.h };
}

/** Shrink bounds so a window doesn't sit under the menu bar or touch the bezel. */
export function inset(b: CarbonBounds, px = 24, menuBar = 38): CarbonBounds {
  return { left: b.left + px, top: b.top + menuBar, right: b.right - px, bottom: b.bottom - px };
}

// Constant JXA program. screens[0] is always the primary (menu-bar) display.
const SCREENS_JXA = `
function run(argv) {
  ObjC.import("AppKit");
  var isBuiltin = null;
  try { isBuiltin = ObjC.bindFunction("CGDisplayIsBuiltin", ["bool", ["unsigned int"]]); } catch (e) {}
  var screens = $.NSScreen.screens;
  var out = [];
  for (var i = 0; i < screens.count; i++) {
    var s = screens.objectAtIndex(i);
    var f = s.frame;
    var name = "Display " + (i + 1);
    try { name = ObjC.unwrap(s.localizedName) || name; } catch (e) {}
    var id = 0;
    try { id = ObjC.unwrap(s.deviceDescription.objectForKey("NSScreenNumber")); } catch (e) {}
    var builtin = /built-?in/i.test(name);
    if (isBuiltin && id) { try { builtin = !!$.CGDisplayIsBuiltin(id); } catch (e) {} }
    out.push({ name: name, x: f.origin.x, y: f.origin.y, w: f.size.width, h: f.size.height, builtin: builtin });
  }
  return JSON.stringify(out);
}`;

interface RawScreen { name: string; x: number; y: number; w: number; h: number; builtin: boolean }

/** Pure: raw NSScreen list → DisplayInfo[] (index 0 = primary). */
export function toDisplays(raw: readonly RawScreen[]): DisplayInfo[] {
  if (!raw.length) return [];
  const primaryHeight = raw[0].h;
  return raw.map((s, index) => ({
    index,
    name: s.name,
    spoken: s.builtin ? "on your laptop" : `on your ${s.name}`,
    primary: index === 0,
    builtin: s.builtin,
    bounds: cocoaToCarbon(s, primaryHeight),
  }));
}

export async function listDisplays(): Promise<DisplayInfo[]> {
  const out = await jxa(SCREENS_JXA);
  return toDisplays(JSON.parse(out) as RawScreen[]);
}

const ORDINALS: Record<string, number> = { first: 1, primary: 1, main: 1, second: 2, other: 2, external: 2, third: 3 };

/**
 * Choose the display for a new window.
 *   preference: a name fragment ("LG", "ultrawide"), "laptop"/"built-in",
 *   a 1-based number ("2"), or an ordinal ("second", "main").
 *   default: the first non-primary display if one exists, else the primary.
 */
export function pickTarget(displays: readonly DisplayInfo[], preference?: string): DisplayInfo | null {
  if (!displays.length) return null;
  const fallback = displays.find((d) => !d.primary) ?? displays[0];
  const p = normalize(preference ?? "")
    .replace(/^(?:on )?(?:my |the |your )?/, "")
    .replace(/ ?(?:display|monitor|screen)$/, "")
    .trim();
  if (!p) return fallback;
  if (/^(?:laptop|macbook|built ?in|internal)/.test(p)) return displays.find((d) => d.builtin) ?? displays[0];
  if (/^\d+$/.test(p)) return displays[Number(p) - 1] ?? fallback;
  if (p in ORDINALS) {
    if (p === "external" || p === "other") return displays.find((d) => !d.builtin && !d.primary) ?? displays.find((d) => !d.builtin) ?? fallback;
    return displays[ORDINALS[p] - 1] ?? fallback;
  }
  const byName = displays.find((d) => normalize(d.name).includes(p));
  return byName ?? fallback;
}
