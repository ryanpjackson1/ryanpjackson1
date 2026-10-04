/**
 * GET /api/modules/<id> — every module's live data as a ModulePayload.
 * Never throws: failures become `status: "error"` payloads with a hint.
 */
import { NextResponse } from "next/server";
import { MODULE_IDS, type ModuleId } from "@/core/modules";
import { emptyPayload } from "@/core/payload";
import { FETCHERS, SOURCES } from "@/modules/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isModuleId = (v: string): v is ModuleId => (MODULE_IDS as readonly string[]).includes(v);

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isModuleId(id)) {
    return NextResponse.json(
      { error: `Unknown module "${id}". Valid ids: ${MODULE_IDS.join(", ")}.` },
      { status: 404 },
    );
  }

  let payload;
  try {
    payload = await FETCHERS[id](req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    payload = emptyPayload(id, "error", SOURCES[id], `${msg}. This is a NEXUS bug in src/modules/server/${id}.ts — check the dev server log.`);
    console.error(`[modules/${id}]`, e);
  }
  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
