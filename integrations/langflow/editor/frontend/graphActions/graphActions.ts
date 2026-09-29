import type { Connection } from "@xyflow/react";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { isValidConnection } from "@/utils/reactflowUtils";

export function connectEditorPorts(connection: Connection, replacedEdge?: string): boolean {
	const state = useFlowStore.getState();
	if (replacedEdge && !state.edges.some((edge) => edge.id === replacedEdge)) return false;
	const edges = state.edges.filter((edge) => edge.id !== replacedEdge);
	if (!isValidConnection(connection, state.nodes, edges)) return false;
	useFlowsManagerStore.getState().takeSnapshot();
	if (replacedEdge) state.setEdges(edges);
	state.onConnect(connection);
	return true;
}

export function deleteEditorSelection(nodeIds: string[], edgeIds: string[]) {
	const state = useFlowStore.getState();
	const removed = new Set(nodeIds);
	let size = -1;
	while (size !== removed.size) {
		size = removed.size;
		for (const node of state.nodes) if (node.parentId && removed.has(node.parentId)) removed.add(node.id);
	}
	useFlowsManagerStore.getState().takeSnapshot();
	const edges = state.edges.filter((edge) => !edgeIds.includes(edge.id) && !removed.has(edge.source) && !removed.has(edge.target));
	state.setNodes(state.nodes.filter((node) => !removed.has(node.id)));
	state.setEdges(edges);
}
