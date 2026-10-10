import { createShapeId, type Editor, type TLShape } from "tldraw";
import type { WhiteboardCard } from "./types";

const dependencyShapeId = (from: string, to: string) => createShapeId(`dependency-${from}-${to}`);
const ticketId = (id: string) => createShapeId(`ticket-${id}`);
export const isDependencyShape = (shape: TLShape) =>
	shape.type === "arrow" && typeof shape.meta.trellisDependencyFrom === "string";
export const isCanonicalDependency = (shape: TLShape) =>
	isDependencyShape(shape) &&
	shape.id === dependencyShapeId(String(shape.meta.trellisDependencyFrom), String(shape.meta.trellisDependencyTo));

export function reconcileDependencies(editor: Editor, tickets: readonly WhiteboardCard[]) {
	const ids = new Set(tickets.map((ticket) => ticket.id));
	const dependencies = tickets.flatMap((ticket) =>
		ticket.waitsOn.filter((id) => ids.has(id)).map((from) => ({ from, to: ticket.id })),
	);
	const expected = new Set(dependencies.map(({ from, to }) => dependencyShapeId(from, to)));
	editor.deleteShapes(
		editor
			.getCurrentPageShapes()
			.filter((shape) => isDependencyShape(shape) && !expected.has(shape.id))
			.map((shape) => shape.id),
	);
	for (const { from, to } of dependencies) {
		const id = dependencyShapeId(from, to);
		if (editor.getShape(id)) continue;
		editor.createShape({
			id,
			type: "arrow",
			isLocked: true,
			props: { kind: "elbow", color: "blue", dash: "solid", size: "s", arrowheadEnd: "arrow" },
			meta: { trellisDependencyFrom: from, trellisDependencyTo: to },
		});
		editor.createBindings([
			{
				type: "arrow",
				fromId: id,
				toId: ticketId(from),
				props: { terminal: "start", normalizedAnchor: { x: 1, y: 0.5 }, isExact: false, isPrecise: true, snap: "edge" },
			},
			{
				type: "arrow",
				fromId: id,
				toId: ticketId(to),
				props: { terminal: "end", normalizedAnchor: { x: 0, y: 0.5 }, isExact: false, isPrecise: true, snap: "edge" },
			},
		]);
	}
}
