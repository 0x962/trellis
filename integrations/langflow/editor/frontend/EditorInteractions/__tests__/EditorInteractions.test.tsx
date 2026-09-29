import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AllNodeType } from "@/types/flow";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { KeyboardConnections } from "../../KeyboardConnections";
import { EditorOutline } from "../../EditorOutline";
import { connectEditorPorts, deleteEditorSelection } from "../../graphActions";
import { graphPorts } from "../../graphPorts";

function node(id: string, parentId?: string): AllNodeType {
	return { id, parentId, type: "genericNode", position: { x: 0, y: 0 }, data: {
		id, type: "FixtureOnly", node: { display_name: id, description: "Interaction fixture only",
			template: { value: { type: "Data", input_types: ["Data"], display_name: "Input", list: false, show: true } },
			outputs: [{ name: "result", display_name: "Result", types: ["Data"], method: "fixture" }],
		},
	} } as AllNodeType;
}
function reset(nodes = [node("source"), node("target")]) {
	useFlowsManagerStore.setState({ currentFlowId: crypto.randomUUID() });
	useFlowStore.setState({ nodes, edges: [], autoSaveFlow: undefined });
}
function connect(source = "source", target = "target") {
	const nodes = useFlowStore.getState().nodes;
	return connectEditorPorts({ source, target,
		sourceHandle: graphPorts(nodes.find((item) => item.id === source)!).outputs[0].handle,
		targetHandle: graphPorts(nodes.find((item) => item.id === target)!).inputs[0].handle,
	});
}

test("keyboard selectors create a native edge and reject an occupied single input", async () => {
	reset(); const user = userEvent.setup(); render(<KeyboardConnections />);
	async function choose(label: string) {
		const control = screen.getByRole("combobox", { name: label });
		control.focus(); await user.keyboard("{Enter}{Home}{Enter}");
	}
	await choose("Source component"); await choose("Output port");
	await choose("Target component"); await choose("Input port");
	const save = screen.getByRole("button", { name: "Save connection" });
	save.focus(); await user.keyboard("{Enter}");
	expect(useFlowStore.getState().edges).toHaveLength(1);
	expect(connect()).toBe(false);
});

test("replacement and deletion undo restore exact native handles and nested descendants", () => {
	reset([node("source"), node("target"), node("group"), node("child", "group"), node("grandchild", "child")]);
	expect(connect()).toBe(true);
	const before = structuredClone({ nodes: useFlowStore.getState().nodes, edges: useFlowStore.getState().edges });
	const edge = before.edges[0];
	const nodes = useFlowStore.getState().nodes;
	expect(connectEditorPorts({ source: "source", target: "grandchild", sourceHandle: edge.sourceHandle!,
		targetHandle: graphPorts(nodes[4]).inputs[0].handle }, edge.id)).toBe(true);
	useFlowsManagerStore.getState().undo();
	expect(useFlowStore.getState().edges).toEqual(before.edges);
	deleteEditorSelection(["group", "source"], []);
	expect(useFlowStore.getState().nodes.map((item) => item.id)).toEqual(["target"]);
	expect(useFlowStore.getState().edges).toEqual([]);
	useFlowsManagerStore.getState().undo();
	expect(useFlowStore.getState().nodes).toEqual(before.nodes);
	expect(useFlowStore.getState().edges).toEqual(before.edges);
});

test("the mounted outline finds a descendant by ancestor path and deletes it with undo", () => {
	reset([node("outer"), node("inner", "outer"), node("leaf", "inner")]);
	render(<EditorOutline onReveal={() => {}} />);
	fireEvent.change(screen.getByLabelText("Find a component"), { target: { value: "outer / inner / leaf" } });
	fireEvent.click(screen.getByRole("button", { name: "outer / inner / leaf · leaf" }));
	fireEvent.click(screen.getByRole("button", { name: "Delete component and descendants" }));
	expect(useFlowStore.getState().nodes.map((item) => item.id)).toEqual(["outer", "inner"]);
	act(() => useFlowsManagerStore.getState().undo());
	expect(screen.getByRole("button", { name: "outer / inner / leaf · leaf" })).toBeTruthy();
});
