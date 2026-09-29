import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

const scrollParentOf = (node: HTMLElement): HTMLElement | null => {
	for (let element = node.parentElement; element !== null; element = element.parentElement) {
		const overflow = getComputedStyle(element).overflowY;
		if (overflow === "auto" || overflow === "scroll") return element;
	}
	return null;
};

export function useResultVirtualizer(items: readonly { id: string }[], rowHeight: number) {
	const list = useRef<HTMLUListElement>(null);
	const [scroller, setScroller] = useState<{ element: HTMLElement; margin: number } | null>(null);
	const [focusedId, setFocusedId] = useState<string>();
	useLayoutEffect(() => {
		const element = scrollParentOf(list.current!);
		if (element === null) return;
		const measure = () => {
			const margin =
				list.current!.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
			setScroller((current) =>
				current !== null && current.element === element && current.margin === margin ? current : { element, margin },
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		for (let parent = list.current!.parentElement; parent !== null; parent = parent.parentElement) {
			for (const child of parent.children) observer.observe(child);
			if (parent === element) break;
		}
		element.addEventListener("scroll", measure, { passive: true });
		return () => {
			observer.disconnect();
			element.removeEventListener("scroll", measure);
		};
	}, []);
	const indexes = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items]);
	const focusedIndex = focusedId === undefined ? undefined : indexes.get(focusedId);
	const rangeExtractor = useCallback(
		(range: Parameters<typeof defaultRangeExtractor>[0]) => {
			const drawn = [...defaultRangeExtractor(range), 0, items.length - 1];
			if (focusedIndex !== undefined) drawn.push(focusedIndex - 1, focusedIndex, focusedIndex + 1);
			return [...new Set(drawn)]
				.filter((index) => index >= 0 && index < items.length)
				.sort((left, right) => left - right);
		},
		[focusedIndex, items.length],
	);
	const getItemKey = useCallback((index: number) => items[index]!.id, [items]);
	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => scroller?.element ?? null,
		estimateSize: () => rowHeight,
		scrollMargin: scroller?.margin ?? 0,
		enabled: scroller !== null,
		overscan: 8,
		getItemKey,
		rangeExtractor,
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: A width change changes rowHeight and invalidates stored measurements.
	useLayoutEffect(() => {
		virtualizer.measure();
	}, [rowHeight, virtualizer]);
	return { list, virtualizer, setFocusedId };
}
