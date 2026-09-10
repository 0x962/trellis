import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, useRef } from "react";

export type ResizeHandleProps = {
	width: number;
	// Runs on every move with the new width.
	onResize: (width: number) => void;
	// Runs when the drag ends, with the width to store.
	onCommit: (width: number) => void;
};

export const minPeekWidth = 480;
// The arrow keys move the edge by this many px.
const keyStep = 16;

// The strip on the page-facing edge of the peek. A drag to the left widens
// the peek. The arrow keys do the same from the keyboard.
export function ResizeHandle({ width, onResize, onCommit }: ResizeHandleProps) {
	const start = useRef<{ x: number; width: number } | null>(null);

	const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		start.current = { x: event.clientX, width };
		const onMove = (move: PointerEvent) => {
			const origin = start.current;
			if (origin === null) return;
			onResize(Math.max(minPeekWidth, origin.width + (origin.x - move.clientX)));
		};
		const onUp = (up: PointerEvent) => {
			const origin = start.current;
			start.current = null;
			document.removeEventListener("pointermove", onMove);
			document.removeEventListener("pointerup", onUp);
			if (origin !== null) onCommit(Math.max(minPeekWidth, origin.width + (origin.x - up.clientX)));
		};
		document.addEventListener("pointermove", onMove);
		document.addEventListener("pointerup", onUp);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		const delta = event.key === "ArrowLeft" ? keyStep : event.key === "ArrowRight" ? -keyStep : 0;
		if (delta === 0) return;
		event.preventDefault();
		const next = Math.max(minPeekWidth, width + delta);
		onResize(next);
		onCommit(next);
	};

	return (
		<button
			type="button"
			aria-label="Resize the peek"
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
			className="h-full w-1.5 cursor-col-resize bg-transparent transition-colors duration-hover hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
		/>
	);
}
