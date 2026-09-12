import { ArrowClockwise, SlidersHorizontal } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { FlowDoc, Persona } from "@trellis/api";
import { IconButton, Tooltip } from "@trellis/ui";
import { useEdgesState, useNodesState, useReactFlow } from "@xyflow/react";
import { useMemo, useState } from "react";
import { Topbar } from "../../../../shell/Topbar";
import { FlowEditorContext } from "../../editorContext";
import {
	boxEnds,
	type CanvasEdge,
	type CanvasNode,
	draftIssues,
	edgesWithIssues,
	fromCanvas,
	type StepFields,
	toCanvas,
} from "../../flowDraft";
import { type AutosaveStatus, useFlowAutosave } from "../../hooks/useFlowAutosave";
import { FlowCanvas } from "../FlowCanvas";
import { FlowSettingsSheet } from "../FlowSettingsSheet";
import { NodeInspector } from "../NodeInspector";

type FlowWorkspaceProps = { doc: FlowDoc; personas: Persona[]; onReload: () => void };

// The bar names a save only when the person has to act on it.
const problemText = (status: AutosaveStatus, count: number) =>
	({
		saved: "",
		pending: "",
		saving: "",
		invalid: `Not saved: ${count} ${count === 1 ? "issue" : "issues"}`,
		conflict: "Not saved: the flow changed in another window",
		error: "Not saved: the save failed",
	})[status];

// The editor of one flow. The canvas rows load once, when the workspace
// mounts, so a later refetch of the flow never replaces the draft. Every
// change runs the flow rules, and the draft saves when it has no issue.
export function FlowWorkspace({ doc, personas, onReload }: FlowWorkspaceProps) {
	const rf = useReactFlow<CanvasNode, CanvasEdge>();
	const [initial] = useState(() => toCanvas(doc));
	const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(initial.nodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(initial.edges);
	const [flow, setFlow] = useState(doc.flow);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);

	const graph = useMemo(() => fromCanvas(nodes, edges), [nodes, edges]);
	const issues = useMemo(() => draftIssues(flow.id, graph), [flow.id, graph]);
	const autosave = useFlowAutosave({ flow, graph, valid: issues.count === 0, onSaved: setFlow });
	const shownEdges = useMemo(() => edgesWithIssues(edges, issues.byRow), [edges, issues]);
	const editor = useMemo(
		() => ({
			personas: new Map(personas.map((persona) => [persona.id, persona])),
			issues: issues.byRow,
			...boxEnds(graph),
		}),
		[personas, issues, graph],
	);
	const selected = selectedId === null ? undefined : nodes.find((node) => node.id === selectedId);
	const change = (patch: Partial<StepFields>) =>
		setNodes((current) =>
			current.map((node) =>
				node.id === selectedId ? { ...node, data: { fields: { ...node.data.fields, ...patch } } } : node,
			),
		);

	return (
		<FlowEditorContext value={editor}>
			<Topbar
				actions={
					<>
						<span role="status" className="text-xs tabular-nums text-danger">
							{problemText(autosave.status, issues.count)}
						</span>
						{autosave.status === "conflict" && (
							<Tooltip content="Reload the flow">
								<IconButton label="Reload the flow" icon={<ArrowClockwise />} onClick={onReload} />
							</Tooltip>
						)}
						{autosave.status === "error" && (
							<Tooltip content="Retry the save">
								<IconButton label="Retry the save" icon={<ArrowClockwise />} onClick={autosave.retry} />
							</Tooltip>
						)}
						<Tooltip content="Flow settings">
							<IconButton label="Flow settings" icon={<SlidersHorizontal />} onClick={() => setSettingsOpen(true)} />
						</Tooltip>
					</>
				}
			>
				<Link to="/ai/flows" className="text-lg text-fg-muted transition-colors duration-hover hover:text-fg">
					Flows
				</Link>
				<span aria-hidden="true" className="text-fg-faint">
					/
				</span>
				<h1 className="truncate text-lg font-semibold text-fg">{flow.name}</h1>
			</Topbar>
			<div className="relative flex min-h-0 flex-1">
				<FlowCanvas
					nodes={nodes}
					edges={shownEdges}
					graph={graph}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					setNodes={setNodes}
					setEdges={setEdges}
					onSelect={setSelectedId}
				/>
				{selected !== undefined && (
					<NodeInspector
						key={selected.id}
						fields={selected.data.fields}
						issue={issues.byRow.get(selected.id)}
						personas={personas}
						onChange={change}
						onDelete={() => void rf.deleteElements({ nodes: [{ id: selected.id }] })}
					/>
				)}
			</div>
			{settingsOpen && <FlowSettingsSheet flow={flow} onSaved={setFlow} onClose={() => setSettingsOpen(false)} />}
		</FlowEditorContext>
	);
}
