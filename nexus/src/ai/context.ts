"use client";
import { MODULES, MODULE_IDS } from "@/core/modules";
import { useNexus } from "@/stores/nexus";
import { presentation } from "@/core/clocks/presentation";
import { formClock } from "@/core/clocks/form";
import { WORLDS } from "@/render/scene/worlds";
import { RING, rt } from "@/core/runtime";

/**
 * What the model can "see": form, world, the module in front / open /
 * presented, and every module's headline. "Explain this" while Stocks is
 * open resolves to the portfolio because it is named here.
 */
export function buildContext(): string {
  const st = useNexus.getState();
  const n = MODULE_IDS.length;
  const front = MODULE_IDS[((Math.round(rt.ring.x / RING.step) % n) + n) % n];
  const open = presentation.id ?? st.expanded;
  const lines: string[] = [];
  lines.push(`time: ${new Date().toString()}`);
  lines.push(`form: ${formClock.engaged ? "human (embodied figure; no ring — modules are presented as panels)" : "spatial ring of cards"}`);
  lines.push(`world: ${WORLDS[st.world].name}`);
  lines.push(`card in front: ${MODULES[front].label}`);
  if (open) lines.push(`OPEN MODULE ("this"): ${MODULES[open].label}`);
  if (st.embodiedPanels.length) lines.push(`PRESENTED PANELS ("this"): ${st.embodiedPanels.map((id) => MODULES[id].label).join(", ")}`);
  const focus = open ?? st.embodiedPanels[st.embodiedPanels.length - 1];
  for (const id of MODULE_IDS) {
    const p = st.payloads[id];
    if (!p) continue;
    const m = p.metrics.slice(0, 4).map((x) => `${x.label} ${x.value}`).join("; ");
    lines.push(`[${MODULES[id].label}] ${p.status} · ${p.headline.label}: ${p.headline.value}${m ? ` · ${m}` : ""} · ${p.summary}`);
    if (id === focus && p.detail) {
      const d = JSON.stringify(p.detail);
      lines.push(`  detail of ${MODULES[id].label}: ${d.length > 5000 ? d.slice(0, 5000) + "…" : d}`);
    }
  }
  return lines.join("\n");
}
