"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { HUD } from "@/hud/HUD";
import { ExpandedPanel } from "@/hud/ExpandedPanel";
import { EmbodiedPanels } from "@/hud/EmbodiedPanels";
import { GestureTrail } from "@/hud/GestureTrail";
import { Boot } from "@/hud/Boot";
import { Fallback2D } from "@/hud/Fallback2D";
import Launcher from "@/hud/Launcher";
import { useModuleFeeds } from "@/modules/useModuleData";
import { useGestures } from "@/gesture/useGestures";
import { useMouseKeyboard } from "@/input/useMouseKeyboard";
import { useDebugHandle } from "@/hooks/useDebugHandle";
import { useFrameLoop } from "@/hooks/useFrameLoop";
import { initAudio } from "@/audio/engine";
import { startListening, onCommand, recognitionFrame, speechSupported } from "@/voice/recognition";
import { speechFrame } from "@/voice/speech";
import { handleUtterance } from "@/core/dispatch";
import { useNexus, log } from "@/stores/nexus";

// The 3D room is client-only and lazy: nothing heavy blocks first paint.
const Scene = dynamic(() => import("@/render/scene/Scene"), { ssr: false });

export default function Shell() {
  const [gl, setGl] = useState<boolean | null>(null);
  useModuleFeeds();
  useMouseKeyboard();
  useDebugHandle();
  const gestures = useGestures();

  useEffect(() => {
    try { setGl(!!document.createElement("canvas").getContext("webgl2")); } catch { setGl(false); }
    onCommand((text) => void handleUtterance(text, "voice"));
    log("BOOT · NEXUS spatial runtime");
  }, []);

  // voice level + awake window, every frame
  useFrameLoop(() => { speechFrame(); recognitionFrame(); });

  const enter = (sensors: boolean) => {
    initAudio();
    if (sensors) {
      if (speechSupported()) startListening();
      else log("VOICE · not supported here — use ⌘K or the keyboard", "warn");
      gestures.start();
    } else {
      useNexus.getState().set({ voice: "offline" });
    }
    log("READY · swipe, pinch, or say “Nexus”", "ok");
  };

  const toggleTracking = () => {
    const t = useNexus.getState().tracking;
    if (t === "off" || t === "denied" || t === "error") gestures.start();
    else gestures.stop();
  };

  return (
    <>
      {gl === true && <Scene />}
      {gl === false && <Fallback2D />}
      <GestureTrail />
      <HUD onTracking={toggleTracking} />
      <ExpandedPanel />
      <EmbodiedPanels />
      {/* the palette mounts OUTSIDE the HUD visibility gate */}
      <Launcher />
      <Boot onEnter={enter} />
    </>
  );
}
