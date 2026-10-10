import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d, T } from "tldraw";
import type { WaveShape } from "./types";
import { useWhiteboardContent } from "./whiteboardContext";

function WaveShapeContent({ shape }: { shape: WaveShape }) {
	const { waves } = useWhiteboardContent();
	const wave = waves.find((entry) => entry.id === shape.props.recordId);
	return (
		<HTMLContainer className="trellis-whiteboard-wave" data-whiteboard-wave={shape.props.recordId}>
			<div className="h-full rounded-xl border border-border-strong bg-band/40">
				<div className="flex items-center gap-3 px-6 py-5 text-base font-medium">
					<span className="min-w-0 flex-1 truncate">{wave?.label}</span>
					<span className="shrink-0 text-fg-muted tabular">{wave?.count}</span>
				</div>
			</div>
		</HTMLContainer>
	);
}

export class WaveShapeUtil extends BaseBoxShapeUtil<WaveShape> {
	static override type = "trellis-wave" as const;
	static override props = { w: T.number, h: T.number, recordId: T.string };
	getDefaultProps() {
		return { w: 368, h: 304, recordId: "" };
	}
	override getGeometry(shape: WaveShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
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
	component(shape: WaveShape) {
		return <WaveShapeContent shape={shape} />;
	}
	getIndicatorPath(shape: WaveShape) {
		const path = new Path2D();
		path.rect(0, 0, shape.props.w, shape.props.h);
		return path;
	}
}
