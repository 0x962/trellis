export type DragPointer = {
	clientX: number;
	clientY: number;
};

export type DragPreviewFrame = {
	left: number;
	top: number;
	width: number;
	height: number;
	offsetX: number;
	offsetY: number;
};

export function dragPreviewFrame(
	rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
	pointer: DragPointer,
): DragPreviewFrame {
	return {
		left: rect.left,
		top: rect.top,
		width: rect.width,
		height: rect.height,
		offsetX: pointer.clientX - rect.left,
		offsetY: pointer.clientY - rect.top,
	};
}

export function dragPreviewPosition(frame: DragPreviewFrame, pointer: DragPointer) {
	return {
		left: pointer.clientX - frame.offsetX,
		top: pointer.clientY - frame.offsetY,
	};
}

export function dragPreviewRotation(frame: DragPreviewFrame, pointer: DragPointer, previous: DragPointer) {
	const gravity = ((frame.width / 2 - frame.offsetX) / frame.width) * 4;
	const momentum = (pointer.clientX - previous.clientX) * 0.25;
	return Math.max(-8, Math.min(8, gravity + momentum));
}
