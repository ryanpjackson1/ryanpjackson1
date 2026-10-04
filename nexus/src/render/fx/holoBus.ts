"use client";
/** Sentences for the holographic text layer (decoupled from React). */
type Fn = (s: string | null) => void;
const subs = new Set<Fn>();
export const holo = {
  sentence(s: string) { subs.forEach((f) => f(s)); },
  clear() { subs.forEach((f) => f(null)); },
  on(f: Fn) { subs.add(f); return () => { subs.delete(f); }; },
};
