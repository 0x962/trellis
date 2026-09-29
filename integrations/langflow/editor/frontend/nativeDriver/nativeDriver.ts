import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import type { FlowType } from "@/types/flow";
import { observeFieldFocus } from "../../fieldFocus";
import type { EditorContent, EditorFocus } from "../../protocol";
import { revealEditorFocus } from "../revealEditorFocus";

let viewportChanged = () => {};
export function editorViewportChanged() {
	viewportChanged();
}

export function nativeDriver(flowId: string) {
	let original: EditorContent;
	const initialize = async (content: EditorContent) => {
		original = content;
		useFlowsManagerStore.getState().setAutoSaving(false);
		await new Promise<void>((resolve) => {
			const loaded = () => {
				const state = useFlowStore.getState();
				return state.currentFlow?.id === flowId && state.reactFlowInstance !== null;
			};
			if (loaded()) return resolve();
			const unsubscribe = useFlowStore.subscribe(() => {
				if (loaded()) {
					unsubscribe();
					resolve();
				}
			});
		});
		const graph = content.graphDocument as NonNullable<FlowType["data"]>;
		await useFlowStore.getState().reactFlowInstance!.setViewport(graph.viewport);
	};
	const subscribe = (callbacks: {
		draftChanged: (content: EditorContent) => void;
		selectionChanged: (focus: EditorFocus | null) => void;
	}) => {
		const content = (): EditorContent => {
			const state = useFlowStore.getState();
			return {
				...original,
				graphDocument: {
					...original.graphDocument,
					nodes: structuredClone(state.nodes),
					edges: structuredClone(state.edges),
					viewport: state.reactFlowInstance!.getViewport(),
				} as EditorContent["graphDocument"],
			};
		};
		let previous = JSON.stringify(content());
		let selection = useFlowStore.getState().nodes.find((node) => node.selected)?.id ?? null;
		const stopFocus = observeFieldFocus(document, callbacks.selectionChanged);
		const changed = () => {
			const next = content();
			const bytes = JSON.stringify(next);
			if (bytes !== previous) {
				previous = bytes;
				callbacks.draftChanged(next);
			}
			const selected = useFlowStore.getState().nodes.find((node) => node.selected)?.id ?? null;
			if (selected !== selection) {
				selection = selected;
				callbacks.selectionChanged(selected === null ? null : { nodeId: selected, field: null });
			}
		};
		viewportChanged = changed;
		const unsubscribe = useFlowStore.subscribe(changed);
		return () => {
			unsubscribe();
			stopFocus();
			viewportChanged = () => {};
		};
	};
	return { initialize, subscribe, selectIssue: revealEditorFocus, restoreFocus: revealEditorFocus };
}
