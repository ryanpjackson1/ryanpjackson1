"use client";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { INITIAL_STATE, type NexusState } from "./types";
import { bindStore } from "@/commands/dispatch";

/**
 * Zustand holds the state; it has NO action methods on purpose. Components
 * read with selectors and change things only through `dispatch`.
 */
export const useNexus = create<NexusState>()(subscribeWithSelector(() => ({ ...INITIAL_STATE })));

bindStore({ getState: useNexus.getState, setState: (p) => useNexus.setState(p) });
