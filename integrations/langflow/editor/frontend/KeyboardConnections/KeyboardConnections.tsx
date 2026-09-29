import { useState } from "react";
import type { Connection } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import useFlowStore from "@/stores/flowStore";
import { isValidConnection } from "@/utils/reactflowUtils";
import { EditorChoice } from "../EditorChoice";
import { connectEditorPorts, deleteEditorSelection } from "../graphActions";
import { graphPorts } from "../graphPorts";

export function KeyboardConnections() {
	const nodes = useFlowStore((state) => state.nodes);
	const edges = useFlowStore((state) => state.edges);
	const [source, setSource] = useState("");
	const [output, setOutput] = useState("");
	const [target, setTarget] = useState("");
	const [input, setInput] = useState("");
	const [edgeId, setEdgeId] = useState("new");
	const [message, setMessage] = useState("");
	const sourceNode = nodes.find((node) => node.id === source);
	const targetNode = nodes.find((node) => node.id === target);
	const retained = edges.filter((edge) => edge.id !== edgeId);
	const connection: Connection = { source, target, sourceHandle: output, targetHandle: input };
	const valid = Boolean(sourceNode && targetNode && graphPorts(sourceNode).outputs.some((port) => port.handle === output) && graphPorts(targetNode).inputs.some((port) => port.handle === input) && output && input && isValidConnection(connection, nodes, retained));
	const targets = output ? nodes.filter((node) => graphPorts(node).inputs.some((port) =>
		isValidConnection({ source, target: node.id, sourceHandle: output, targetHandle: port.handle }, nodes, retained))) : [];
	const inputs = targetNode && output ? graphPorts(targetNode).inputs.filter((port) =>
		isValidConnection({ ...connection, targetHandle: port.handle }, nodes, retained)) : [];
	const nodeChoice = (node: typeof nodes[number]) => ({ value: node.id, label: `${node.data.node?.display_name || node.data.type} · ${node.id}` });
	function chooseEdge(id: string) {
		setEdgeId(id); setMessage("");
		const edge = edges.find((item) => item.id === id);
		setSource(edge?.source ?? ""); setOutput(edge?.sourceHandle ?? "");
		setTarget(edge?.target ?? ""); setInput(edge?.targetHandle ?? "");
	}
	return <form className="flex flex-col gap-4" aria-label="Keyboard connections" onSubmit={(event) => {
		event.preventDefault();
		if (!valid || !connectEditorPorts(connection, edgeId === "new" ? undefined : edgeId)) {
			setMessage("Select compatible ports. The graph may have changed."); return;
		}
		chooseEdge("new"); setMessage("Connection saved. Undo restores the previous graph.");
	}}>
		<EditorChoice label="Connection" value={edgeId} onChange={chooseEdge} choices={[
			{ value: "new", label: "New connection" }, ...edges.map((edge) => ({ value: edge.id, label: `${edge.source} → ${edge.target} · ${edge.id}` })),
		]} />
		<EditorChoice label="Source component" value={source} choices={nodes.filter((node) => graphPorts(node).outputs.length).map(nodeChoice)} onChange={(id) => {
			setSource(id); setOutput(""); setTarget(""); setInput("");
		}} />
		<EditorChoice label="Output port" value={output} choices={(sourceNode ? graphPorts(sourceNode).outputs : []).map((port) => ({ value: port.handle, label: port.label }))} onChange={(id) => {
			setOutput(id); setTarget(""); setInput("");
		}} />
		<EditorChoice label="Target component" value={target} choices={targets.map(nodeChoice)} onChange={(id) => { setTarget(id); setInput(""); }} />
		<EditorChoice label="Input port" value={input} choices={inputs.map((port) => ({ value: port.handle, label: port.label }))} onChange={setInput} />
		<p role="status">{message || "Only compatible ports are available. Feedback ports name the loop boundary."}</p>
		<div className="flex flex-wrap gap-2">
			<Button type="submit" disabled={!valid}>Save connection</Button>
			<Button type="button" variant="secondary" onClick={() => chooseEdge("new")}>Cancel</Button>
			<Button type="button" variant="destructive" disabled={edgeId === "new" || !edges.some((edge) => edge.id === edgeId)} onClick={() => {
				deleteEditorSelection([], [edgeId]); chooseEdge("new"); setMessage("Connection deleted. Undo restores it.");
			}}>Delete connection</Button>
		</div>
	</form>;
}
