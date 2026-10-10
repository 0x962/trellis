import { useEffect, useState } from "react";
import { type Editor, useValue } from "tldraw";
import type { WhiteboardWave } from "../../types";

export function WhiteboardWaveControls({
	editor,
	waves,
	focusWaveId,
}: {
	editor: Editor;
	waves: readonly WhiteboardWave[];
	focusWaveId?: string | null;
}) {
	const [activeId, setActiveId] = useState(waves.find((wave) => wave.current)?.id ?? waves[0]?.id);
	const selectedId = useValue("selected wave", () => {
		const shape = editor.getSelectedShapes()[0];
		if (shape?.type === "trellis-wave") return shape.props.recordId;
		if (shape?.type === "trellis-ticket") {
			const parent = editor.getShape(shape.parentId);
			if (parent?.type === "trellis-wave") return parent.props.recordId;
		}
		return null;
	}, [editor]);
	useEffect(() => {
		if (selectedId) setActiveId(selectedId);
	}, [selectedId]);
	const wave = waves.find((entry) => entry.id === (focusWaveId ?? activeId)) ?? waves[0];
	if (!wave) return null;
	return (
		<section
			aria-label={`${wave.label} wave actions`}
			className="trellis-whiteboard-wave-controls absolute top-4 left-4 z-10 w-96 max-w-[calc(100%-2rem)] rounded-xl border border-border bg-surface py-2 shadow-md"
		>
			{wave.content}
			<p className="px-5 pt-1 text-xs text-fg-muted">Select a wave on the board to show its actions.</p>
		</section>
	);
}
