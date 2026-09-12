import { ArrowClockwise, SlidersHorizontal } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { FlowDoc, Persona } from "@trellis/api";
import { ConfirmDialog, IconButton, Tooltip } from "@trellis/ui";
import { useEdgesState, useNodesState, useReactFlow } from "@xyflow/react";
import { useMemo, useState } from "react";
import { PageTitle } from "../../../../shell/PageTitle";
import { Topbar } from "../../../../shell/Topbar";
import { createDraftRecovery } from "../../draftRecovery";
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

const saveText = (status: AutosaveStatus) =>
	({
		saved: "Saved",
		pending: "Pending save",
		saving: "Save in progress",
		invalid: "Draft kept in this browser",
		conflict: "Draft kept: the flow changed in another window",
		error: "Draft kept: the save failed",
	})[status];

export function FlowWorkspace({ doc, personas, onReload }: FlowWorkspaceProps) {
	const rf = useReactFlow<CanvasNode, CanvasEdge>();
	const [recovery] = useState(() => {
		let tab = sessionStorage.getItem("trellis.flow-tab");
		if (tab === null) {
			tab = crypto.randomUUID();
			sessionStorage.setItem("trellis.flow-tab", tab);
		}
		return createDraftRecovery(localStorage, tab, doc.flow.id);
	});
	const [stored] = useState(() => recovery.read());
	const [initial] = useState(() => toCanvas(stored === null ? doc : stored.graph));
	const [initialSavedJson] = useState(() => {
		const canvas = toCanvas(doc);
		return JSON.stringify(fromCanvas(canvas.nodes, canvas.edges));
	});
	const [confirmReload, setConfirmReload] = useState(false);
	const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(initial.nodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(initial.edges);
	const [flow, setFlow] = useState(() => ({ ...doc.flow, version: stored?.version ?? doc.flow.version }));
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);

	const graph = useMemo(() => fromCanvas(nodes, edges), [nodes, edges]);
	const issues = useMemo(() => draftIssues(flow.id, graph), [flow.id, graph]);
	const autosave = useFlowAutosave({
		flow,
		graph,
		canSave: issues.canSave,
		initialSavedJson,
		recovery,
		onSaved: setFlow,
	});
	const shownEdges = useMemo(() => edgesWithIssues(edges, issues.byRow), [edges, issues]);
	const editor = useMemo(
		() => ({
			personas: new Map(personas.map((persona) => [persona.id, persona])),
			issues: issues.byRow,
			unconnected: new Set(
				nodes
					.filter((node) => nodes.some((parent) => parent.id === node.parentId && parent.data.fields.parallel))
					.map((node) => node.id),
			),
			...boxEnds(graph),
		}),
		[personas, issues, graph, nodes],
	);
	const selected = selectedId === null ? undefined : nodes.find((node) => node.id === selectedId);
	const change = (patch: Partial<StepFields>) => {
		if (patch.parallel === true) {
			const children = new Set(nodes.filter((node) => node.parentId === selectedId).map((node) => node.id));
			setEdges((current) => current.filter((edge) => !children.has(edge.source)));
		}
		setNodes((current) =>
			current.map((node) =>
				node.id === selectedId ? { ...node, data: { fields: { ...node.data.fields, ...patch } } } : node,
			),
		);
	};

	return (
		<FlowEditorContext value={editor}>
			<Topbar
				actions={
					<>
						<span role="status" title={autosave.message} className="text-xs tabular-nums text-fg-muted">
							{saveText(autosave.status)}
							{issues.count > 0 ? ` · ${issues.count} ${issues.count === 1 ? "issue" : "issues"}` : ""}
						</span>
						{autosave.status === "conflict" && (
							<Tooltip content="Reload the flow">
								<IconButton label="Reload the flow" icon={<ArrowClockwise />} onClick={() => setConfirmReload(true)} />
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
				<PageTitle parent={<Link to="/ai/flows">Flows</Link>} title={flow.name} />
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
			<ConfirmDialog
				open={confirmReload}
				onCancel={() => setConfirmReload(false)}
				title="Discard this draft?"
				description="This replaces your browser draft with the graph saved on the server."
				confirmLabel="Discard draft"
				onConfirm={() => {
					recovery.clear();
					onReload();
				}}
			/>
			{settingsOpen && <FlowSettingsSheet flow={flow} onSaved={setFlow} onClose={() => setSettingsOpen(false)} />}
		</FlowEditorContext>
	);
}
