import { MagicWand } from "@phosphor-icons/react";
import type { FlowNodeKind } from "@trellis/api";
import { Button, toast } from "@trellis/ui";
import {
	Background,
	BackgroundVariant,
	type Connection,
	ConnectionLineType,
	ConnectionMode,
	Controls,
	MiniMap,
	type OnEdgesChange,
	type OnNodesChange,
	type OnSelectionChangeParams,
	Panel,
	ReactFlow,
	useReactFlow,
	type XYPosition,
} from "@xyflow/react";
import { type Dispatch, type DragEvent, type SetStateAction, useCallback, useRef } from "react";
import { ulid } from "ulid";
import { absolutePosition, boxAt, sizeOf } from "../../canvasGeometry";
import {
	addNode,
	branchOf,
	type CanvasEdge,
	type CanvasNode,
	canConnect,
	canvasEdge,
	type DraftGraph,
	KIND_MIME,
	moveIntoBox,
} from "../../flowDraft";
import { tidyLayout } from "../../flowLayout";
import { BoxNode } from "../BoxNode";
import { FlowEdge } from "../FlowEdge";
import { NodePalette } from "../NodePalette";
import { StepNode } from "../StepNode";

// React Flow draws every node and edge again when one of these objects
// changes, so they live outside the component.
const nodeTypes = { step: StepNode, box: BoxNode };
const edgeTypes = { flow: FlowEdge };

type FlowCanvasProps = {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
	graph: DraftGraph;
	onNodesChange: OnNodesChange<CanvasNode>;
	onEdgesChange: OnEdgesChange<CanvasEdge>;
	setNodes: Dispatch<SetStateAction<CanvasNode[]>>;
	setEdges: Dispatch<SetStateAction<CanvasEdge[]>>;
	onSelect: (id: string | null) => void;
};

// A left drag on the empty canvas pans, and a drag with Shift held draws a
// selection box. A two-finger scroll also pans, and a pinch zooms. Backspace and Delete remove
// the selection, and a box takes the nodes inside it with it. The loose
// connection mode lets a wire end on any handle, so any side connects to any
// side.
export function FlowCanvas(props: FlowCanvasProps) {
	const { nodes, edges, graph, onNodesChange, onEdgesChange, setNodes, setEdges, onSelect } = props;
	const rf = useReactFlow<CanvasNode, CanvasEdge>();
	const wrapRef = useRef<HTMLElement>(null);

	const add = (kind: FlowNodeKind, place: { drop: XYPosition } | { center: XYPosition }) => {
		const next = addNode(nodes, edges, kind, place);
		setNodes(next.nodes);
		setEdges(next.edges);
		onSelect(next.id);
	};

	const addAtCenter = (kind: FlowNodeKind) => {
		const frame = wrapRef.current!.getBoundingClientRect();
		add(kind, {
			center: rf.screenToFlowPosition({ x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 }),
		});
	};

	const onConnect = (connection: Connection) =>
		setEdges((current) => [
			...current,
			canvasEdge({
				id: ulid(),
				fromNodeId: connection.source,
				toNodeId: connection.target,
				branch: branchOf(connection.sourceHandle),
			}),
		]);

	// A node dropped with its center inside a box moves into that box. A node
	// dropped outside its box moves onto the canvas. A drag of several nodes
	// keeps every node in its box.
	const onNodeDragStop = (_event: unknown, node: CanvasNode, dragged: CanvasNode[]) => {
		if (dragged.length !== 1) return;
		const current = nodes.map((item) => (item.id === node.id ? node : item));
		const corner = absolutePosition(current, node.id);
		const { width, height } = sizeOf(node);
		const target = boxAt(current, { x: corner.x + width / 2, y: corner.y + height / 2 }, node.id);
		if (target === (node.parentId ?? null)) return;
		const next = moveIntoBox(current, edges, node.id, target);
		setNodes(next.nodes);
		setEdges(next.edges);
		if (next.removed > 0)
			toast(
				`Removed ${next.removed} ${next.removed === 1 ? "connection" : "connections"} that crossed the edge of a box.`,
			);
	};

	// Undo puts back the positions and the box sizes from before the clean up,
	// and keeps every other change.
	const cleanUp = () => {
		const before = new Map(nodes.map((node) => [node.id, node]));
		setNodes(tidyLayout(nodes, edges));
		requestAnimationFrame(() => void rf.fitView({ maxZoom: 1 }));
		toast("Cleaned up the layout.", {
			action: {
				label: "Undo",
				onClick: () =>
					setNodes((current) =>
						current.map((node) => {
							const old = before.get(node.id);
							return old === undefined
								? node
								: { ...node, position: old.position, width: old.width, height: old.height };
						}),
					),
			},
		});
	};

	const onSelectionChange = useCallback(
		({ nodes: picked }: OnSelectionChangeParams<CanvasNode, CanvasEdge>) =>
			onSelect(picked.length === 1 ? picked[0]!.id : null),
		[onSelect],
	);

	// Only a drag from the palette carries KIND_MIME, so a dropped file never
	// becomes a step.
	const onDragOver = (event: DragEvent) => {
		if (!event.dataTransfer.types.includes(KIND_MIME)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	};

	const onDrop = (event: DragEvent) => {
		event.preventDefault();
		add(event.dataTransfer.getData(KIND_MIME) as FlowNodeKind, {
			drop: rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
		});
	};

	return (
		<section
			ref={wrapRef}
			aria-label="Flow canvas"
			className="relative min-h-0 min-w-0 flex-1"
			onDragOver={onDragOver}
			onDrop={onDrop}
		>
			<ReactFlow<CanvasNode, CanvasEdge>
				className="flow-canvas"
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				isValidConnection={(connection) => canConnect(graph, connection)}
				connectionMode={ConnectionMode.Loose}
				connectionLineType={ConnectionLineType.SmoothStep}
				onNodeDragStop={onNodeDragStop}
				onSelectionChange={onSelectionChange}
				snapToGrid
				snapGrid={[8, 8]}
				fitView
				fitViewOptions={{ maxZoom: 1 }}
				minZoom={0.2}
				maxZoom={2}
				panOnScroll
				deleteKeyCode={["Backspace", "Delete"]}
			>
				<Background variant={BackgroundVariant.Dots} gap={24} />
				<Panel position="top-left">
					<NodePalette onAdd={addAtCenter} />
				</Panel>
				<Panel position="top-right">
					<Button icon={<MagicWand />} disabled={nodes.length === 0} onClick={cleanUp}>
						Clean up
					</Button>
				</Panel>
				<Controls position="bottom-left" showInteractive={false} />
				<MiniMap position="bottom-right" pannable zoomable />
			</ReactFlow>
		</section>
	);
}
