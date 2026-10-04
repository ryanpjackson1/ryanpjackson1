/**
 * AI — readiness of the assistant. No upstream call: this card reports
 * configuration only (the chat route does the talking).
 */
import type { ModulePayload } from "@/core/payload";
import type { AiDetail } from "@/modules/types";

const CAPABILITIES: Omit<AiDetail["capabilities"][number], "ready">[] = [
  { id: "knowledge", label: "Knowledge search", description: "Answers across every live module payload — portfolio, calendar, projects, news." },
  { id: "reasoning", label: "Reasoning", description: "Multi-step planning and comparisons over your data." },
  { id: "summaries", label: "Summaries", description: "Digests of news, calendar days and project activity." },
  { id: "code", label: "Code help", description: "Explains, reviews and drafts code for your repositories." },
];

export async function fetchAi(_req: Request): Promise<ModulePayload<AiDetail>> {
  const configured = !!process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const ttsModel = process.env.GEMINI_TTS_MODEL?.trim() || undefined;
  const voice = process.env.GEMINI_TTS_VOICE?.trim() || undefined;
  const capabilities = CAPABILITIES.map((c) => ({ ...c, ready: configured }));
  const hint = configured
    ? undefined
    : "Set GEMINI_API_KEY in .env.local to a Google AI Studio key (aistudio.google.com → Get API key), then restart the dev server.";

  return {
    id: "ai",
    status: configured ? "live" : "unconfigured",
    fetchedAt: Date.now(),
    source: `Google Gemini · ${model}`,
    headline: { label: configured ? "Assistant ready" : "Assistant offline", value: model },
    metrics: capabilities.map((c) => ({ label: c.label, value: c.ready ? "ready" : "needs key" })),
    summary: configured
      ? `The assistant runs on ${model} and can search your knowledge, reason, summarise and help with code.`
      : (hint as string),
    hint,
    detail: { configured, model, ttsModel, voice, capabilities },
  };
}
