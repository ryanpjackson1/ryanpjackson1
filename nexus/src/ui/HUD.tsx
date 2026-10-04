"use client";
import { useEffect, useState } from "react";
import { useNexus } from "@/state/store";
import { DPR_CAP } from "@/render/quality";
import { MotionControls } from "./MotionControls";
import { TrackingStatus } from "./TrackingStatus";
import { ModuleDock } from "./ModuleDock";

const SOURCE_LABEL: Record<string, string> = { mouse: "Mouse", keyboard: "Keyboard", launcher: "Launcher", gesture: "Gesture", ui: "Button", system: "System", ai: "AI" };

function useFps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let raf = 0, frames = 0, t0 = performance.now();
    const tick = (now: number) => {
      frames++;
      if (now - t0 >= 1000) { setFps(Math.round((frames * 1000) / (now - t0))); frames = 0; t0 = now; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

/** Minimal HUD: system status, motion + tracking controls, module dock, last command. */
export function HUD() {
  const renderer = useNexus((s) => s.renderer);
  const reason = useNexus((s) => s.rendererReason);
  const tier = useNexus((s) => s.quality);
  const last = useNexus((s) => s.lastCommand);
  const fps = useFps();
  return (
    <div className="fixed inset-0 z-20 pointer-events-none [&>*]:pointer-events-auto">
      <header className="absolute top-5 left-6 space-y-1">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
          <h1 className="font-mono text-[13px] tracking-[0.3em]">NEXUS</h1>
          <span className="label">Milestone 1</span>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[12px] font-mono pt-2">
          <dt className="text-dim">Renderer</dt>
          <dd>{renderer === "webgl" ? "WebGL" : renderer === "fallback" ? "2D fallback" : "Starting…"}</dd>
          {renderer === "webgl" && (<><dt className="text-dim">Quality</dt><dd className="tnum">T{tier} · DPR ≤ {DPR_CAP[tier]}</dd></>)}
          <dt className="text-dim">FPS</dt>
          <dd className="tnum">{fps || "—"}</dd>
        </dl>
        {renderer === "fallback" && reason && <p className="text-[12px] text-dim max-w-[300px] pt-1">{reason}</p>}
        <div className="pt-4"><TrackingStatus /></div>
      </header>

      <div className="absolute top-5 right-6"><MotionControls /></div>

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[min(760px,60vw)] hidden md:flex flex-col items-center gap-2">
        <ModuleDock />
        <p className="label text-center !normal-case !tracking-normal">
          ← → rotate · Enter or click opens · drag a card (it springs back) · Ctrl K search · Esc closes · L drift
        </p>
      </div>

      <div className="absolute bottom-5 right-6 text-right">
        <div className="label">Last command</div>
        <div className="font-mono text-[13px] mt-1" aria-live="off">
          {last ? <>{SOURCE_LABEL[last.source]} · <span className="text-holo-hi">{last.type}</span></> : "—"}
        </div>
      </div>
    </div>
  );
}
