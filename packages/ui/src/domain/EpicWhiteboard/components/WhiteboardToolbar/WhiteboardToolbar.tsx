import {
	ArrowClockwise,
	ArrowCounterClockwise,
	ArrowRight,
	ArrowsOut,
	Cursor,
	Eraser,
	FrameCorners,
	GitBranch,
	Hand,
	PencilSimple,
	Robot,
	TextT,
	Ticket,
} from "@phosphor-icons/react";
import { type Editor, useValue } from "tldraw";
import { IconButton } from "../../../../primitives/IconButton";
import { Tooltip } from "../../../../primitives/Tooltip";
import { createWaveFromSelection, whiteboardWaveSelection } from "../../whiteboardWaveSelection";

const tools = [
	{ id: "select", label: "Select", key: "V", icon: <Cursor /> },
	{ id: "hand", label: "Move canvas", key: "H", icon: <Hand /> },
	{ id: "ticket", label: "Ticket", key: "T", icon: <Ticket /> },
	{ id: "session", label: "Session", key: "S", icon: <Robot /> },
	{ id: "connection", label: "Dependency", key: "X", icon: <GitBranch /> },
	{ id: "draw", label: "Draw", key: "D", icon: <PencilSimple /> },
	{ id: "arrow", label: "Sketch arrow", key: "A", icon: <ArrowRight /> },
	{ id: "text", label: "Text", key: "Shift+T", icon: <TextT /> },
	{ id: "eraser", label: "Erase drawing", key: "E", icon: <Eraser /> },
];

export function WhiteboardToolbar({ editor, readOnly }: { editor: Editor; readOnly: boolean }) {
	const state = useValue(
		"whiteboard tools",
		() => ({
			tool: editor.getCurrentToolId(),
			undo: editor.canUndo(),
			redo: editor.canRedo(),
			canCreateWave: whiteboardWaveSelection(editor) !== null,
		}),
		[editor],
	);
	return (
		<div
			role="toolbar"
			aria-label="Whiteboard tools"
			className="absolute bottom-4 left-1/2 z-10 flex max-w-full -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-round border border-border bg-surface p-2 shadow-md"
		>
			{tools
				.filter((tool) => !readOnly || tool.id === "select" || tool.id === "hand")
				.map((tool) => (
					<Tooltip
						key={tool.id}
						content={`${tool.label} (${tool.key})`}
						description={
							tool.id === "connection" ? "Drag from a prerequisite to the ticket that waits for it." : undefined
						}
					>
						<IconButton
							label={tool.label}
							icon={tool.icon}
							pressed={state.tool === tool.id}
							aria-keyshortcuts={tool.key}
							onClick={() => editor.setCurrentTool(tool.id).focus()}
						/>
					</Tooltip>
				))}
			{!readOnly && (
				<>
					<Tooltip content="Wave from selection (W)">
						<IconButton
							label="Wave from selection"
							icon={<FrameCorners />}
							aria-keyshortcuts="W"
							disabled={!state.canCreateWave}
							onClick={() => createWaveFromSelection(editor)}
						/>
					</Tooltip>
					<Tooltip content="Undo">
						<IconButton
							label="Undo"
							icon={<ArrowCounterClockwise />}
							disabled={!state.undo}
							onClick={() => editor.undo()}
						/>
					</Tooltip>
					<Tooltip content="Redo">
						<IconButton label="Redo" icon={<ArrowClockwise />} disabled={!state.redo} onClick={() => editor.redo()} />
					</Tooltip>
				</>
			)}
			<Tooltip content="Fit whiteboard">
				<IconButton
					label="Fit whiteboard"
					icon={<ArrowsOut />}
					onClick={() => editor.zoomToFit({ animation: { duration: 0 } })}
				/>
			</Tooltip>
		</div>
	);
}
