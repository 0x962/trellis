import {
	type MouseEvent,
	type PointerEvent,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { PageTabItem } from "../../PageTabs";

type Region = {
	ref: RefObject<HTMLDivElement | null>;
	// The width of one tab of the region.
	width: number;
	// The index in `tabs` of the first tab of the region.
	offset: number;
	count: number;
};

type Options = {
	tabs: readonly PageTabItem[];
	pinned: Region;
	unpinned: Region;
	enabled: boolean;
	move: (id: string, beforeId: string | null) => void;
};

// A pointer drag of one tab along the strip. The drag stays in the region
// its tab started in, and the drop position is an index into `tabs`. The
// strip scrolls while the pointer rests near either edge of the region.
export function useTabDrag({ tabs, pinned, unpinned, enabled, move }: Options) {
	const dragged = useRef<string | null>(null);
	const [draggedId, setDraggedId] = useState<string | null>(null);
	const dragX = useRef(0);
	const pointerStart = useRef<{ id: string; x: number } | null>(null);
	const suppressClick = useRef(false);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const draggedIndex = useMemo(
		() => (draggedId === null ? -1 : tabs.findIndex((tab) => tab.id === draggedId)),
		[tabs, draggedId],
	);
	const draggedPinned = draggedIndex >= 0 && draggedIndex < pinned.count;
	const positionFor = useCallback(
		(clientX: number, inPinned: boolean) => {
			const region = inPinned ? pinned : unpinned;
			const element = region.ref.current!;
			const position = Math.floor(
				(clientX - element.getBoundingClientRect().left + element.scrollLeft + region.width / 2) / region.width,
			);
			return region.offset + Math.max(0, Math.min(region.count, position));
		},
		[pinned, unpinned],
	);
	const pointerDown = (id: string, event: PointerEvent<HTMLButtonElement>) => {
		if (!enabled || event.button !== 0 || event.pointerType === "touch") return;
		pointerStart.current = { id, x: event.clientX };
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const onPointerMove = (event: PointerEvent) => {
		const start = pointerStart.current;
		if (!start || (Math.abs(event.clientX - start.x) < 6 && dragged.current === null)) return;
		dragged.current = start.id;
		setDraggedId(start.id);
		dragX.current = event.clientX;
		setDropIndex(positionFor(event.clientX, tabs.find((tab) => tab.id === start.id)!.pinned));
	};
	const onPointerUp = (event: PointerEvent) => {
		pointerStart.current = null;
		if (dragged.current === null) return;
		const id = dragged.current,
			index = positionFor(event.clientX, tabs.find((tab) => tab.id === id)!.pinned),
			before = tabs[index]?.id ?? null;
		dragged.current = null;
		setDraggedId(null);
		setDropIndex(null);
		suppressClick.current = true;
		if (before !== id && tabs[index - 1]?.id !== id) move(id, before);
	};
	const onPointerCancel = () => {
		pointerStart.current = null;
		dragged.current = null;
		setDraggedId(null);
		setDropIndex(null);
	};
	const onPointerDownCapture = () => {
		suppressClick.current = false;
	};
	const onClickCapture = (event: MouseEvent) => {
		if (suppressClick.current) {
			event.preventDefault();
			event.stopPropagation();
			suppressClick.current = false;
		}
	};

	useEffect(() => {
		if (dropIndex === null) return;
		let frame: number;
		const scroll = () => {
			const element = (draggedPinned ? pinned : unpinned).ref.current!;
			const bounds = element.getBoundingClientRect();
			const delta = dragX.current < bounds.left + 28 ? -12 : dragX.current > bounds.right - 28 ? 12 : 0;
			if (delta) {
				element.scrollLeft += delta;
				setDropIndex(positionFor(dragX.current, draggedPinned));
			}
			frame = requestAnimationFrame(scroll);
		};
		frame = requestAnimationFrame(scroll);
		return () => cancelAnimationFrame(frame);
	}, [dropIndex, draggedPinned, pinned, unpinned, positionFor]);

	return {
		draggedIndex,
		draggedPinned,
		dropIndex,
		pointerDown,
		listHandlers: { onPointerDownCapture, onPointerMove, onPointerUp, onPointerCancel, onClickCapture },
	};
}
