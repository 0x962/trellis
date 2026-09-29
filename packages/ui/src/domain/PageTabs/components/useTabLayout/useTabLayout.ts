import { useCallback, useLayoutEffect, useRef, useState } from "react";

export function useTabLayout(tabs: readonly unknown[], activeIndex: number) {
	const count = tabs.length;
	const ref = useRef<HTMLDivElement>(null);
	const [layout, setLayout] = useState({
		width: 200,
		start: Math.max(0, activeIndex - 2),
		end: Math.min(count, activeIndex + 3),
	});
	const measure = useCallback(
		(reveal: boolean) => {
			const count = tabs.length;
			const element = ref.current!;
			const width = Math.min(240, Math.max(132, element.clientWidth / Math.max(1, count)));
			if (reveal && activeIndex >= 0) {
				const left = activeIndex * width;
				if (left < element.scrollLeft) element.scrollLeft = left;
				if (left + width > element.scrollLeft + element.clientWidth)
					element.scrollLeft = left + width - element.clientWidth;
			}
			const start = Math.max(0, Math.floor(element.scrollLeft / width) - 2);
			const end = Math.min(count, Math.ceil((element.scrollLeft + element.clientWidth) / width) + 2);
			setLayout((current) =>
				current.width === width && current.start === start && current.end === end ? current : { width, start, end },
			);
		},
		[tabs, activeIndex],
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
		if (activeIndex >= 0) {
			if (left < element.scrollLeft) element.scrollLeft = left;
			if (left + layout.width > element.scrollLeft + element.clientWidth)
				element.scrollLeft = left + layout.width - element.clientWidth;
		}
		measure(false);
	}, [layout.width, activeIndex, measure]);
	const indexes = Array.from(
		{ length: Math.max(0, layout.end - layout.start) },
		(_, offset) => layout.start + offset,
	).filter((index) => index < count);
	if (activeIndex >= 0 && !indexes.includes(activeIndex)) indexes.push(activeIndex);
	return { ref, width: layout.width, indexes: indexes.sort((a, b) => a - b), onScroll: () => measure(false) };
}
