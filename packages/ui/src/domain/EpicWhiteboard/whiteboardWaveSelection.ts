import type { Editor } from "tldraw";
import type { WhiteboardWavePlacement, WhiteboardWaveSelection } from "./types";
import { whiteboardActions } from "./types";
import { isDependencyShape } from "./whiteboardDependencies";
import { waveShapeId } from "./whiteboardLayout";
import { isOutputLink } from "./whiteboardOutputLayout";

export function whiteboardWaveSelection(editor: Editor): WhiteboardWaveSelection | null {
	const selected = editor.getSelectedShapes();
	const roots = selected.filter(
		(shape) =>
			shape.type !== "trellis-wave" &&
			!isDependencyShape(shape) &&
			!isOutputLink(shape) &&
			!editor.getShapeAncestors(shape).some((ancestor) => selected.some((entry) => entry.id === ancestor.id)),
	);
	if (roots.length === 0) return null;
	const bounds = editor.getShapesPageBounds(roots.map((shape) => shape.id))!;
	const members = [...editor.getShapeAndDescendantIds(roots.map((shape) => shape.id))];
	return {
		ticketIds: members.flatMap((id) => {
			const shape = editor.getShape(id)!;
			return shape.type === "trellis-ticket" ? [shape.props.recordId] : [];
		}),
		shapes: roots.map((shape) => {
			const { x, y } = editor.getShapePageTransform(shape).applyToPoint({ x: 0, y: 0 });
			return { id: shape.id, x, y };
		}),
		bounds: { x: bounds.x - 24, y: bounds.y - 88, w: Math.max(368, bounds.w + 48), h: Math.max(304, bounds.h + 112) },
	};
}

export function createWaveFromSelection(editor: Editor) {
	const selection = whiteboardWaveSelection(editor);
	if (selection) whiteboardActions.get(editor)!.onCreateWave(selection);
}

export function placeWhiteboardWaves(editor: Editor, placements: readonly WhiteboardWavePlacement[]) {
	const placed: string[] = [];
	for (const placement of placements) {
		const id = waveShapeId(placement.waveId);
		const wave = editor.getShape(id);
		if (!wave) continue;
		const { x, y, w, h } = placement.bounds;
		editor.updateShape({
			id,
			type: "trellis-wave",
			x,
			y,
			props: { w, h },
			meta: { ...wave.meta, trellisSection: true },
		});
		for (const member of placement.shapes) {
			if (!editor.getShape(member.id)) continue;
			editor.reparentShapes([member.id], id);
			const point = editor.getPointInShapeSpace(id, member);
			editor.updateShape({ id: member.id, type: editor.getShape(member.id)!.type, x: point.x, y: point.y });
		}
		editor.select(id);
		placed.push(placement.waveId);
	}
	return placed;
}
