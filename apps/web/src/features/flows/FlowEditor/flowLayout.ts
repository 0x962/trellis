import { sizeOf } from "./canvasGeometry";
import { BOX_PAD, type CanvasEdge, type CanvasNode } from "./flowDraft";

// The space between two nodes in one row, and between two rows.
const GAP = { node: 48, rank: 72 };
// The smallest box that `tidyLayout` draws, so an empty box stays easy to hit.
const BOX_MIN = { width: 240, height: 120 };
// Every position lands on the 8 px canvas grid. A size rounds up, so a box
// never clips the nodes inside it.
const snap = (value: number) => Math.round(value / 8) * 8;
const snapUp = (value: number) => Math.ceil(value / 8) * 8;

type Placement = { x: number; y: number; width?: number; height?: number };
type Size = { width: number; height: number };

const rankRows = (list: CanvasNode[], edges: CanvasEdge[]): CanvasNode[][] => {
	const ids = new Set(list.map((node) => node.id));
	const incoming = new Map(list.map((node) => [node.id, 0]));
	const outgoing = new Map(list.map((node) => [node.id, [] as string[]]));
	for (const edge of edges) {
		if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
		incoming.set(edge.target, incoming.get(edge.target)! + 1);
		outgoing.get(edge.source)!.push(edge.target);
	}
	const rank = new Map(list.map((node) => [node.id, 0]));
	const ready = list.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
	for (let index = 0; index < ready.length; index++) {
		const source = ready[index]!;
		for (const target of outgoing.get(source)!) {
			rank.set(target, Math.max(rank.get(target)!, rank.get(source)! + 1));
			incoming.set(target, incoming.get(target)! - 1);
			if (incoming.get(target) === 0) ready.push(target);
		}
	}
	const rows: CanvasNode[][] = [];
	for (const node of list) (rows[rank.get(node.id)!] ??= []).push(node);
	return rows;
};

const placeRows = (
	rows: CanvasNode[][],
	sizes: Map<string, Size>,
	offset: { x: number; y: number },
	placed: Map<string, Placement>,
): Size => {
	const widths = rows.map(
		(row) => row.reduce((sum, node) => sum + sizes.get(node.id)!.width, 0) + (row.length - 1) * GAP.node,
	);
	const contentWidth = Math.max(...widths);
	let y = offset.y;
	for (const [index, row] of rows.entries()) {
		const height = Math.max(...row.map((node) => sizes.get(node.id)!.height));
		let x = offset.x + (contentWidth - widths[index]!) / 2;
		for (const node of row) {
			const size = sizes.get(node.id)!;
			placed.set(node.id, {
				x: snap(x),
				y: snap(y),
				...(node.type === "box" ? { width: snapUp(size.width), height: snapUp(size.height) } : {}),
			});
			x += size.width + GAP.node;
		}
		y += height + GAP.rank;
	}
	return { width: contentWidth, height: y - GAP.rank - offset.y };
};

// Places every node from top to bottom along its edges. Each box gets its own
// layout, the innermost box first. A box then takes the size that holds its
// nodes, so the scope around it places the box as one node of that size.
export const tidyLayout = (nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode[] => {
	const members = new Map<string | null, CanvasNode[]>();
	for (const node of nodes) {
		const scope = node.parentId ?? null;
		members.set(scope, [...(members.get(scope) ?? []), node]);
	}
	const placed = new Map<string, Placement>();

	// Lays out the nodes of one scope and returns the size of a box that holds them.
	const layOut = (scope: string | null): { width: number; height: number } => {
		const list = members.get(scope) ?? [];
		if (list.length === 0) return BOX_MIN;
		const sizes = new Map(list.map((node) => [node.id, node.type === "box" ? layOut(node.id) : sizeOf(node)]));
		if (nodes.find((node) => node.id === scope)?.data.fields.parallel) {
			const columns = Math.min(2, list.length);
			const widths = Array.from({ length: columns }, (_, column) =>
				Math.max(...list.filter((_, index) => index % columns === column).map((node) => sizes.get(node.id)!.width)),
			);
			let y = BOX_PAD.top;
			for (let start = 0; start < list.length; start += columns) {
				const row = list.slice(start, start + columns);
				let x = BOX_PAD.side;
				for (const [column, node] of row.entries()) {
					const size = sizes.get(node.id)!;
					placed.set(node.id, {
						x: snap(x),
						y: snap(y),
						...(node.type === "box" ? { width: snapUp(size.width), height: snapUp(size.height) } : {}),
					});
					x += widths[column]! + GAP.node;
				}
				y += Math.max(...row.map((node) => sizes.get(node.id)!.height)) + GAP.rank;
			}
			return {
				width: snapUp(
					Math.max(
						widths.reduce((sum, width) => sum + width, 0) + (columns - 1) * GAP.node + 2 * BOX_PAD.side,
						BOX_MIN.width,
					),
				),
				height: snapUp(Math.max(y - GAP.rank + BOX_PAD.bottom, BOX_MIN.height)),
			};
		}
		const offset = scope === null ? { x: 0, y: 0 } : { x: BOX_PAD.side, y: BOX_PAD.top };
		const size = placeRows(rankRows(list, edges), sizes, offset, placed);
		return {
			width: snapUp(Math.max(size.width + 2 * BOX_PAD.side, BOX_MIN.width)),
			height: snapUp(Math.max(size.height + BOX_PAD.top + BOX_PAD.bottom, BOX_MIN.height)),
		};
	};

	layOut(null);
	return nodes.map((node) => {
		const place = placed.get(node.id)!;
		return {
			...node,
			position: { x: place.x, y: place.y },
			...(place.width === undefined ? {} : { width: place.width, height: place.height }),
		};
	});
};
