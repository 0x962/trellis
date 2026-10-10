import { createShapeId, type Editor, type TLShape, toRichText } from "tldraw";
import type { WhiteboardOutput, WhiteboardOutputEndpoint, WhiteboardOutputLink } from "./outputTypes";
import { sessionShapeId } from "./placeWhiteboardSessions";
import type { WhiteboardSession } from "./types";
import { vacantOutputPosition } from "./vacantOutputPosition";
import { isDependencyShape } from "./whiteboardDependencies";
import { ticketShapeId } from "./whiteboardLayout";

const outputShapeId = (id: string) => createShapeId(`output-${id}`);
const endpointId = ({ kind, id }: WhiteboardOutputEndpoint) =>
	kind === "ticket" ? ticketShapeId(id) : kind === "session" ? sessionShapeId(id) : outputShapeId(id);
const linkId = (link: WhiteboardOutputLink) =>
	createShapeId(`output-link-${endpointId(link.from)}-${endpointId(link.to)}`);
export const isOutputLink = (shape: TLShape) => shape.type === "arrow" && shape.meta.trellisOutput === true;
const isSubagentLink = (shape: TLShape) => isOutputLink(shape) && shape.meta.trellisOutputRelation === "Subagent";
export const isOutputShape = (shape: TLShape) => shape.type === "trellis-output" || shape.meta.trellisOutput === true;
export const isCanonicalOutput = (shape: TLShape) =>
	(shape.type === "trellis-output" && shape.id === outputShapeId(shape.props.recordId)) ||
	(shape.type === "trellis-session" &&
		shape.meta.trellisOutput === true &&
		shape.id === sessionShapeId(shape.props.runId)) ||
	(isOutputLink(shape) &&
		shape.id === createShapeId(`output-link-${shape.meta.trellisOutputFrom}-${shape.meta.trellisOutputTo}`));

export function reconcileWhiteboardOutputs(
	editor: Editor,
	outputs: readonly WhiteboardOutput[],
	sessions: readonly WhiteboardSession[],
	links: readonly WhiteboardOutputLink[],
) {
	const expected = new Set([
		...outputs.map((output) => outputShapeId(output.id)),
		...links.flatMap((link) => [link.from, link.to].filter((endpoint) => endpoint.kind === "session").map(endpointId)),
		...links.map(linkId),
	]);
	for (const shape of editor.getCurrentPageShapes()) {
		if (isSubagentLink(shape)) {
			const source = editor.getShape(String(shape.meta.trellisOutputFrom) as TLShape["id"]);
			if (source) {
				expected.add(source.id);
				expected.add(shape.id);
			}
		}
	}
	editor.deleteShapes(
		editor
			.getCurrentPageShapes()
			.filter(
				(shape) =>
					isOutputShape(shape) &&
					!expected.has(shape.id) &&
					!(shape.type === "trellis-output" && shape.props.kind === "subagent"),
			)
			.map((shape) => shape.id),
	);
	const slots = new Map<string, number>();
	for (const link of links) {
		const fromId = endpointId(link.from);
		const toId = endpointId(link.to);
		const source = editor.getShapePageBounds(fromId);
		if (!source) continue;
		const slot = slots.get(fromId) ?? 0;
		slots.set(fromId, slot + 1);
		if (!editor.getShape(toId) && link.to.kind !== "ticket") {
			const output = outputs.find((entry) => entry.id === link.to.id);
			const w = output?.kind === "pull-request" ? 280 : 160;
			const h = output?.kind === "pull-request" ? 144 : 112;
			const occupied = editor.getCurrentPageShapes().flatMap((shape) => {
				if (["trellis-wave", "frame", "group"].includes(shape.type) || isOutputLink(shape) || isDependencyShape(shape))
					return [];
				return [editor.getShapePageBounds(shape)!];
			});
			const { x, y } = vacantOutputPosition({ x: source.maxX + 80, y: source.y + slot * 168, w, h }, occupied);
			if (link.to.kind === "session") {
				const session = sessions.find((entry) => entry.id === link.to.id)!;
				editor.createShape({
					id: toId,
					type: "trellis-session",
					x,
					y,
					props: { runId: session.id, sessionId: "", label: session.label, w: 160, h: 112 },
					meta: { trellisOutput: true },
				});
			} else {
				const output = outputs.find((entry) => entry.id === link.to.id)!;
				editor.createShape({
					id: toId,
					type: "trellis-output",
					x,
					y,
					props: {
						recordId: output.id,
						kind: output.kind,
						label: output.label,
						w,
						h,
					},
				});
			}
		}
		if (!editor.getShape(toId) || editor.getShape(linkId(link))) continue;
		const id = linkId(link);
		editor.createShape({
			id,
			type: "arrow",
			isLocked: true,
			props: {
				kind: "elbow",
				color: "grey",
				dash: "dashed",
				size: "s",
				arrowheadEnd: "arrow",
				richText: toRichText(link.label),
			},
			meta: {
				trellisOutput: true,
				trellisOutputFrom: fromId,
				trellisOutputTo: toId,
				trellisOutputRelation: link.label,
			},
		});
		editor.createBindings([
			{
				type: "arrow",
				fromId: id,
				toId: fromId,
				props: { terminal: "start", normalizedAnchor: { x: 1, y: 0.5 }, isExact: false, isPrecise: true, snap: "edge" },
			},
			{
				type: "arrow",
				fromId: id,
				toId,
				props: { terminal: "end", normalizedAnchor: { x: 0, y: 0.5 }, isExact: false, isPrecise: true, snap: "edge" },
			},
		]);
	}
}
