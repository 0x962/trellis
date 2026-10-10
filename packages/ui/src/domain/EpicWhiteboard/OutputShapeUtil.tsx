import { BaseBoxShapeUtil, HTMLContainer, T, useEditor } from "tldraw";
import { Avatar } from "../../primitives/Avatar";
import { PrGlyph } from "../PrGlyph";
import { ticketCardFrame } from "../ticketCardFrame";
import type { OutputShape } from "./outputTypes";
import { whiteboardActions } from "./types";
import { useWhiteboardContent } from "./whiteboardContext";

function OutputContent({ shape }: { shape: OutputShape }) {
	const editor = useEditor();
	const { outputs } = useWhiteboardContent();
	const output =
		outputs.find((entry) => entry.id === shape.props.recordId) ??
		(shape.props.kind === "subagent"
			? { id: shape.props.recordId, label: shape.props.label, kind: "subagent" as const, profile: undefined }
			: null);
	if (!output) return null;
	return (
		<HTMLContainer data-whiteboard-output={output.id} className="h-full w-full">
			{output.kind === "pull-request" ? (
				<div className={`${ticketCardFrame} h-full gap-2 border-border bg-surface shadow-sm`}>
					<div className="flex items-center gap-2 text-sm text-fg-muted tabular">
						<PrGlyph
							state={output.state}
							askedForReview={output.askedForReview}
							locallyApproved={output.locallyApproved}
							tooltip={false}
						/>
						<span className="truncate">{output.label}</span>
					</div>
					<p className="line-clamp-3 text-base font-medium">{output.title}</p>
				</div>
			) : (
				<div className="flex h-full flex-col items-center gap-2">
					<Avatar kind="agent" name={output.label} agentProfile={output.profile} tooltip={false} className="size-16" />
					<span className="max-w-full truncate rounded-sm bg-bg px-1 text-sm">{output.label}</span>
				</div>
			)}
			<a
				href={output.kind === "pull-request" ? output.url : `#${output.id}`}
				className="pointer-events-none absolute inset-0 rounded-md focus-visible:outline-2 focus-visible:outline-accent"
				onClick={(event) => {
					if (event.detail !== 0) return;
					event.preventDefault();
					whiteboardActions.get(editor)!.onOpenOutput(output.id);
				}}
			>
				<span className="sr-only">Open {output.label}</span>
			</a>
		</HTMLContainer>
	);
}

export class OutputShapeUtil extends BaseBoxShapeUtil<OutputShape> {
	static override type = "trellis-output" as const;
	static override props = {
		w: T.number,
		h: T.number,
		recordId: T.string,
		label: T.string,
		kind: T.literalEnum("pull-request", "subagent"),
	};
	getDefaultProps() {
		return { w: 280, h: 144, recordId: "", label: "", kind: "pull-request" as const };
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
	component(shape: OutputShape) {
		return <OutputContent shape={shape} />;
	}
	getIndicatorPath(shape: OutputShape) {
		const path = new Path2D();
		path.rect(0, 0, shape.props.w, shape.props.h);
		return path;
	}
	override onClick(shape: OutputShape) {
		if (this.editor.inputs.getShiftKey() || this.editor.inputs.getAccelKey()) return;
		whiteboardActions.get(this.editor)!.onOpenOutput(shape.props.recordId);
	}
}
