export const runtime = "nodejs";

/**
 * Studio voice: Gemini TTS, one sentence at a time so speech begins
 * before the response completes. Returns raw 16-bit PCM (base64) that the
 * client plays through the spatial voice bus (where the analyser hears it).
 * 503 with a fix when unconfigured — the client falls back to the local voice.
 */
export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "offline" }, { status: 503 });
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text || text.length > 600) return Response.json({ error: "text required (≤600 chars)" }, { status: 400 });
  const model = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
  const voice = process.env.GEMINI_TTS_VOICE || "Charon";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Say calmly and precisely: ${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
    signal: AbortSignal.timeout(15000),
  }).catch((e: Error) => ({ ok: false, status: 504, text: async () => e.message }) as unknown as Response);
  if (!r.ok) return Response.json({ error: `tts ${r.status}`, detail: (await r.text()).slice(0, 200) }, { status: 502 });
  const j = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[] };
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part?.inlineData) return Response.json({ error: "no audio" }, { status: 502 });
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] ?? 24000);
  return Response.json({ audio: part.inlineData.data, sampleRate: rate });
}
