import { FUNCTION_DECLARATIONS, SYSTEM_PROMPT, CLIENT_TOOLS, type ClientTool } from "@/ai/tools";
import { MODULE_IDS, type ModuleId } from "@/core/modules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streaming chat. Proxies Gemini streamGenerateContent (SSE) and runs the
 * function-calling loop server-side:
 *   text parts      → `data: {"type":"text","text":…}` immediately (word by word)
 *   client tools    → `data: {"type":"action",…}`  (the browser moves the UI)
 *   server tools    → executed here, result fed back to the model
 * The key never leaves the server.
 */
interface Part { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: unknown; thought?: boolean }
interface Content { role: "user" | "model"; parts: Part[] }

const enc = new TextEncoder();

async function serverTool(name: string, args: Record<string, unknown>, origin: string): Promise<unknown> {
  try {
    if (name === "get_ticker") {
      const sym = String(args.symbol ?? "").toUpperCase().replace(/[^A-Z.\-^=]/g, "").slice(0, 12);
      const r = await fetch(`${origin}/api/modules/stocks?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
      return await r.json();
    }
    if (name === "get_module_data") {
      const id = String(args.module) as ModuleId;
      if (!MODULE_IDS.includes(id)) return { error: "unknown module" };
      const r = await fetch(`${origin}/api/modules/${id}`, { cache: "no-store" });
      const p = await r.json();
      // keep the model's context lean
      const s = JSON.stringify(p);
      return s.length > 14000 ? { ...p, detail: undefined, note: "detail truncated", summary: p.summary } : p;
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  return { error: "unknown tool" };
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const body = (await req.json().catch(() => null)) as { history?: Content[]; message?: string; context?: string } | null;
  if (!body?.message) return Response.json({ error: "message required" }, { status: 400 });
  if (!key) {
    return Response.json(
      { error: "offline", fix: "Set GEMINI_API_KEY in .env.local (Google AI Studio → Get API key) and restart the dev server." },
      { status: 503 },
    );
  }
  const origin = new URL(req.url).origin;
  const contents: Content[] = [
    ...(body.history ?? []).slice(-24),
    { role: "user", parts: [{ text: `CONTEXT:\n${body.context ?? "(none)"}\n\nUSER: ${body.message}` }] },
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      try {
        for (let round = 0; round < 5; round++) {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
            {
              method: "POST",
              headers: { "content-type": "application/json", "x-goog-api-key": key },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents,
                tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
              }),
              signal: req.signal,
            },
          );
          if (!r.ok || !r.body) {
            const t = await r.text().catch(() => "");
            send({ type: "error", message: `Gemini ${r.status}`, fix: r.status === 400 || r.status === 403 ? "Check GEMINI_API_KEY and GEMINI_MODEL in .env.local." : t.slice(0, 200) });
            break;
          }
          const modelParts: Part[] = [];
          const calls: { name: string; args: Record<string, unknown> }[] = [];
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (!line.startsWith("data:")) continue;
              const json = JSON.parse(line.slice(5).trim()) as { candidates?: { content?: { parts?: Part[] } }[] };
              for (const p of json.candidates?.[0]?.content?.parts ?? []) {
                if (p.thought) continue;
                if (p.text) { send({ type: "text", text: p.text }); modelParts.push({ text: p.text }); }
                if (p.functionCall) { calls.push({ name: p.functionCall.name, args: p.functionCall.args ?? {} }); modelParts.push({ functionCall: p.functionCall }); }
              }
            }
          }
          if (!calls.length) break;
          contents.push({ role: "model", parts: modelParts });
          const responses: Part[] = [];
          for (const c of calls) {
            let result: unknown;
            if ((CLIENT_TOOLS as readonly string[]).includes(c.name)) {
              send({ type: "action", tool: c.name as ClientTool, args: c.args });
              result = { status: "dispatched to the interface" };
            } else {
              send({ type: "tool", name: c.name });
              result = await serverTool(c.name, c.args, origin);
            }
            responses.push({ functionResponse: { name: c.name, response: { result } } });
          }
          contents.push({ role: "user", parts: responses });
        }
        send({ type: "done" });
      } catch (e) {
        if ((e as Error).name !== "AbortError") send({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
}
