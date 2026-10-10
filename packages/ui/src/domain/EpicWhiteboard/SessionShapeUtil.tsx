import { BaseBoxShapeUtil, HTMLContainer, T, useEditor } from "tldraw";
import { Avatar } from "../../primitives/Avatar";
import { type SessionShape, whiteboardActions } from "./types";
import { useWhiteboardContent } from "./whiteboardContext";

function SessionContent({ shape }: { shape: SessionShape }) {
	const editor = useEditor();
	const { sessions } = useWhiteboardContent();
	const session = sessions.find((entry) => entry.id === shape.props.runId);
	const name = session?.label ?? shape.props.label;
	return (
		<HTMLContainer
			data-whiteboard-session={shape.props.runId}
			className="relative flex h-full flex-col items-center gap-2"
		>
			<Avatar
				kind="agent"
				name={name}
				agentProfile={session?.profile}
				state={session?.state}
				status={session?.status}
				tooltip={false}
				className="size-16"
			/>
			<span className="max-w-full truncate rounded-sm bg-bg px-1 text-sm">{name}</span>
			<a
				href={shape.props.sessionId ? `/sessions/${shape.props.sessionId}` : `#${shape.props.runId}`}
				aria-label={`Open session ${name}`}
				className="pointer-events-none absolute inset-0 rounded-round focus-visible:outline-2 focus-visible:outline-accent"
				onClick={(event) => {
					if (event.detail !== 0) return;
					event.preventDefault();
					whiteboardActions.get(editor)!.onOpenSession(shape.props.runId);
				}}
			>
				<span className="sr-only">Open session {name}</span>
			</a>
		</HTMLContainer>
	);
}

export class SessionShapeUtil extends BaseBoxShapeUtil<SessionShape> {
	static override type = "trellis-session" as const;
	static override props = { w: T.number, h: T.number, runId: T.string, sessionId: T.string, label: T.string };
	getDefaultProps() {
		return { w: 160, h: 112, runId: "", sessionId: "", label: "" };
	}
	override canEdit() {
		return false;
	}
	override canResize() {
		return false;
	}
	override canReceiveNewChildrenOfType() {
		return false;
	}
	override hideRotateHandle() {
		return true;
	}
	component(shape: SessionShape) {
		return <SessionContent shape={shape} />;
	}
	getIndicatorPath(shape: SessionShape) {
		const path = new Path2D();
		path.rect(0, 0, shape.props.w, shape.props.h);
		return path;
	}
	override onClick(shape: SessionShape) {
		if (this.editor.inputs.getShiftKey() || this.editor.inputs.getAccelKey()) return;
		whiteboardActions.get(this.editor)!.onOpenSession(shape.props.runId);
	}
}
