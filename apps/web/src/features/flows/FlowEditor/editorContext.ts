import type { Persona } from "@trellis/api";
import { createContext, useContext } from "react";

// What every node and edge on the canvas reads: the personas by id, the first
// validation message of each node and edge by id, and the step each box
// starts at (`entryOf`) and ends at (`exitOf`), keyed by box id.
export type FlowEditorState = {
	personas: Map<string, Persona>;
	issues: Map<string, string>;
	entryOf: Map<string, string>;
	exitOf: Map<string, string>;
};

export const FlowEditorContext = createContext<FlowEditorState>({
	personas: new Map(),
	issues: new Map(),
	entryOf: new Map(),
	exitOf: new Map(),
});

export const useFlowEditor = () => useContext(FlowEditorContext);
