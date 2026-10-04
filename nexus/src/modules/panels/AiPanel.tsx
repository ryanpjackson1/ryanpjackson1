"use client";
import { motion } from "framer-motion";
import { accentCss } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import { fmSpring } from "@/core/motion";
import type { AiDetail } from "../types";
import { DIM, HAIRLINE, PanelFrame, POS, Section, STAGGER } from "./kit";

export default function AiPanel({ payload }: { payload: ModulePayload }) {
  const d = payload.detail as AiDetail | undefined;
  return (
    <PanelFrame payload={payload}>
      {d && (
        <div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <div>
              <div className="label">Model</div>
              <div className="mt-1 font-mono text-[15px]" style={{ color: accentCss("ai") }}>{d.model}</div>
            </div>
            <div>
              <div className="label">Voice</div>
              <div className="mt-1 text-[15px]">{d.voice ?? "—"}</div>
            </div>
            <div>
              <div className="label">Speech model</div>
              <div className="mt-1 truncate font-mono text-[13px] text-dim">{d.ttsModel ?? "—"}</div>
            </div>
          </div>
          <Section title="Capabilities">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {d.capabilities.map((c, i) => (
                <motion.li
                  key={c.id}
                  className="rounded-md border p-3"
                  style={{ borderColor: c.ready ? accentCss("ai", 0.35) : HAIRLINE }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...fmSpring("reporting"), delay: i * STAGGER * 2 }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[14px]">{c.label}</span>
                    <span className="label flex items-center gap-1.5" style={{ color: c.ready ? POS : DIM }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.ready ? POS : DIM }} />
                      {c.ready ? "ready" : "needs key"}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-dim">{c.description}</p>
                </motion.li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </PanelFrame>
  );
}
