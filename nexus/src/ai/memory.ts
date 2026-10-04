"use client";
/**
 * Conversation memory: the model's history, kept client-side for the
 * session (sessionStorage, guarded). Locally handled commands — like the
 * human-form transformation — are recorded on BOTH sides, so a later
 * "why did you do that" has something to refer to.
 */
export interface Turn { role: "user" | "model"; parts: { text: string }[] }

const KEY = "nexus.memory.v1";
let turns: Turn[] = [];
try { turns = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as Turn[]; } catch { turns = []; }

function persist() {
  try { sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-40))); } catch { /* storage unavailable */ }
}

export const memory = {
  history: () => turns.slice(-24),
  user(text: string) { turns.push({ role: "user", parts: [{ text }] }); persist(); },
  model(text: string) {
    const last = turns[turns.length - 1];
    if (last?.role === "model") last.parts[0].text += " " + text;
    else turns.push({ role: "model", parts: [{ text }] });
    persist();
  },
  /** A command handled locally: record the user's words and what NEXUS said/did. */
  exchange(userText: string, reply: string) { this.user(userText); this.model(reply); },
  clear() { turns = []; persist(); },
};
