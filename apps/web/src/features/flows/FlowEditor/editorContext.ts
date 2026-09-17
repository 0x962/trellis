import { createContext, useContext } from "react";

// What every node and edge on the canvas reads: the first validation message
// by id, and the first and last steps of each box.
// `unconnected` holds the children of parallel groups, whose handles stay hidden.
export type FlowEditorState = {
	issues: Map<string, string>;
	unconnected: Set<string>;
	entryOf: Map<string, string>;
	exitOf: Map<string, string>;
};

export const FlowEditorContext = createContext<FlowEditorState>({
	issues: new Map(),
	unconnected: new Set(),
	entryOf: new Map(),
	exitOf: new Map(),
});

export const useFlowEditor = () => useContext(FlowEditorContext);
