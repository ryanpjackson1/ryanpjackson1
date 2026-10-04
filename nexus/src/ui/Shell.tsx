"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useNexus } from "@/state/store";
import { dispatch } from "@/commands/dispatch";
import { initialTier, probeWebGL } from "@/render/quality";
import { useKeyboard } from "@/input/useKeyboard";
import { useHandTracking } from "@/input/gestures/useHandTracking";
import { HUD } from "./HUD";
import { Launcher } from "./Launcher";
import { ModulePanel } from "./ModulePanel";
import { Fallback2D } from "./Fallback2D";
import { HandCursor } from "./HandCursor";
import { RenderBoundary } from "./RenderBoundary";

// Three.js is client-only and loaded lazily so first paint isn't blocked on it.
const Scene = dynamic(() => import("@/render/Scene"), { ssr: false });

export default function Shell() {
  const renderer = useNexus((s) => s.renderer);
  useKeyboard();
  useHandTracking();

  useEffect(() => {
    // reduced motion follows the OS setting (and can be toggled in the HUD)
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    dispatch({ type: "motion/reduced", on: mq.matches }, "system");
    const onChange = (e: MediaQueryListEvent) => dispatch({ type: "motion/reduced", on: e.matches }, "system");
    mq.addEventListener("change", onChange);

    const nav = navigator as Navigator & { deviceMemory?: number };
    dispatch({ type: "quality/set", tier: initialTier({ cores: nav.hardwareConcurrency, memoryGB: nav.deviceMemory, minSide: Math.min(innerWidth, innerHeight) }) }, "system");
    const probe = probeWebGL(document, location.search);
    dispatch({ type: "renderer/set", renderer: probe.ok ? "webgl" : "fallback", reason: probe.reason }, "system");
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      {renderer === "webgl" && (
        <RenderBoundary onError={(reason) => dispatch({ type: "renderer/set", renderer: "fallback", reason }, "system")}>
          <Scene />
        </RenderBoundary>
      )}
      {renderer === "fallback" && <Fallback2D />}
      <HUD />
      <HandCursor />
      <ModulePanel />
      <Launcher />
    </>
  );
}
