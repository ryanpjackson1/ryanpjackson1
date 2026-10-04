import { guard } from "@/bridge/server/security";
import { listDisplays } from "@/bridge/server/displays";
import { translate } from "@/bridge/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → { ok, displays: DisplayInfo[] } (index 0 = primary). */
export async function GET(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    return Response.json({ ok: true, displays: await listDisplays() }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const t = translate(err);
    return Response.json({ ok: false, message: t.message, fix: t.fix }, { status: 500 });
  }
}
