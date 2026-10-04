"use client";
import { useEffect } from "react";
import { MODULE_IDS } from "@/modules/registry";
import { dispatch } from "@/commands/dispatch";
import { useNexus } from "@/state/store";
import { rt } from "@/render/runtime";

/**
 * Keyboard → commands.
 *   Ctrl+K (⌘K)  launcher         Esc        close innermost layer
 *   ← / →        rotate           Enter      open the front card
 *   1…9, 0       open module N    L          LOCKED / DRIFT
 */
const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault(); // Ctrl+K would otherwise focus the browser's search bar
        dispatch({ type: "launcher/toggle" }, "keyboard");
        return;
      }
      if (e.key === "Escape") {
        dispatch({ type: "escape" }, "keyboard");
        return;
      }
      const st = useNexus.getState();
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || st.launcherOpen || st.openId) return;
      // let buttons and links keep their own Enter/Space behaviour
      const onControl = (e.target as HTMLElement | null)?.closest?.("button, a, [role=button]");
      if (e.key === "ArrowLeft") { e.preventDefault(); dispatch({ type: "ring/rotate", steps: -1 }, "keyboard"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); dispatch({ type: "ring/rotate", steps: 1 }, "keyboard"); }
      else if (e.key === "Enter" && !onControl) dispatch({ type: "module/open-front" }, "keyboard");
      else if (e.key.toLowerCase() === "l") dispatch({ type: "motion/drift" }, "keyboard");
      else if (/^[0-9]$/.test(e.key)) {
        const i = e.key === "0" ? 9 : Number(e.key) - 1;
        dispatch({ type: "module/open", id: MODULE_IDS[i] }, "keyboard");
      }
    };
    const onMove = (e: PointerEvent) => {
      rt.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      rt.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);
}
