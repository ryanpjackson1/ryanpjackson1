"use client";
import { Component, type ReactNode } from "react";

/** If the 3D scene throws (driver bug, context failure), fall back to 2D instead of a blank page. */
export class RenderBoundary extends Component<{ onError: (reason: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(`The 3D renderer failed: ${error.message}`); }
  render() { return this.state.failed ? null : this.props.children; }
}
