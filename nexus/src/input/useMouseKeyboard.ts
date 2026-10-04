"use client";
import { useEffect } from "react";
import { rt, RING } from "@/core/runtime";
import { MODULE_IDS } from "@/core/modules";
import { useNexus } from "@/stores/nexus";
import { dispatch } from "@/core/dispatch";
import { presentation } from "@/core/clocks/presentation";
import { formClock } from "@/core/clocks/form";
import { wake } from "@/voice/recognition";
import { nowS } from "@/core/runtime";

/**
 * Fallback input. The mouse is a fallback, not the primary interface:
 *  drag  — turns the ring (with momentum on release)
 *  click — opens the hovered card · wheel — rotates · Esc — closes
 *  ← → rotate · Enter opens the front card · Space wakes NEXUS
 *  L toggles LOCKED/DRIFT · H toggles the HUD
 */
export function useMouseKeyboard() {
  useEffect(() => {
    let down = false, startX = 0, lastX = 0, lastT = 0, vel = 0, moved = 0;
    const toNdc = (e: PointerEvent | MouseEvent) => ({ x: (e.clientX / window.innerWidth) * 2 - 1, y: -(e.clientY / window.innerHeight) * 2 + 1 });
    const isUi = (e: Event) => (e.target as HTMLElement)?.closest?.("[data-ui]") != null;

    const onMove = (e: PointerEvent) => {
      const n = toNdc(e);
      rt.pointer.x = n.x; rt.pointer.y = n.y; rt.pointer.active = true; rt.pointer.lastMove = nowS();
      if (!down || formClock.engaged) return;
      const dx = e.clientX - lastX;
      const now = performance.now();
      vel = (dx / Math.max(1, now - lastT)) * 1000;
      lastX = e.clientX; lastT = now;
      moved += Math.abs(dx);
      rt.ringDrag -= (dx / window.innerWidth) * RING.step * 4.2;
    };
    const onDown = (e: PointerEvent) => {
      if (isUi(e) || e.button !== 0) return;
      down = true; startX = lastX = e.clientX; lastT = performance.now(); vel = 0; moved = 0;
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      const st = useNexus.getState();
      if (moved > 6 && !formClock.engaged) {
        // hand the drag to the orbit spring with its momentum; snap to the nearest slot it would reach
        const total = rt.ring.x + rt.ringDrag;
        const v = -(vel / window.innerWidth) * RING.step * 4.2;
        rt.ring.x = total;
        rt.ring.v = v;
        rt.ringDrag = 0;
        const projected = total + v * 0.35;
        st.set({ ringIndex: Math.round(projected / RING.step) });
        return;
      }
      void startX;
      if (st.hovered && !formClock.engaged) {
        const i = MODULE_IDS.indexOf(st.hovered);
        rt.ripples[i] = [rt.time, 0.5, 0.5];
        if (presentation.id && presentation.id !== st.hovered) presentation.cancelAndCommit();
        void dispatch({ kind: "open-module", id: st.hovered }, "mouse");
      }
      void e;
    };
    let wheelAcc = 0, wheelT = 0;
    const onWheel = (e: WheelEvent) => {
      if (isUi(e) || useNexus.getState().expanded || formClock.engaged) return;
      wheelAcc += e.deltaY + e.deltaX;
      const now = performance.now();
      if (Math.abs(wheelAcc) > 60 && now - wheelT > 220) {
        wheelT = now;
        void dispatch({ kind: "rotate", dir: wheelAcc > 0 ? 1 : -1 }, "mouse");
        wheelAcc = 0;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      const st = useNexus.getState();
      if (st.paletteOpen) return;
      if (e.key === "ArrowLeft") void dispatch({ kind: "rotate", dir: -1 }, "keyboard");
      else if (e.key === "ArrowRight") void dispatch({ kind: "rotate", dir: 1 }, "keyboard");
      else if (e.key === "Escape") void dispatch({ kind: "close" }, "keyboard");
      else if (e.key === "Enter" && !st.expanded && !formClock.engaged) {
        const n = MODULE_IDS.length;
        const front = MODULE_IDS[((st.ringIndex % n) + n) % n];
        void dispatch({ kind: "open-module", id: front }, "keyboard");
      } else if (e.key === " ") { e.preventDefault(); wake("keyboard"); }
      else if (e.key.toLowerCase() === "l") void dispatch({ kind: "drift" }, "keyboard");
      else if (e.key.toLowerCase() === "h") void dispatch({ kind: "hud" }, "keyboard");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}
