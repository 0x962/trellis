import { type PointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";

type Options = {
	listRef: RefObject<HTMLDivElement | null>;
	slotWidth: number;
	slotCount: number;
	enabled: boolean;
	// Runs when a drag ends on a slot index other than the origin of the tab.
	onDrop: (id: string, index: number) => void;
};

// The pointer drag of one tab along the strip. A drag starts after 6 px of
// travel, so a click stays a click. While a drag runs, the strip scrolls
// itself when the pointer sits within 28 px of either edge.
export function useTabDrag({ listRef, slotWidth, slotCount, enabled, onDrop }: Options) {
	const dragged = useRef<string | null>(null);
	const [draggedId, setDraggedId] = useState<string | null>(null);
	const dragX = useRef(0);
	const pointerStart = useRef<{ id: string; x: number } | null>(null);
	const suppressClick = useRef(false);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const positionFor = useCallback(
		(clientX: number) => {
			const element = listRef.current!;
			const offset = clientX - element.getBoundingClientRect().left + element.scrollLeft + slotWidth / 2;
			return Math.max(0, Math.min(slotCount, Math.floor(offset / slotWidth)));
		},
		[listRef, slotWidth, slotCount],
	);
	const reset = () => {
		pointerStart.current = null;
		dragged.current = null;
		setDraggedId(null);
		setDropIndex(null);
	};
	const pointerDown = (id: string, event: PointerEvent<HTMLButtonElement>) => {
		if (!enabled || event.button !== 0 || event.pointerType === "touch") return;
		pointerStart.current = { id, x: event.clientX };
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const pointerMove = (event: PointerEvent) => {
		const start = pointerStart.current;
		if (!start || (Math.abs(event.clientX - start.x) < 6 && dragged.current === null)) return;
		dragged.current = start.id;
		setDraggedId(start.id);
		dragX.current = event.clientX;
		setDropIndex(positionFor(event.clientX));
	};
	const pointerEnd = (event: PointerEvent) => {
		pointerStart.current = null;
		if (dragged.current === null) return;
		const id = dragged.current;
		const index = positionFor(event.clientX);
		dragged.current = null;
		setDraggedId(null);
		setDropIndex(null);
		suppressClick.current = true;
		onDrop(id, index);
	};

	useEffect(() => {
		if (dropIndex === null) return;
		let frame: number;
		const scroll = () => {
			const element = listRef.current!;
			const bounds = element.getBoundingClientRect();
			const delta = dragX.current < bounds.left + 28 ? -12 : dragX.current > bounds.right - 28 ? 12 : 0;
			if (delta) {
				element.scrollLeft += delta;
				setDropIndex(positionFor(dragX.current));
			}
			frame = requestAnimationFrame(scroll);
		};
		frame = requestAnimationFrame(scroll);
		return () => cancelAnimationFrame(frame);
	}, [dropIndex, listRef, positionFor]);

	return {
		draggedId,
		dropIndex,
		pointerDown,
		listHandlers: {
			onPointerDownCapture: () => {
				suppressClick.current = false;
			},
			onPointerMove: pointerMove,
			onPointerUp: pointerEnd,
			onPointerCancel: reset,
			onClickCapture: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
				if (suppressClick.current) {
					event.preventDefault();
					event.stopPropagation();
					suppressClick.current = false;
				}
			},
		},
	};
}
