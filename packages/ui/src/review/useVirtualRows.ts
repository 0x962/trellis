import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";

type Viewport = { top: number; height: number };

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

export function useVirtualRows(
	viewportRef: RefObject<HTMLElement | null>,
	sizes: readonly number[],
	overscan = 12,
) {
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
	const scrollToIndex = useCallback(
		(index: number) => {
			const top = layout.offsets[index]!;
			viewportRef.current!.scrollTop = top;
			setViewport((current) => ({ ...current, top }));
		},
		[layout, viewportRef],
	);
	return { ...visible, scrollToIndex };
}
