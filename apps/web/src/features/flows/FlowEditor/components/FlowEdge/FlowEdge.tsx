import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getSmoothStepPath,
	type InternalNode,
	Position,
	useInternalNode,
	type XYPosition,
} from "@xyflow/react";
import { useFlowEditor } from "../../editorContext";
import type { CanvasEdge, CanvasNode } from "../../flowDraft";

type Rect = { x: number; y: number; width: number; height: number };

const rectOf = (node: InternalNode<CanvasNode>): Rect => ({
	x: node.internals.positionAbsolute.x,
	y: node.internals.positionAbsolute.y,
	width: node.measured.width ?? 0,
	height: node.measured.height ?? 0,
});

// The side of `from` that faces `to`. The axis with the wider gap between the
// two rectangles wins. A tie goes to the top and the bottom, because a flow
// reads from top to bottom.
const facingSide = (from: Rect, to: Rect) => {
	const dx = to.x + to.width / 2 - (from.x + from.width / 2);
	const dy = to.y + to.height / 2 - (from.y + from.height / 2);
	const gapX = Math.abs(dx) - (from.width + to.width) / 2;
	const gapY = Math.abs(dy) - (from.height + to.height) / 2;
	if (gapY >= gapX) return dy >= 0 ? Position.Bottom : Position.Top;
	return dx >= 0 ? Position.Right : Position.Left;
};

// The point `at` of the way along one side of a rectangle.
const pointOn = (rect: Rect, side: Position, at: number): XYPosition => {
	if (side === Position.Top) return { x: rect.x + rect.width * at, y: rect.y };
	if (side === Position.Bottom) return { x: rect.x + rect.width * at, y: rect.y + rect.height };
	if (side === Position.Left) return { x: rect.x, y: rect.y + rect.height * at };
	return { x: rect.x + rect.width, y: rect.y + rect.height * at };
};

// The direction that points out of a rectangle through one side.
const normals: Record<Position, XYPosition> = {
	[Position.Top]: { x: 0, y: -1 },
	[Position.Bottom]: { x: 0, y: 1 },
	[Position.Left]: { x: -1, y: 0 },
	[Position.Right]: { x: 1, y: 0 },
};

// YES leaves a gate one third along the side and NO two thirds along, where
// the gate draws those handles.
const along = { out: 0.5, yes: 1 / 3, no: 2 / 3 } as const;

const ARROW = { length: 8, half: 4.5 };

// A filled triangle whose tip touches the side of the node the edge leads to.
const arrowPath = (tip: XYPosition, side: Position) => {
	const out = normals[side];
	const base = { x: tip.x + out.x * ARROW.length, y: tip.y + out.y * ARROW.length };
	const across = { x: Math.abs(out.y), y: Math.abs(out.x) };
	const left = { x: base.x + across.x * ARROW.half, y: base.y + across.y * ARROW.half };
	const right = { x: base.x - across.x * ARROW.half, y: base.y - across.y * ARROW.half };
	return `M ${left.x} ${left.y} L ${right.x} ${right.y} L ${tip.x} ${tip.y} Z`;
};

// The step a wire draws to or from, in place of a box: the box maps to the
// step it starts or ends at, and a box nested inside maps again.
const follow = (id: string, map: Map<string, string>) => {
	let current = id;
	while (map.has(current)) current = map.get(current)!;
	return current;
};

// An edge drawn between the two sides of its nodes that face each other, so a
// wire from any side reads the same after a reload. It ends in an arrow at the
// node it leads to. A wire into a box draws to the step the box
// starts at, and a wire out of a box draws from its last step, so the arrows
// read through the box. React Flow draws an edge only after it measures both
// nodes, so both internal nodes exist here.
export function FlowEdge({ id, source, target, data, label }: EdgeProps<CanvasEdge>) {
	const { entryOf, exitOf } = useFlowEditor();
	const fromNode = useInternalNode<CanvasNode>(follow(source, exitOf))!;
	const from = rectOf(fromNode);
	const to = rectOf(useInternalNode<CanvasNode>(follow(target, entryOf))!);
	const fromSide = facingSide(from, to);
	const toSide = facingSide(to, from);
	const start = pointOn(from, fromSide, along[data!.branch]);
	const tip = pointOn(to, toSide, 0.5);
	const out = normals[toSide];
	const [path, labelX, labelY] = getSmoothStepPath({
		sourceX: start.x,
		sourceY: start.y,
		sourcePosition: fromSide,
		targetX: tip.x + out.x * ARROW.length,
		targetY: tip.y + out.y * ARROW.length,
		targetPosition: toSide,
		borderRadius: 8,
	});
	return (
		<>
			<BaseEdge id={id} path={path} />
			{(fromNode.data.fields.kind === "gate" || fromNode.data.fields.kind === "group") && (
				<circle cx={start.x} cy={start.y} className="flow-edge-anchor" data-branch={data!.branch} />
			)}
			<path d={arrowPath(tip, toSide)} className="flow-edge-arrow" />
			{label !== undefined && (
				<EdgeLabelRenderer>
					<div
						style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
						className="nodrag nopan pointer-events-none absolute rounded-sm bg-bg px-1 text-xs text-fg-muted"
					>
						{label}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}
