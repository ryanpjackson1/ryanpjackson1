import type { TrackingState } from "@/state/types";

/**
 * Turns camera / MediaPipe failures into a clear status, message and fix.
 * Hints name the Windows settings explicitly, since that is the target
 * platform, but stay accurate elsewhere.
 */
export function describeCameraError(err: unknown, stage: "camera" | "model" = "camera"): TrackingState {
  const name = (err as { name?: string })?.name ?? "";
  const msg = (err as { message?: string })?.message ?? String(err);
  if (stage === "model") {
    return {
      status: "model-failed",
      message: "The hand-tracking model could not be loaded.",
      hint: "Check your internet connection, or run `npm run fetch-model` once to store the model locally, then try again.",
    };
  }
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return {
        status: "denied",
        message: "Camera permission was denied.",
        hint: "Click the camera icon in the address bar and allow access for this site. On Windows also check Settings → Privacy & security → Camera → “Camera access” and “Let desktop apps access your camera”.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return { status: "no-camera", message: "No usable camera was found.", hint: "Connect a webcam, or check that it is enabled in Windows Device Manager, then try again." };
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return {
        status: "in-use",
        message: "The camera is busy or could not start.",
        hint: "Close apps that may be using it (Teams, Zoom, Camera, OBS, another browser tab) and try again.",
      };
    case "SecurityError":
      return { status: "insecure", message: "The camera is blocked on this address.", hint: "Open the app at http://localhost:3000 — browsers only allow cameras on localhost or HTTPS." };
    case "TypeError":
      if (/getUserMedia|mediaDevices/i.test(msg)) {
        return { status: "unsupported", message: "This browser can't access cameras here.", hint: "Use a current Edge or Chrome on http://localhost." };
      }
  }
  return { status: "error", message: `Hand tracking failed: ${msg}`, hint: "Try again. The mouse and keyboard keep working." };
}

/** Preconditions checked before the permission prompt. */
export function cameraPreflight(env: { isSecureContext: boolean; hasMediaDevices: boolean; hasWasm: boolean }): TrackingState | null {
  if (!env.isSecureContext) return describeCameraError({ name: "SecurityError" });
  if (!env.hasMediaDevices) return { status: "unsupported", message: "This browser can't access cameras here.", hint: "Use a current Edge or Chrome on http://localhost." };
  if (!env.hasWasm) return { status: "unsupported", message: "WebAssembly is unavailable, so hand tracking can't run.", hint: "Use a current Edge or Chrome." };
  return null;
}
