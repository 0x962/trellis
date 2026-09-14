import { Archive, ArrowClockwise, SlidersHorizontal } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { FlowDoc, Persona } from "@trellis/api";
import { ConfirmDialog, IconButton, Tooltip } from "@trellis/ui";
import { useEdgesState, useNodesState, useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageTitle } from "../../../../shell/PageTitle";
import { Topbar } from "../../../../shell/Topbar";
import type { createDraftRecovery } from "../../draftRecovery";
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

export function FlowWorkspaceContent({
	doc,
	personas,
	onReload,
	recovery,
	onRecover,
	paused,
}: FlowWorkspaceProps & {
	recovery: ReturnType<typeof createDraftRecovery>;
	onRecover: () => void;
	paused: boolean;
}) {
	const rf = useReactFlow<CanvasNode, CanvasEdge>();
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
	const [submission, setSubmission] = useState<{ nodes: CanvasNode[]; edges: CanvasEdge[] } | null>(null);

	const graph = useMemo(() => fromCanvas(nodes, edges), [nodes, edges]);
	const issues = useMemo(() => draftIssues(flow.id, graph), [flow.id, graph]);
	const submittedGraph = useMemo(
		() => (submission === null ? graph : fromCanvas(submission.nodes, submission.edges)),
		[submission, graph],
	);
	const autosave = useFlowAutosave({
		flow,
		graph: submittedGraph,
		canSave: draftIssues(flow.id, submittedGraph).canSave,
		paused,
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
	const closeInspector = useCallback(() => {
		setSelectedId(null);
		setNodes((current) => current.map((node) => ({ ...node, selected: false })));
	}, [setNodes]);
	const submitting = submission !== null && !["error", "conflict", "invalid"].includes(autosave.status);
	useEffect(() => {
		if (submission === null || autosave.status !== "saved") return;
		setNodes(submission.nodes);
		setEdges(submission.edges);
		setSubmission(null);
		closeInspector();
	}, [autosave.status, closeInspector, submission, setNodes, setEdges]);
	const editCanvas = (fields: StepFields) => {
		const children = new Set(nodes.filter((node) => node.parentId === fields.id).map((node) => node.id));
		const turnsParallel = fields.parallel && !nodes.find((node) => node.id === fields.id)!.data.fields.parallel;
		return {
			nodes: nodes.map((node) => (node.id === fields.id ? { ...node, data: { fields } } : node)),
			edges: turnsParallel ? edges.filter((edge) => !children.has(edge.source)) : edges,
		};
	};
	const cancelInspector = () => {
		setSubmission(null);
		if (submission !== null) autosave.discardSubmission();
		closeInspector();
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
						{autosave.status === "error" && submission === null && (
							<Tooltip content="Retry the save">
								<IconButton label="Retry the save" icon={<ArrowClockwise />} onClick={autosave.retry} />
							</Tooltip>
						)}
						{recovery.candidates().length > 0 && (
							<Tooltip content="Recover imported draft">
								<IconButton
									label="Recover imported draft"
									icon={<Archive />}
									onClick={onRecover}
									disabled={autosave.status === "saving"}
								/>
							</Tooltip>
						)}
						<Tooltip content="Flow settings">
							<IconButton
								label="Flow settings"
								icon={<SlidersHorizontal />}
								disabled={submitting}
								onClick={() => setSettingsOpen(true)}
							/>
						</Tooltip>
					</>
				}
			>
				<PageTitle parent={<Link to="/ai/flows">Flows</Link>} title={flow.name} />
			</Topbar>
			<div className="page-card relative flex flex-1 overflow-hidden">
				<div className="flex min-w-0 flex-1" inert={submission !== null}>
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
				</div>
				{selected !== undefined && (
					<NodeInspector
						key={selected.id}
						fields={selected.data.fields}
						issue={autosave.status === "error" || autosave.status === "conflict" ? autosave.message : undefined}
						personas={personas}
						validate={(fields) => {
							const canvas = editCanvas(fields);
							const result = draftIssues(flow.id, fromCanvas(canvas.nodes, canvas.edges));
							return { canSave: result.canSave, issue: result.byRow.get(fields.id) };
						}}
						onClose={cancelInspector}
						onSave={(fields) => {
							setSubmission(editCanvas(fields));
							autosave.saveNow();
						}}
						saving={submitting}
						canSave={autosave.status !== "conflict"}
						onDelete={() => {
							cancelInspector();
							void rf.deleteElements({ nodes: [{ id: selected.id }] });
						}}
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
					recovery.discard();
					onReload();
				}}
			/>
			{settingsOpen && <FlowSettingsSheet flow={flow} onSaved={setFlow} onClose={() => setSettingsOpen(false)} />}
		</FlowEditorContext>
	);
}
