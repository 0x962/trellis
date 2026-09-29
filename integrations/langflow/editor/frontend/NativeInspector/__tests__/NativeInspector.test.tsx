import { act, fireEvent, render, screen } from "@testing-library/react";
import type { AllNodeType } from "@/types/flow";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { NativeInspector } from "../NativeInspector";
import { DeclaredField } from "../../DeclaredField";

function fixture() {
	return { id: "component", type: "genericNode", position: { x: 1, y: 2 }, data: {
		id: "component", type: "FixtureOnly", node: {
			display_name: "Original", description: "Fixture only", documentation: "",
			template: {
				code: { type: "code", value: "sealed bytes" },
				instruction: { type: "str", display_name: "Instruction", multiline: true, value: "Keep this", required: true },
				max_rounds: { type: "int", display_name: "Rounds", value: 51, required: true },
				parallel: { type: "bool", display_name: "Parallel", value: false },
				effort: { type: "str", display_name: "Effort", options: ["low", "high"], value: "high" },
				seed: { type: "Data", input_types: ["Data"], value: null },
			}, outputs: [{ name: "yes", types: ["Data"], selected: "Data", group_outputs: true, method: "sealed" }],
		},
	} } as AllNodeType;
}
function reset(bound = false) {
	useFlowsManagerStore.setState({ currentFlowId: crypto.randomUUID() });
	useFlowStore.setState({ nodes: [fixture()], edges: [], autoSaveFlow: undefined,
		currentFlow: { data: { nodes: [], edges: [], ...(bound ? { trellisSource: {} } : {}) } } as never,
	});
}

test("Save preserves long input, large round counts, defaults, and immutable bytes on reopen", () => {
	reset(); const close = jest.fn();
	const view = render(<NativeInspector nodeId="component" onClose={close} />);
	const original = structuredClone(useFlowStore.getState().nodes[0]);
	const long = "instruction ".repeat(10001);
	fireEvent.change(screen.getByLabelText("Instruction (required)"), { target: { value: long } });
	fireEvent.change(screen.getByLabelText("Rounds (required)"), { target: { value: "1000001" } });
	expect(useFlowStore.getState().nodes[0]).toEqual(original);
	fireEvent.click(screen.getByRole("button", { name: "Save component" }));
	expect(close).toHaveBeenCalledTimes(1);
	const saved = useFlowStore.getState().nodes[0].data.node;
	expect(saved.template.instruction.value).toBe(long);
	expect(saved.template.max_rounds.value).toBe(1000001);
	expect(saved.template.code).toEqual(original.data.node.template.code);
	expect(saved.outputs).toEqual(original.data.node.outputs);
	expect(saved.template.effort.value).toBe("high");
	view.unmount(); render(<NativeInspector nodeId="component" onClose={close} />);
	expect((screen.getByLabelText("Instruction (required)") as HTMLTextAreaElement).value).toBe(long);
	expect((screen.getByLabelText("Rounds (required)") as HTMLInputElement).value).toBe("1000001");
});

test("Cancel preserves the exact graph and a concurrent component change blocks Save", () => {
	reset(); const close = jest.fn();
	const original = structuredClone(useFlowStore.getState().nodes);
	const view = render(<NativeInspector nodeId="component" onClose={close} />);
	fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Local" } });
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(useFlowStore.getState().nodes).toEqual(original);
	expect(close).toHaveBeenCalledTimes(1);
	view.unmount(); render(<NativeInspector nodeId="component" onClose={close} />);
	act(() => useFlowStore.setState({ nodes: [{ ...original[0], data: { ...original[0].data,
		node: { ...original[0].data.node, description: "Concurrent" },
	} }] }));
	fireEvent.click(screen.getByRole("button", { name: "Save component" }));
	expect(screen.getByRole("alert").textContent).toContain("This component changed");
	expect(useFlowStore.getState().nodes[0].data.node.description).toBe("Concurrent");
	expect(close).toHaveBeenCalledTimes(1);
});

test("bound inputs and internal controls cannot mutate source or request bindings", () => {
	reset(true); const original = structuredClone(useFlowStore.getState().nodes);
	render(<NativeInspector nodeId="component" onClose={() => {}} />);
	expect(screen.queryByRole("spinbutton")).toBeNull();
	expect(screen.queryByRole("switch")).toBeNull();
	expect(screen.getByText("The original flow controls these inputs. Changes require an atomic update to its source and bindings.")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Save component" }));
	expect(useFlowStore.getState().nodes).toEqual(original);
});

test("a disabled native numeric field emits no replacement default", () => {
	const changed = jest.fn();
	render(<DeclaredField name="minutes" nodeId="node" field={{ type: "int" }} value={75}
		disabled sourceBound={false} onChange={changed} />);
	expect(changed).not.toHaveBeenCalled();
});

test("policy integers reject zero and retain the last valid value", () => {
	const changed = jest.fn();
	render(<DeclaredField name="max_rounds" nodeId="node" field={{ type: "int", required: true }}
		value={51} sourceBound={false} onChange={changed} />);
	const input = screen.getByRole("spinbutton") as HTMLInputElement;
	fireEvent.change(input, { target: { value: "0" } });
	expect(input.checkValidity()).toBe(false);
	expect(changed).not.toHaveBeenCalled();
	fireEvent.change(input, { target: { value: "1000001" } });
	expect(input.checkValidity()).toBe(true);
	expect(changed).toHaveBeenLastCalledWith(1000001);
});
