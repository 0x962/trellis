import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Viewport = { top: number; height: number };

// How many times the box goes back to the row it owes the reader.
const MAX_TRIES = 10;

const firstVisible = (offsets: number[], value: number) => {
	let low = 0;
	let high = offsets.length - 1;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (offsets[middle]! < value) low = middle + 1;
		else high = middle;
	}
	return Math.max(0, low - 1);
};

export function useVirtualRows(viewportRef: RefObject<HTMLElement | null>, sizes: readonly number[], overscan = 12) {
	const [viewport, setViewport] = useState<Viewport>({ top: 0, height: 600 });
	const layout = useMemo(() => {
		const offsets = [0];
		for (const size of sizes) offsets.push(offsets.at(-1)! + size);
		return { offsets, total: offsets.at(-1)! };
	}, [sizes]);
	useEffect(() => {
		const element = viewportRef.current!;
		const update = () => setViewport({ top: element.scrollTop, height: element.clientHeight });
		update();
		element.addEventListener("scroll", update, { passive: true });
		window.addEventListener("resize", update);
		// A box that is `display: none` at the first read has a height of 0, and
		// it draws only the overscan rows when it appears. The review page hides
		// the diff behind the Files button on a phone, and that tap fires neither
		// a scroll nor a window resize. The observer measures the box itself.
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => {
			element.removeEventListener("scroll", update);
			window.removeEventListener("resize", update);
			observer.disconnect();
		};
	}, [viewportRef]);
	const visible = useMemo(() => {
		const start = Math.max(0, firstVisible(layout.offsets, viewport.top) - overscan);
		const end = Math.min(
			sizes.length,
			firstVisible(layout.offsets, viewport.top + Math.max(viewport.height, 1)) + overscan + 1,
		);
		return {
			start,
			end,
			before: layout.offsets[start]!,
			after: layout.total - layout.offsets[end]!,
		};
	}, [layout, overscan, sizes.length, viewport]);
	// The box scrolls to a row by the total height of the rows above it, and
	// that total counts an estimate for every row the box has not drawn yet.
	// A row that draws reports its real height, which moves every row under
	// it, so the row the box just went to slides away. `target` holds the row
	// the box owes the reader, and every new set of heights puts that row back
	// under the top edge. `applied` is the place the box was put last: a
	// different place means the reader scrolled, and the box is theirs again.
	const target = useRef<{ index: number; applied: number; tries: number } | null>(null);
	const goTo = useCallback(
		(index: number) => {
			const top = layout.offsets[index]!;
			const element = viewportRef.current!;
			element.scrollTop = top;
			setViewport((current) => ({ ...current, top }));
			return element.scrollTop;
		},
		[layout, viewportRef],
	);
	const scrollToIndex = useCallback(
		(index: number) => {
			target.current = { index, applied: goTo(index), tries: 0 };
		},
		[goTo],
	);
	// `goTo` is a new function for every new set of heights, so this runs
	// each time a drawn row corrects one. A row whose height never settles
	// stops moving the box after MAX_TRIES of those corrections.
	useEffect(() => {
		const owed = target.current;
		if (owed === null) return;
		if (owed.tries >= MAX_TRIES || viewportRef.current!.scrollTop !== owed.applied) {
			target.current = null;
			return;
		}
		target.current = { index: owed.index, applied: goTo(owed.index), tries: owed.tries + 1 };
	}, [goTo, viewportRef]);
	return { ...visible, scrollToIndex };
}
