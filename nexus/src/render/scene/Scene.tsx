"use client";
import { Suspense, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Atmosphere } from "./Atmosphere";
import { WeatherFX } from "./WeatherFX";
import { CameraRig } from "./CameraRig";
import { PerfMonitor } from "./PerfMonitor";
import { ProjectWorlds } from "./ProjectWorlds";
import { CardRing } from "@/render/cards/CardRing";
import { PostFX } from "@/render/fx/PostFX";
import { HumanForm } from "@/render/form/HumanForm";
import { HoloText } from "@/render/fx/HoloText";
import { tickWorld, live } from "./worldState";
import { useNexus } from "@/stores/nexus";
import { presentation } from "@/core/clocks/presentation";
import { formClock } from "@/core/clocks/form";
import { audioFrame } from "@/audio/engine";
import type { WeatherDetail } from "@/modules/types";

/** Drives world blending from module state (Phase 4 "AI worlds"). */
function WorldDriver() {
  useFrame((_, dt) => {
    const st = useNexus.getState();
    const open = presentation.id ?? st.expanded;
    const w = st.payloads.weather?.detail as WeatherDetail | undefined;
    const weather = { rain: 0, cloud: 0, fog: 0, sun: 0, snow: 0, storm: 0 };
    // the whole world reflects the weather while Weather is open (subtly always)
    const strength = open === "weather" ? 1 : 0.25;
    if (w?.condition) {
      const k = (w.intensity ?? 0.6) * strength;
      if (w.condition === "sun") weather.sun = k;
      else if (w.condition === "clouds") weather.cloud = k;
      else if (w.condition === "rain") weather.rain = k;
      else if (w.condition === "fog") weather.fog = k;
      else if (w.condition === "snow") weather.snow = k;
      else if (w.condition === "storm") { weather.storm = k; weather.rain = k * 0.6; }
    }
    tickWorld(Math.min(dt, 0.05), { market: open === "stocks" ? 1 : 0, projects: open === "projects" ? 1 : 0, weather });
    audioFrame(formClock.envelopes().dim);
  });
  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.25} color={live.fill} />
      <directionalLight position={[-2, 4, 3]} intensity={0.8} color={live.key} />
    </>
  );
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

export default function Scene() {
  const [ok, setOk] = useState<boolean | null>(null);
  const tier = useNexus((s) => s.tier);
  useEffect(() => {
    const yes = webglAvailable();
    setOk(yes);
    if (!yes) useNexus.getState().push("WebGL2 unavailable — running in 2D fallback", "warn");
    else {
      // initial tier from the device
      const cores = navigator.hardwareConcurrency ?? 4;
      const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
      const small = Math.min(window.innerWidth, window.innerHeight) < 700;
      const t = small || cores <= 4 || mem <= 4 ? 1 : cores >= 10 ? 3 : 2;
      useNexus.getState().set({ tier: t });
    }
  }, []);
  if (ok === null) return null;
  if (!ok) return null; // the DOM fallback ring renders instead (see app/Shell)

  return (
    <Canvas
      className="!fixed inset-0"
      dpr={[1, tier >= 3 ? 2 : tier >= 2 ? 1.6 : 1.25]}
      gl={{ antialias: false, powerPreference: "high-performance", alpha: false, stencil: false }}
      camera={{ fov: 42, near: 0.05, far: 140, position: [0, 0.32, 1.25] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.setClearColor("#03050a");
      }}
      onPointerMissed={() => useNexus.getState().set({ hovered: null })}
    >
      <PerfMonitor />
      <CameraRig />
      <WorldDriver />
      <Lights />
      <Suspense fallback={null}>
        <Atmosphere />
        <WeatherFX />
        <CardRing />
        <ProjectWorlds />
        <HumanForm />
        <HoloText />
      </Suspense>
      <PostFX />
    </Canvas>
  );
}
