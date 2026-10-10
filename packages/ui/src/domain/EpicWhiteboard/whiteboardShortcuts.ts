import type { KeyboardEvent } from "react";
import type { Editor, TLUiOverrides } from "tldraw";
import { isTextEntry } from "../../utils/isTextEntry";
import { createWaveFromSelection } from "./whiteboardWaveSelection";

export const whiteboardOverrides: TLUiOverrides = {
	tools: (_editor, tools) => ({
		...tools,
		text: { ...tools.text!, kbd: undefined },
		draw: { ...tools.draw!, kbd: "d,b" },
	}),
};

export function whiteboardShortcut(event: KeyboardEvent<HTMLElement>, editor: Editor) {
	if (
		event.defaultPrevented ||
		event.repeat ||
		event.metaKey ||
		event.ctrlKey ||
		event.altKey ||
		editor.getIsReadonly() ||
		editor.getEditingShapeId() ||
		isTextEntry(event.target) ||
		!(event.target as HTMLElement).closest(".tl-container")
	)
		return;
	const key = event.key.toLowerCase();
	if (key === "w" && !event.shiftKey) {
		event.preventDefault();
		event.stopPropagation();
		createWaveFromSelection(editor);
		return;
	}
	const tool =
		key === "t"
			? event.shiftKey
				? "text"
				: "ticket"
			: event.shiftKey
				? null
				: key === "x"
					? "connection"
					: key === "s"
						? "session"
						: null;
	if (!tool) return;
	event.preventDefault();
	event.stopPropagation();
	editor.setCurrentTool(tool);
}
