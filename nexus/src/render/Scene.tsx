"use client";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { useNexus } from "@/state/store";
import { dispatch } from "@/commands/dispatch";
import type { QualityTier } from "@/state/types";
import { Atmosphere } from "./Atmosphere";
import { CameraRig } from "./CameraRig";
import { CardRing } from "./CardRing";
import { pixelRatio } from "./quality";

/** The 3D room. Mounted only after WebGL has been probed successfully. */
export default function Scene() {
  const tier = useNexus((s) => s.quality);
  const dpr = typeof window === "undefined" ? 1 : pixelRatio(tier, window.devicePixelRatio);
  return (
    <Canvas
      className="!fixed inset-0"
      dpr={dpr}
      gl={{ antialias: tier > 0, powerPreference: "high-performance", alpha: false, stencil: false }}
      camera={{ fov: 42, near: 0.1, far: 100, position: [0, 0.28, 1.35] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          dispatch({ type: "renderer/set", renderer: "fallback", reason: "The GPU context was lost (driver reset or too many WebGL pages)." }, "system");
        });
        gl.domElement.setAttribute("aria-hidden", "true");
      }}
    >
      {/* Steps the tier down when frame rate sags and back up when it recovers. */}
      <PerformanceMonitor
        flipflops={4}
        onDecline={() => { const t = useNexus.getState().quality; if (t > 0) dispatch({ type: "quality/set", tier: (t - 1) as QualityTier }, "system"); }}
        onIncline={() => { const t = useNexus.getState().quality; if (t < 2) dispatch({ type: "quality/set", tier: (t + 1) as QualityTier }, "system"); }}
      />
      <CameraRig />
      <Atmosphere />
      <CardRing />
    </Canvas>
  );
}
