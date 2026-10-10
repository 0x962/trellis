import { createShapeId, type Editor, type TLShape, type TLShapePartial } from "tldraw";
import type { WhiteboardCard, WhiteboardWave } from "./types";
import { reconcileDependencies } from "./whiteboardDependencies";

export const ticketShapeId = (id: string) => createShapeId(`ticket-${id}`);
export const waveShapeId = (id: string) => createShapeId(`wave-${id}`);
export const isRecordShape = (shape: TLShape) => shape.type === "trellis-ticket" || shape.type === "trellis-wave";
export const isCanonicalShape = (shape: TLShape) =>
	(shape.type === "trellis-ticket" && shape.id === ticketShapeId(shape.props.recordId)) ||
	(shape.type === "trellis-wave" && shape.id === waveShapeId(shape.props.recordId));

export function reconcileWhiteboard(
	editor: Editor,
	waves: readonly WhiteboardWave[],
	tickets: readonly WhiteboardCard[],
) {
	const expected = new Set([
		...waves.map((wave) => waveShapeId(wave.id)),
		...tickets.map((ticket) => ticketShapeId(ticket.id)),
	]);
	editor.run(
		() => {
			const removed = editor.getCurrentPageShapes().filter((shape) => isRecordShape(shape) && !expected.has(shape.id));
			editor.store.remove(removed.map((shape) => shape.id));
			for (const [index, wave] of waves.entries()) {
				const id = waveShapeId(wave.id);
				const count = tickets.filter((ticket) => ticket.waveId === wave.id).length;
				const existing = editor.getShape(id);
				if (!existing) {
					editor.createShape({
						id,
						type: "trellis-wave",
						x: index * 416,
						y: 0,
						props: { recordId: wave.id, w: 368, h: Math.max(304, 112 + count * 248) },
					});
				} else if (
					existing.type === "trellis-wave" &&
					!existing.meta.trellisSection &&
					existing.props.h < 112 + count * 248
				) {
					editor.updateShape({ id, type: "trellis-wave", props: { h: 112 + count * 248 } });
				}
			}
			const counts = new Map<string | null, number>();
			for (const ticket of tickets) {
				const index = counts.get(ticket.waveId) ?? 0;
				counts.set(ticket.waveId, index + 1);
				const id = ticketShapeId(ticket.id);
				const parentId = ticket.waveId === null ? editor.getCurrentPageId() : waveShapeId(ticket.waveId);
				const existing = editor.getShape(id);
				const shape: TLShapePartial = {
					id,
					type: "trellis-ticket",
					parentId,
					x: ticket.waveId === null ? waves.length * 416 : 24,
					y: 88 + index * 248,
					props: { recordId: ticket.id, w: 320, h: 224 },
				};
				if (!existing) editor.createShape(shape);
				else if (existing.parentId !== parentId) editor.updateShape(shape);
				else if (existing.type === "trellis-ticket" && existing.props.h !== 224)
					editor.updateShape({ id, type: "trellis-ticket", props: { h: 224 } });
			}
			reconcileDependencies(editor, tickets);
		},
		{ history: "ignore", ignoreShapeLock: true },
	);
}
