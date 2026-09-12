import type { Persona } from "@trellis/api";
import { createContext, useContext } from "react";

// What every node on the canvas reads: the personas by id, and the first
// validation message of each node and edge by id.
export type FlowEditorState = { personas: Map<string, Persona>; issues: Map<string, string> };

export const FlowEditorContext = createContext<FlowEditorState>({ personas: new Map(), issues: new Map() });

export const useFlowEditor = () => useContext(FlowEditorContext);
