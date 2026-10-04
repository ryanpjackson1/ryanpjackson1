"use client";
import type { Intent, IntentSource } from "./intents";
import { log } from "@/stores/nexus";

/** Placeholder until the orchestrator lands — replaced in-tree. */
export async function dispatch(intent: Intent, source: IntentSource): Promise<void> {
  log(`${source}: ${intent.kind}`);
}
