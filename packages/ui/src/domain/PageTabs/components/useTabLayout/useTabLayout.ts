import { useCallback, useLayoutEffect, useRef, useState } from "react";

// Scrolls the tab at `left` into view. If a tab exceeds the visible width,
// keep its left edge visible so the start of its name remains readable.
export const revealTab = (element: HTMLElement, left: number, width: number) => {
	if (left + width > element.scrollLeft + element.clientWidth) element.scrollLeft = left + width - element.clientWidth;
	if (left < element.scrollLeft) element.scrollLeft = left;
};

// The tabs of one scrolling region that are worth a mount: the tabs near the
// viewport plus the active tab. Every tab of the region has the same width.
// A `fixedWidth` keeps that width; without one the width follows the
// viewport, between 132 and 240 px.
export function useTabLayout(tabs: readonly { id: string }[], activeIndex: number, fixedWidth?: number) {
	const count = tabs.length;
	const ref = useRef<HTMLDivElement>(null);
	const [layout, setLayout] = useState({
		width: fixedWidth ?? 200,
		start: Math.max(0, activeIndex - 2),
		end: Math.min(count, activeIndex + 3),
	});
	const measure = useCallback(
		(reveal: boolean) => {
			const count = tabs.length;
			const element = ref.current!;
			const width = fixedWidth ?? Math.min(240, Math.max(132, element.clientWidth / Math.max(1, count)));
			if (reveal && activeIndex >= 0) revealTab(element, activeIndex * width, width);
			const start = Math.max(0, Math.floor(element.scrollLeft / width) - 2);
			const end = Math.min(count, Math.ceil((element.scrollLeft + element.clientWidth) / width) + 2);
			setLayout((current) =>
				current.width === width && current.start === start && current.end === end ? current : { width, start, end },
			);
		},
		[tabs, activeIndex, fixedWidth],
	);
	useLayoutEffect(() => {
		measure(true);
		const observer = new ResizeObserver(() => measure(true));
		observer.observe(ref.current!);
		return () => observer.disconnect();
	}, [measure]);
	useLayoutEffect(() => {
		const element = ref.current!;
		const left = activeIndex * layout.width;
		if (activeIndex >= 0) revealTab(element, left, layout.width);
		measure(false);
	}, [layout.width, activeIndex, measure]);
	const indexes = Array.from(
		{ length: Math.max(0, layout.end - layout.start) },
		(_, offset) => layout.start + offset,
	).filter((index) => index < count);
	if (activeIndex >= 0 && !indexes.includes(activeIndex)) indexes.push(activeIndex);
	return { ref, width: layout.width, indexes: indexes.sort((a, b) => a - b), onScroll: () => measure(false) };
}
