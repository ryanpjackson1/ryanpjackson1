import type { AIProvider, AIProviderId } from "./types";

/**
 * Provider registry. EMPTY in this milestone: no AI is implemented and no
 * network call is made. Adapters for OpenAI and Anthropic will register
 * here (server-side) in a later milestone.
 */
const registry = new Map<AIProviderId, AIProvider>();

export function registerProvider(p: AIProvider) { registry.set(p.id, p); }
export function getProvider(id: AIProviderId): AIProvider | null { return registry.get(id) ?? null; }
export function listProviders(): AIProvider[] { return [...registry.values()]; }
