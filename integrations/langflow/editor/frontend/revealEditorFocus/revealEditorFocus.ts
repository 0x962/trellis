import useFlowStore from "@/stores/flowStore";
import type { EditorFocus } from "../../protocol";

export function revealEditorFocus(focus: EditorFocus | null) {
	if (focus === null) {
		document.querySelector<HTMLElement>(".react-flow")?.focus();
		return;
	}
	const state = useFlowStore.getState();
	const target = state.nodes.find((node) => node.id === focus.nodeId);
	if (!target) return;
	const ancestors = new Set<string>();
	let node: typeof target | undefined = target;
	while (node && !ancestors.has(node.id)) {
		ancestors.add(node.id);
		node = state.nodes.find((candidate) => candidate.id === node?.parentId);
	}
	state.setNodes(
		state.nodes.map((item) =>
			ancestors.has(item.id)
				? { ...item, hidden: false, selected: item.id === focus.nodeId, data: { ...item.data, showNode: true } }
				: { ...item, selected: false },
		),
	);
	void state.reactFlowInstance!.fitView({ nodes: [{ id: focus.nodeId }], duration: 0 }).then(() => {
		requestAnimationFrame(() => {
			const selector =
				focus.field === null
					? `[data-id="${CSS.escape(focus.nodeId)}"].react-flow__node`
					: `[data-trellis-node="${CSS.escape(focus.nodeId)}"][data-trellis-field="${CSS.escape(focus.field)}"]`;
			const element = document.querySelector<HTMLElement>(selector);
			const control = element?.querySelector<HTMLElement>("input,textarea,button,select,[tabindex]");
			(control ?? element)?.focus({ preventScroll: true });
		});
	});
}
