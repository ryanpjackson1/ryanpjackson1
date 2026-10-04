import { guard } from "@/bridge/server/security";
import { runVerb } from "@/bridge/server/verbs";
import { validateRequest } from "@/bridge/validate";
import type { BridgeResult } from "@/bridge/verbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (body: BridgeResult, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** POST { verb, args } → BridgeResult. */
export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, message: "The request body wasn't valid JSON." }, 400);
  }
  const v = validateRequest(body);
  if (!v.ok) return reply({ ok: false, message: `Bad bridge request: ${v.error}.` }, 400);

  return reply(await runVerb(v.verb, v.args));
}
