import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMediaQuery } from "../../../../hooks/useMediaQuery";
import type { SessionStatusPaneProps } from "../../types";

type Drag = { pointerId: number; element: HTMLDivElement; startX: number; startWidth: number };

export function useStatusPaneResize(resize: SessionStatusPaneProps["resize"]) {
	const pane = useRef<HTMLElement>(null);
	const drag = useRef<Drag | null>(null);
	const [parentWidth, setParentWidth] = useState<number | null>(null);
	const [draft, setDraft] = useState<number | null>(null);
	const narrow = useMediaQuery("(width < 48rem)");
	const enabled = resize !== undefined;
	const min = parentWidth === null ? 280 : Math.min(280, Math.floor(parentWidth / 2));
	const max = parentWidth === null ? 374 : Math.max(min, parentWidth - 320);
	const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));
	const width = clamp(draft ?? resize?.width ?? 374);
	const available = enabled && parentWidth !== null && !narrow;
	const dragging = draft !== null;

	const release = useCallback(() => {
		const current = drag.current;
		drag.current = null;
		if (current?.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId);
		return current;
	}, []);
	const cancel = useCallback(() => {
		release();
		setDraft(null);
	}, [release]);

	useLayoutEffect(() => {
		if (!enabled) return;
		const parent = pane.current!.parentElement!;
		const measure = () => setParentWidth(parent.clientWidth);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(parent);
		return () => observer.disconnect();
	}, [enabled]);

	useLayoutEffect(() => {
		if (narrow || !enabled) cancel();
	}, [cancel, narrow, enabled]);
	useEffect(() => () => void release(), [release]);
	useEffect(() => {
		if (!dragging) return;
		const escape = (event: globalThis.KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			cancel();
		};
		window.addEventListener("blur", cancel);
		window.addEventListener("keydown", escape, true);
		return () => {
			window.removeEventListener("blur", cancel);
			window.removeEventListener("keydown", escape, true);
		};
	}, [dragging, cancel]);

	const move = (event: PointerEvent<HTMLDivElement>) => {
		const current = drag.current;
		if (current?.pointerId !== event.pointerId) return;
		setDraft(clamp(current.startWidth + current.startX - event.clientX));
	};
	const finish = (event: PointerEvent<HTMLDivElement>) => {
		if (drag.current?.pointerId !== event.pointerId) return;
		const current = release()!;
		resize!.onWidthChange(clamp(current.startWidth + current.startX - event.clientX));
		setDraft(null);
	};
	const abort = (event: PointerEvent<HTMLDivElement>) => {
		if (drag.current?.pointerId === event.pointerId) cancel();
	};
	const start = (event: PointerEvent<HTMLDivElement>) => {
		if (!available || min === max || event.button !== 0 || !event.isPrimary || drag.current !== null) return;
		event.preventDefault();
		event.currentTarget.focus({ preventScroll: true });
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { pointerId: event.pointerId, element: event.currentTarget, startX: event.clientX, startWidth: width };
		setDraft(width);
	};
	const key = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!available || min === max || drag.current !== null || event.altKey || event.ctrlKey || event.metaKey) return;
		const step = event.shiftKey ? 64 : 16;
		const values: Record<string, number> = { ArrowLeft: width + step, ArrowRight: width - step, Home: min, End: max };
		const value = values[event.key];
		if (value === undefined) return;
		event.preventDefault();
		event.stopPropagation();
		resize!.onWidthChange(clamp(value));
	};

	return {
		pane,
		width: available ? width : undefined,
		handle: available
			? {
					value: width,
					min,
					max,
					active: draft !== null,
					onPointerDown: start,
					onPointerMove: move,
					onPointerUp: finish,
					onPointerCancel: abort,
					onLostPointerCapture: abort,
					onKeyDown: key,
				}
			: null,
	};
}
