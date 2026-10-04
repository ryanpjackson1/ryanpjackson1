"use client";
import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNexus } from "@/stores/nexus";
import { useFrameLoop } from "@/hooks/useFrameLoop";
import { rt } from "@/core/runtime";
import { fmSpring } from "@/core/motion";

/**
 * The microphone appears when NEXUS wakes. Its ring reacts to speech;
 * the status reads Listening / Thinking / Streaming / Speaking / Interrupted.
 */
export function VoiceOrb() {
  const awake = useNexus((s) => s.awake);
  const voice = useNexus((s) => s.voice);
  const transcript = useNexus((s) => s.transcript);
  const response = useNexus((s) => s.response);
  const ring = useRef<HTMLDivElement>(null);
  useFrameLoop((t) => {
    if (!ring.current) return;
    const s = rt.speech;
    const listen = voice === "listening" ? 0.06 + 0.04 * Math.sin(t * 4) : 0;
    ring.current.style.transform = `scale(${1 + s * 0.6 + listen})`;
    ring.current.style.opacity = String(0.35 + s * 0.65);
  });
  const show = awake || voice === "thinking" || voice === "streaming" || voice === "speaking";
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="absolute left-1/2 bottom-8 -translate-x-1/2 flex flex-col items-center gap-3 w-[min(640px,80vw)]"
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16 }}
          transition={fmSpring("arriving")}
          data-ui
        >
          <div className="relative h-14 w-14 grid place-items-center">
            <div ref={ring} className="absolute inset-0 rounded-full border border-holo/60 shadow-[0_0_30px_rgba(120,170,255,.45)]" />
            <div className="h-9 w-9 rounded-full glass grid place-items-center">
              <svg width="14" height="18" viewBox="0 0 14 18" fill="none" aria-hidden>
                <rect x="4" y="1" width="6" height="10" rx="3" stroke="#d6e6ff" strokeWidth="1.3" />
                <path d="M1.5 8.5a5.5 5.5 0 0 0 11 0M7 14v3" stroke="#d6e6ff" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <div className="label !text-holo-hi">{voice === "idle" ? "LISTENING" : voice}</div>
          {(voice === "listening" || voice === "thinking") && transcript && (
            <div className="font-sans text-[15px] text-dim text-center">“{transcript}”</div>
          )}
          {(voice === "streaming" || voice === "speaking") && response && (
            <div className="font-sans text-[14px] text-ink/80 text-center line-clamp-2">{response}</div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
